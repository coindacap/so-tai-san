/**
 * Tự động lấy giá:
 * - Coin: Binance spot (SYMBOLUSDT)
 * - USDT/VND: Binance P2P (fallback CoinGecko / USD-VND)
 * - Vàng nhẫn 9999: ước từ giá vàng thế giới (XAU) → đ/chỉ (tạm)
 */

const BINANCE = 'https://api.binance.com/api/v3'
const BINANCE_P2P =
  'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search'
const GOLD_API = 'https://api.gold-api.com/price/XAU'
const COINGECKO =
  'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=vnd'
const USD_JSON =
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json'

const OZ_TO_G = 31.1034768
/** 1 chỉ vàng ta = 3.75 gram */
const CHI_G = 3.75

export type LivePricesResult = {
  usdtVnd: number | null
  usdtLabel: string
  goldBid: number | null
  goldAsk: number | null
  goldLabel: string
  /** symbol coin (BTC, ETH, …) → giá USDT */
  coins: Record<string, number>
  fetchedAt: string
  notes: string[]
  errors: string[]
}

function median(nums: number[]): number | null {
  if (!nums.length) return null
  const a = [...nums].sort((x, y) => x - y)
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2
}

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = 12_000,
): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(t)
  }
}

/** Giá coin Binance: BTC → BTCUSDT */
export async function fetchBinanceCoinPrices(
  symbols: string[],
): Promise<Record<string, number>> {
  const uniq = [
    ...new Set(
      symbols
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s && s !== 'USDT' && s !== 'VND'),
    ),
  ]
  if (!uniq.length) return {}

  const pairs = uniq.map((s) => `${s}USDT`)
  const qs = encodeURIComponent(JSON.stringify(pairs))
  type Row = { symbol: string; price: string }
  const rows = await fetchJson<Row[]>(`${BINANCE}/ticker/price?symbols=${qs}`)
  const out: Record<string, number> = {}
  for (const r of rows) {
    const base = r.symbol.replace(/USDT$/, '')
    const p = Number(r.price)
    if (Number.isFinite(p) && p > 0) out[base] = p
  }
  // fallback từng symbol nếu bulk fail partial
  if (Object.keys(out).length < uniq.length) {
    await Promise.all(
      uniq
        .filter((s) => out[s] == null)
        .map(async (s) => {
          try {
            const r = await fetchJson<Row>(
              `${BINANCE}/ticker/price?symbol=${s}USDT`,
            )
            const p = Number(r.price)
            if (Number.isFinite(p) && p > 0) out[s] = p
          } catch {
            /* skip */
          }
        }),
    )
  }
  return out
}

