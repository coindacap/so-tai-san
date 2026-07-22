export type AssetClass = 'cash' | 'stable' | 'gold' | 'crypto'
export type TxKind = 'buy' | 'sell' | 'convert' | 'adjust'
export type QuoteCurrency = 'VND' | 'USDT'

export interface Asset {
  id: string
  assetClass: AssetClass
  symbol: string
  name: string
  unit: string
  quoteCurrency: QuoteCurrency
  isBridge: boolean
  isSeed: boolean
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export interface Transaction {
  id: string
  kind: TxKind
  assetId: string
  side: 'in' | 'out'
  qty: number
  pricePerUnit: number
  priceCurrency: QuoteCurrency
  fee: number
  counterAssetId: string
  counterQty: number
  /** VND cost locked into this leg (for crypto bought with USDT) */
  counterCostVnd?: number
  tradedAt: string
  venue?: string
  note?: string
  createdAt: string
  updatedAt: string
}

export interface PriceQuote {
  assetId: string
  price: number
  priceBid?: number
  priceAsk?: number
  currency: QuoteCurrency
  label?: string
  quotedAt: string
}

export interface AppSettings {
  displayCurrency: 'VND'
  enforceUsdtForCrypto: boolean
  privacyMode: boolean
  defaultUsdtVnd: number
  /** Đã qua màn chào / import — không quay lại onboarding khi reload */
  hasOnboarded: boolean
}

/** Sổ tiết kiệm ngân hàng / quỹ */
export interface SavingsAccount {
  id: string
  name: string
  bank: string
  /** Số dư gốc hiện tại (VND) */
  principal: number
  /** Lãi suất %/năm */
  rateAnnual: number
  startDate: string
  /** Ngày đáo hạn — null = không kỳ hạn */
  maturityDate: string | null
  termMonths: number | null
  status: 'active' | 'closed'
  note?: string
  /** Có trừ/cộng tiền mặt VND khi mở/đóng */
  linkedCash: boolean
  createdAt: string
  updatedAt: string
}

export type LoanPaymentType = 'principal' | 'interest'

export interface LoanPayment {
  id: string
  amount: number
  paidAt: string
  note?: string
  /** principal = thu gốc; interest = đóng lãi (không giảm remaining) */
  type?: LoanPaymentType
}

export type LoanInterestType =
  | 'annual' // %/năm (rateAnnual)
  | 'percent_monthly' // %/tháng
  | 'per_million_daily' // đ / triệu / ngày
  | 'flat_monthly' // cố định đ/tháng

/** Khoản cho người khác vay */
export interface Loan {
  id: string
  borrower: string
  phone?: string
  /** Gốc ban đầu */
  principal: number
  /** Còn phải thu (gốc) */
  remaining: number
  /** Lãi %/năm (quy đổi hoặc nhập tay) */
  rateAnnual: number
  /** Kiểu lãi gốc (để tính tạm tính đúng) */
  interestType?: LoanInterestType
  /** Giá trị lãi theo interestType: %/tháng, đ/triệu/ngày, hoặc đ/tháng */
  interestValue?: number
  /** Tổng lãi đã thu */
  interestPaid: number
  lendDate: string
  dueDate: string | null
  status: 'open' | 'partial' | 'paid' | 'written_off'
  note?: string
  payments: LoanPayment[]
  linkedCash: boolean
  /** Soft-delete — ẩn list, có thể khôi phục */
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AppState {
  assets: Asset[]
  transactions: Transaction[]
  quotes: Record<string, PriceQuote>
  settings: AppSettings
  savings: SavingsAccount[]
  loans: Loan[]
  version: number
}

export interface PositionView {
  asset: Asset
  qtyHold: number
  avgCost: number | null
  totalCostOpen: number | null
  lastPrice: number | null
  marketValueNative: number | null
  marketValueVnd: number
  costOpenVnd: number
  unrealizedPnLVnd: number
  unrealizedPnLPct: number | null
  realizedPnLVnd: number
}

export type Screen =
  | 'home'
  | 'assets'
  | 'history'
  | 'settings'
  | 'gold'
  | 'asset-detail'
  | 'buy-gold'
  | 'sell-gold'
  | 'usdt'
  | 'buy-coin'
  | 'sell-coin'
  | 'adjust-usdt'
  | 'prices'
  | 'cash'
  | 'savings'
  | 'savings-form'
  | 'savings-detail'
  | 'loans'
  | 'loan-form'
  | 'loan-edit'
  | 'loan-detail'
  | 'loans-trash'
  | 'onboarding'

export type NavFrame = {
  screen: Screen
  detailAssetId: string | null
}
