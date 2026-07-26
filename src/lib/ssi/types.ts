/**
 * Kiểu dữ liệu SSI FastConnect (rút gọn) — map sang Sổ Tài Sản.
 * Tham chiếu: @ssi.developer/ssi-sdk models/portfolio
 */

export type SsiEquityPosition = {
  accountNo?: string
  symbol: string
  quantity: number
  blockQuantity?: number
  dividendQuantity?: number
  sellableQuantity?: number
  costPrice: number
  buyingQuantity?: number
  boughtQuantity?: number
  sellingQuantity?: number
  soldQuantity?: number
}

export type SsiEquityBalance = {
  accountNo?: string
  availableCash: number
  totalDebt?: number
  onHoldCash?: number
  bankBalance?: number
}

/** Payload sau khi backend (hoặc import JSON) lấy từ SSI */
export type SsiSyncPayload = {
  accountNo: string
  syncedAt: string
  positions: SsiEquityPosition[]
  balance?: SsiEquityBalance | null
  source?: 'ssi-api' | 'manual-json'
}

/** 1 dòng CK sẵn sàng ghi sổ */
export type StockHoldLine = {
  symbol: string
  name: string
  qty: number
  /** Giá vốn TB (đ/cp) */
  avgCost: number
  sellableQty?: number
}
