import type { SsiEquityPosition, SsiSyncPayload, StockHoldLine } from './types'

/**
 * Map vị thế SSI → dòng hold cổ phiếu (chỉ mã còn quantity > 0).
 */
export function mapSsiPositionsToStockLines(
  positions: SsiEquityPosition[],
): StockHoldLine[] {
  const lines: StockHoldLine[] = []
  for (const p of positions) {
    const symbol = String(p.symbol || '')
      .trim()
      .toUpperCase()
    const qty = Number(p.quantity) || 0
    if (!symbol || qty <= 0) continue
    const avgCost = Number(p.costPrice) || 0
    lines.push({
      symbol,
      name: symbol,
      qty,
      avgCost: avgCost > 0 ? avgCost : 0,
      sellableQty:
        p.sellableQuantity != null ? Number(p.sellableQuantity) : undefined,
    })
  }
  return lines.sort((a, b) => a.symbol.localeCompare(b.symbol))
}

export function summarizeSsiSync(payload: SsiSyncPayload): {
  lines: StockHoldLine[]
  totalCostVnd: number
  cash: number
  symbolCount: number
} {
  const lines = mapSsiPositionsToStockLines(payload.positions || [])
  const totalCostVnd = lines.reduce((s, l) => s + l.qty * l.avgCost, 0)
  const cash = payload.balance?.availableCash ?? 0
  return {
    lines,
    totalCostVnd,
    cash,
    symbolCount: lines.length,
  }
}

/** Parse JSON dán tay (khi chưa có backend) — dùng test mapper */
export function parseSsiSyncJson(
  raw: string,
): { ok: true; data: SsiSyncPayload } | { ok: false; error: string } {
  try {
    const data = JSON.parse(raw) as SsiSyncPayload
    if (!data || !Array.isArray(data.positions)) {
      return {
        ok: false,
        error: 'JSON cần có mảng positions (từ SSI getEquityPositions)',
      }
    }
    return {
      ok: true,
      data: {
        accountNo: data.accountNo || 'unknown',
        syncedAt: data.syncedAt || new Date().toISOString(),
        positions: data.positions,
        balance: data.balance ?? null,
        source: data.source || 'manual-json',
      },
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'JSON không hợp lệ',
    }
  }
}