/** USDT/VND từ Binance P2P (median top ads) */
async function fetchUsdtVndBinanceP2p(): Promise<{
  price: number
  label: string
} | null> {
  async function side(tradeType: 'BUY' | 'SELL'): Promise<number[]> {
    const body = {
      fiat: 'VND',
      page: 1,
      rows: 8,
      tradeType,
      asset: 'USDT',
      countries: [] as string[],
      proMerchantAds: false,
      shieldMerchantAds: false,
      publisherType: null as null,
      payTypes: [] as string[],
      classifies: ['mass'],
    }
    type Resp = {
      data?: { adv?: { price?: string } }[]
    }
    const data = await fetchJson<Resp>(BINANCE_P2P, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (data.data || [])
      .map((a) => Number(a.adv?.price))
      .filter((n) => Number.isFinite(n) && n > 10_000 && n < 100_000)
  }

  try {
    // BUY = user mua USDT (giá cao hơn một chút), SELL = user bán USDT
    const [buy, sell] = await Promise.all([side('BUY'), side('SELL')])
    const buyMed = median(buy)
    const sellMed = median(sell)
    if (buyMed && sellMed) {
      // Mid market P2P — gần giá thực giao
      const mid = Math.round((buyMed + sellMed) / 2)
      return { price: mid, label: 'Binance P2P' }
    }
    if (buyMed) return { price: Math.round(buyMed), label: 'Binance P2P mua' }
    if (sellMed) return { price: Math.round(sellMed), label: 'Binance P2P bán' }
    return null
  } catch {
    return null
  }
}

async function fetchUsdtVndFallback(): Promise<{
  price: number
  label: string
} | null> {
  try {
    const d = await fetchJson<{ tether?: { vnd?: number } }>(COINGECKO)
    const p = d.tether?.vnd
    if (p && p > 10_000) return { price: Math.round(p), label: 'CoinGecko' }
  } catch {
    /* fallthrough */
  }
  try {
    const d = await fetchJson<{ usd?: { vnd?: number } }>(USD_JSON)
    const p = d.usd?.vnd
    if (p && p > 10_000) return { price: Math.round(p), label: 'USD≈USDT' }
  } catch {
    /* fallthrough */
  }
  return null
}

/** Vàng: XAU/USD → đ/chỉ 9999 (ước thị trường, có spread mua/bán) */
async function fetchGoldNhanPerChi(usdtVnd: number | null): Promise<{
  bid: number
  ask: number
  label: string
} | null> {
  let usdVnd = usdtVnd
  if (!usdVnd || usdVnd < 10_000) {
    try {
      const d = await fetchJson<{ usd?: { vnd?: number } }>(USD_JSON)
      usdVnd = d.usd?.vnd ?? null
    } catch {
      usdVnd = null
    }
  }
  if (!usdVnd) return null

  try {
    const d = await fetchJson<{ price?: number }>(GOLD_API)
    const xauUsd = Number(d.price)
    if (!Number.isFinite(xauUsd) || xauUsd < 500) return null

    // Giá vàng nguyên liệu / chỉ (9999 ≈ pure)
    const mid = Math.round(xauUsd * usdVnd * (CHI_G / OZ_TO_G))
    // Spread tiệm nhẫn tham khảo (~0.4% / 0.6%) — tạm cho P/L
    const bid = Math.round(mid * 0.996)
    const ask = Math.round(mid * 1.006)
    return {
      bid,
      ask,
      label: 'Ước nhẫn 9999 (XAU→chỉ)',
    }
  } catch {
    return null
  }
}

/** Lấy toàn bộ giá live cho app */
export async function fetchLivePrices(
  coinSymbols: string[],
): Promise<LivePricesResult> {
  const notes: string[] = []
  const errors: string[] = []
  const fetchedAt = new Date().toISOString()

  let usdtVnd: number | null = null
  let usdtLabel = ''
  let goldBid: number | null = null
  let goldAsk: number | null = null
  let goldLabel = ''
  let coins: Record<string, number> = {}

  // USDT
  try {
    const p2p = await fetchUsdtVndBinanceP2p()
    if (p2p) {
      usdtVnd = p2p.price
      usdtLabel = p2p.label
      notes.push(`USDT ${usdtVnd.toLocaleString('vi-VN')}đ · ${usdtLabel}`)
    } else {
      const fb = await fetchUsdtVndFallback()
      if (fb) {
        usdtVnd = fb.price
        usdtLabel = fb.label
        notes.push(`USDT ${usdtVnd.toLocaleString('vi-VN')}đ · ${usdtLabel}`)
      } else {
        errors.push('Không lấy được USDT/VND')
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'Lỗi USDT')
  }

  // Coins
  try {
    coins = await fetchBinanceCoinPrices(coinSymbols)
    const n = Object.keys(coins).length
    if (n) notes.push(`Coin Binance: ${n} mã`)
    else if (coinSymbols.length)
      errors.push('Không lấy được giá coin trên Binance (kiểm tra mã SYMBOLUSDT)')
  } catch (e) {
    errors.push(
      e instanceof Error ? `Coin Binance: ${e.message}` : 'Lỗi coin Binance',
    )
  }

  // Gold
  try {
    const g = await fetchGoldNhanPerChi(usdtVnd)
    if (g) {
      goldBid = g.bid
      goldAsk = g.ask
      goldLabel = g.label
      notes.push(
        `Vàng ~${g.bid.toLocaleString('vi-VN')}–${g.ask.toLocaleString('vi-VN')} đ/chỉ · ${g.label}`,
      )
    } else {
      errors.push('Không lấy được giá vàng')
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'Lỗi vàng')
  }

  return {
    usdtVnd,
    usdtLabel,
    goldBid,
    goldAsk,
    goldLabel,
    coins,
    fetchedAt,
    notes,
    errors,
  }
}
