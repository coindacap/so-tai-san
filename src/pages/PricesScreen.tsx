import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { nowIso, moneyNum } from '../lib/format'
import { MoneyInput } from '../components/MoneyInput'
import { useAutoPrices } from '../hooks/useAutoPrices'

export function Prices() {
  const setQuote = useStore((s) => s.setQuote)
  const updateSettings = useStore((s) => s.updateSettings)
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const assets = useStore((s) => s.assets)
  const quotes = useStore((s) => s.quotes)
  const gold = assets.find((a) => a.symbol === 'NHAN9999')!
  const usdt = assets.find((a) => a.symbol === 'USDT')!
  const cryptos = assets.filter((a) => a.assetClass === 'crypto')
  const settings = useStore((s) => s.settings)
  const { refresh, status: autoStatus } = useAutoPrices(false)

  const [bid, setBid] = useState(String(quotes[gold.id]?.priceBid ?? 7820000))
  const [ask, setAsk] = useState(String(quotes[gold.id]?.priceAsk ?? 7920000))
  const [label, setLabel] = useState(quotes[gold.id]?.label || 'Tiệm')
  const [usdtP, setUsdtP] = useState(String(quotes[usdt.id]?.price ?? 25650))
  const [coinPrices, setCoinPrices] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    cryptos.forEach((c) => {
      m[c.id] = String(quotes[c.id]?.price ?? '')
    })
    return m
  })
  const [fetching, setFetching] = useState(false)

  // Sync form khi quotes store đổi (sau auto fetch)
  useEffect(() => {
    const g = quotes[gold.id]
    const u = quotes[usdt.id]
    if (g?.priceBid != null) setBid(String(g.priceBid))
    if (g?.priceAsk != null) setAsk(String(g.priceAsk))
    if (g?.label) setLabel(g.label)
    if (u?.price != null) setUsdtP(String(u.price))
    setCoinPrices((m) => {
      const next = { ...m }
      cryptos.forEach((c) => {
        if (quotes[c.id]?.price != null) next[c.id] = String(quotes[c.id]!.price)
      })
      return next
    })
  }, [quotes, gold.id, usdt.id, cryptos])

  async function pullLive(includeGoldInStore: boolean) {
    setFetching(true)
    try {
      // Coin + USDT luôn ghi store; vàng chỉ ghi store nếu bật auto hoặc user chọn
      const live = await refresh(false, {
        forceGold: includeGoldInStore || !!settings.autoGoldPrice,
      })
      if (!live) {
        showToast('Không lấy được giá — kiểm tra mạng')
        return
      }
      if (live.usdtVnd) setUsdtP(String(live.usdtVnd))
      // Form vàng: luôn điền ước lượng để xem / Lưu tay
      if (live.goldBid) setBid(String(live.goldBid))
      if (live.goldAsk) setAsk(String(live.goldAsk))
      if (live.goldLabel) setLabel(live.goldLabel)
      setCoinPrices((m) => {
        const next = { ...m }
        cryptos.forEach((c) => {
          const p = live.coins[c.symbol.toUpperCase()]
          if (p) next[c.id] = String(p)
        })
        return next
      })
      const parts = [
        live.usdtVnd
          ? `USDT ${live.usdtVnd.toLocaleString('vi-VN')}đ`
          : null,
        Object.keys(live.coins).length
          ? `Coin ${Object.keys(live.coins).length} mã`
          : null,
        includeGoldInStore || settings.autoGoldPrice
          ? 'Đã áp giá vàng ước'
          : live.goldBid
            ? 'Vàng điền form (chưa ghi sổ — bấm Lưu giá)'
            : null,
      ].filter(Boolean)
      showToast(parts.join(' · ') || live.errors[0] || 'Đã lấy giá live')
    } finally {
      setFetching(false)
    }
  }

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => setScreen('home')}>
          ‹ Huỷ
        </button>
        <div className="mid">Cập nhật giá</div>
        <div style={{ minWidth: 64 }} />
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ padding: 14, fontSize: 13, lineHeight: 1.45 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Tự động giá
          </div>
          <div style={{ color: 'var(--muted)' }}>
            <b>Coin + USDT</b> luôn auto Binance (~3 phút).{' '}
            <b>Vàng nhẫn</b> mặc định <b>không auto</b> — giữ giá tiệm/tay, tránh
            P/L lệch.
          </div>
        </div>
        <div className="switch-row">
          <div>
            <div style={{ fontWeight: 650 }}>Auto giá vàng (ước XAU)</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Bật thì mỗi lần refresh ghi đè giá nhẫn
            </div>
          </div>
          <button
            className="btn-secondary"
            type="button"
            style={{ width: 'auto', margin: 0, padding: '8px 14px', fontSize: 14 }}
            onClick={() =>
              updateSettings({ autoGoldPrice: !settings.autoGoldPrice })
            }
          >
            {settings.autoGoldPrice ? 'Đang bật' : 'Tắt'}
          </button>
        </div>
        <div style={{ padding: '0 14px 14px', display: 'grid', gap: 8 }}>
          <button
            className="btn-primary"
            type="button"
            disabled={fetching || autoStatus === 'loading'}
            onClick={() => void pullLive(false)}
          >
            {fetching ? 'Đang lấy giá…' : 'Lấy coin + USDT live'}
          </button>
          <button
            className="btn-secondary"
            type="button"
            style={{ margin: 0 }}
            disabled={fetching || autoStatus === 'loading'}
            onClick={() => void pullLive(true)}
          >
            Lấy + áp giá vàng ước vào sổ
          </button>
        </div>
      </div>

      <div className="sec" style={{ marginTop: 4 }}>
        <h2>Nhẫn 9999 · 2 chiều</h2>
      </div>
      <div className="card">
        <div className="field">
          <label>Mua vào (đ/chỉ)</label>
          <MoneyInput value={bid} onChange={setBid} unit="đ/chỉ" />
          <div className="hint">Tiệm mua lại · dùng cho P/L hold</div>
        </div>
        <div className="field">
          <label>Bán ra (đ/chỉ)</label>
          <MoneyInput value={ask} onChange={setAsk} unit="đ/chỉ" />
        </div>
        <div className="field">
          <label>Tiệm / nguồn</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} style={{ fontSize: 17, fontWeight: 600 }} />
        </div>
      </div>
      <div className="sec">
        <h2>USDT · Binance</h2>
      </div>
      <div className="card">
        <div className="field">
          <label>VND / 1 USDT</label>
          <MoneyInput value={usdtP} onChange={setUsdtP} unit="đ" />
          <div className="hint">Mặc định lấy Binance P2P · có thể sửa tay</div>
        </div>
      </div>
      {cryptos.length > 0 && (
        <>
          <div className="sec">
            <h2>Coin · Binance (USDT)</h2>
          </div>
          <div className="card">
            {cryptos.map((c) => (
              <div className="field" key={c.id}>
                <label>{c.symbol}</label>
                <MoneyInput
                  value={coinPrices[c.id] ?? ''}
                  onChange={(v) =>
                    setCoinPrices((m) => ({ ...m, [c.id]: v }))
                  }
                  unit="USDT"
                  decimal
                  maxFraction={4}
                />
              </div>
            ))}
          </div>
        </>
      )}
      <button
        className="btn-primary"
        onClick={() => {
          const t = nowIso()
          setQuote({
            assetId: gold.id,
            price: moneyNum(bid),
            priceBid: moneyNum(bid),
            priceAsk: moneyNum(ask),
            currency: 'VND',
            label,
            quotedAt: t,
          })
          setQuote({
            assetId: usdt.id,
            price: moneyNum(usdtP),
            currency: 'VND',
            label: 'Binance',
            quotedAt: t,
          })
          updateSettings({ defaultUsdtVnd: moneyNum(usdtP) || 25650 })
          cryptos.forEach((c) => {
            const p = moneyNum(coinPrices[c.id] ?? 0)
            if (p > 0) {
              setQuote({
                assetId: c.id,
                price: p,
                currency: 'USDT',
                label: 'Binance',
                quotedAt: t,
              })
            }
          })
          showToast('Đã cập nhật giá')
          setScreen('home')
        }}
      >
        Lưu giá
      </button>
    </div>
  )
}


