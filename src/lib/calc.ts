import type {
  AppState,
  Asset,
  PositionView,
  PriceQuote,
  Transaction,
} from '../types'

/** Đủ field để tính hold / P&L; field khác (savings, expenses…) optional */
export type CalcState = Pick<
  AppState,
  'assets' | 'transactions' | 'quotes' | 'settings'
> &
  Partial<Omit<AppState, 'assets' | 'transactions' | 'quotes' | 'settings'>>

export function getAsset(state: CalcState, id: string): Asset | undefined {
  return state.assets.find((a) => a.id === id)
}

export function getBySymbol(state: CalcState, symbol: string): Asset | undefined {
  return state.assets.find((a) => a.symbol === symbol)
}

export function sortedTxs(txs: Transaction[]): Transaction[] {
  return [...txs].sort((a, b) => {
    const t = a.tradedAt.localeCompare(b.tradedAt)
    if (t !== 0) return t
    return a.createdAt.localeCompare(b.createdAt)
  })
}

export function usdtRate(state: CalcState): number {
  const usdt = getBySymbol(state, 'USDT')
  if (!usdt) return state.settings.defaultUsdtVnd
  const q = state.quotes[usdt.id]
  return q?.price || state.settings.defaultUsdtVnd || 25500
}

function markPrice(asset: Asset, quote?: PriceQuote): number | null {
  if (asset.symbol === 'VND') return 1
  if (!quote) return null
  if (asset.symbol === 'NHAN9999') return quote.priceBid ?? quote.price ?? null
  return quote.price ?? null
}

export function computePosition(state: CalcState, assetId: string): PositionView {
  const asset = getAsset(state, assetId)!
  const txs = sortedTxs(state.transactions.filter((t) => t.assetId === assetId))
  const quote = state.quotes[assetId]

  // Tiền mặt VND: cộng/trừ đủ mọi leg (cùng qtyHoldAt).
  // Không dùng AVG + clip out — nếu out trước in (timestamp chi tiêu trước bootstrap)
  // thì clip sẽ bỏ out → số dư ảo trên danh mục, lệch màn Nạp VND.
  if (asset.symbol === 'VND') {
    let qty = 0
    for (const tx of txs) {
      qty += tx.side === 'in' ? tx.qty : -tx.qty
    }
    return {
      asset,
      qtyHold: qty,
      avgCost: 1,
      totalCostOpen: qty,
      lastPrice: 1,
      marketValueNative: qty,
      marketValueVnd: qty,
      costOpenVnd: qty,
      unrealizedPnLVnd: 0,
      unrealizedPnLNative: 0,
      unrealizedPnLPct: 0,
      realizedPnLVnd: 0,
    }
  }

  let qty = 0
  let totalCostNative = 0
  let totalCostVnd = 0
  let realizedPnLVnd = 0

  for (const tx of txs) {
    if (tx.costBasisDeltaNative != null) {
      const delta = Number(tx.costBasisDeltaNative)
      if (Number.isFinite(delta)) {
        totalCostNative += delta
        totalCostVnd +=
          asset.quoteCurrency === 'USDT' ? delta * usdtRate(state) : delta
      }
      continue
    }

    if (tx.side === 'in') {
      qty += tx.qty
      if (asset.quoteCurrency === 'VND') {
        const cost = tx.qty * tx.pricePerUnit + (tx.fee || 0)
        totalCostNative += cost
        totalCostVnd += cost
      } else {
        const costUsdt = tx.counterQty || tx.qty * tx.pricePerUnit + (tx.fee || 0)
        totalCostNative += costUsdt
        totalCostVnd += tx.counterCostVnd ?? costUsdt * usdtRate(state)
      }
    } else {
      if (qty <= 0) continue
      const sellQty = Math.min(tx.qty, qty)
      const avgNative = totalCostNative / qty
      const avgVnd = totalCostVnd / qty
      const costRemovedNative = sellQty * avgNative
      const costRemovedVnd = sellQty * avgVnd

      let proceedsVnd = 0
      if (asset.quoteCurrency === 'VND') {
        proceedsVnd = sellQty * tx.pricePerUnit - (tx.fee || 0)
      } else {
        const usdtIn = tx.counterQty || sellQty * tx.pricePerUnit - (tx.fee || 0)
        proceedsVnd = tx.counterCostVnd ?? usdtIn * usdtRate(state)
      }

      realizedPnLVnd += proceedsVnd - costRemovedVnd
      qty -= sellQty
      totalCostNative -= costRemovedNative
      totalCostVnd -= costRemovedVnd
    }
  }

  const avgCost = qty > 0 ? totalCostNative / qty : null
  const lastPrice = markPrice(asset, quote)
  const marketValueNative =
    lastPrice != null && qty > 0 ? qty * lastPrice : qty > 0 ? null : 0

  const rate = usdtRate(state)
  let marketValueVnd = 0
  if (qty <= 0) {
    marketValueVnd = 0
  } else if (asset.quoteCurrency === 'VND') {
    marketValueVnd = marketValueNative ?? totalCostVnd
  } else {
    marketValueVnd = (marketValueNative ?? 0) * rate
  }

  // Coin (quote USDT): giá vốn / P/L theo USDT, VND chỉ quy đổi tỷ giá hiện tại.
  // Không khóa VND lúc đổi USDT — tránh P/L coin bị kéo bởi OTC.
  const costOpenVnd =
    qty > 0 && asset.quoteCurrency === 'USDT'
      ? Math.max(0, totalCostNative * rate)
      : Math.max(0, totalCostVnd)
  const unrealizedPnLVnd = marketValueVnd - costOpenVnd
  const unrealizedPnLPct =
    costOpenVnd > 0 ? (unrealizedPnLVnd / costOpenVnd) * 100 : null
  const unrealizedPnLNative =
    qty <= 0
      ? 0
      : lastPrice != null && avgCost != null
        ? (lastPrice - avgCost) * qty
        : null

  return {
    asset,
    qtyHold: qty,
    avgCost,
    totalCostOpen: qty > 0 ? totalCostNative : null,
    lastPrice,
    marketValueNative,
    marketValueVnd,
    costOpenVnd,
    unrealizedPnLVnd,
    unrealizedPnLNative,
    unrealizedPnLPct,
    realizedPnLVnd,
  }
}

export function qtyHoldAt(
  state: CalcState,
  assetId: string,
  beforeIso?: string,
): number {
  let qty = 0
  for (const tx of sortedTxs(
    state.transactions.filter((t) => t.assetId === assetId),
  )) {
    if (beforeIso && tx.tradedAt > beforeIso) break
    qty += tx.side === 'in' ? tx.qty : -tx.qty
  }
  return qty
}

export function usdtAvgCost(state: CalcState): number {
  const usdt = getBySymbol(state, 'USDT')
  if (!usdt) return state.settings.defaultUsdtVnd
  const pos = computePosition(state, usdt.id)
  return pos.avgCost ?? state.settings.defaultUsdtVnd
}

export function portfolioSummary(state: CalcState) {
  const active = state.assets.filter((a) => !a.isArchived)
  const positions = active.map((a) => computePosition(state, a.id))

  const gold = positions.filter((p) => p.asset.assetClass === 'gold')
  const usdt = positions.filter((p) => p.asset.assetClass === 'stable')
  const crypto = positions.filter((p) => p.asset.assetClass === 'crypto')
  const cash = positions.filter((p) => p.asset.assetClass === 'cash')

  const sumVnd = (ps: PositionView[]) =>
    ps.reduce((s, p) => s + p.marketValueVnd, 0)
  const sumCost = (ps: PositionView[]) =>
    ps.reduce((s, p) => s + p.costOpenVnd, 0)
  const sumPnl = (ps: PositionView[]) =>
    ps.reduce((s, p) => s + p.unrealizedPnLVnd, 0)

  const totalValue = sumVnd(positions)
  const totalCost = sumCost(positions)
  const totalPnl = sumPnl(positions)
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : null
  const realized = positions.reduce((s, p) => s + p.realizedPnLVnd, 0)

  const bucket = (ps: PositionView[]) => {
    const cost = sumCost(ps)
    const pnl = sumPnl(ps)
    return {
      value: sumVnd(ps),
      cost,
      pnl,
      pnlPct: cost > 0 ? (pnl / cost) * 100 : null,
      qty: ps.reduce((s, p) => s + p.qtyHold, 0),
      positions: ps,
    }
  }

  return {
    positions,
    totalValue,
    totalCost,
    totalPnl,
    totalPnlPct,
    realized,
    buckets: {
      gold: bucket(gold),
      usdt: bucket(usdt),
      crypto: bucket(crypto),
      cash: bucket(cash),
    },
  }
}
