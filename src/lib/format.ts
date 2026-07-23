export function fmtVnd(n: number, compact = false): string {
  if (!Number.isFinite(n)) return '—'
  if (compact) {
    const abs = Math.abs(n)
    if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} tỷ`
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}tr`
    if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  }
  return Math.round(n).toLocaleString('vi-VN')
}

export function fmtNum(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('vi-VN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })
}

export function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

export function fmtSignedVnd(n: number, compact = false): string {
  if (!Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${fmtVnd(Math.abs(n), compact)}`
}

/** Chỉ lấy chữ số → number */
export function parseMoney(s: string | number): number {
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0
  const n = Number(String(s).replace(/\D/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** "50000000" | 50000000 → "50.000.000" (hiển thị ô nhập) */
export function formatMoneyInput(s: string | number): string {
  const digits = String(s ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('vi-VN')
}

/** UUID an toàn trên HTTP (iPhone Safari không có crypto.randomUUID ngoài HTTPS) */
export function uid(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c?.randomUUID) return c.randomUUID()
  if (c?.getRandomValues) {
    const buf = new Uint8Array(16)
    c.getRandomValues(buf)
    buf[6] = (buf[6] & 0x0f) | 0x40
    buf[8] = (buf[8] & 0x3f) | 0x80
    const h = [...buf].map((b) => b.toString(16).padStart(2, '0')).join('')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function toLocalInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date()
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(v: string): string {
  return new Date(v).toISOString()
}

export function toDateInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Ước lãi đơn từ start → now (hoặc maturity nếu đã qua) */
export function estimateInterest(
  principal: number,
  rateAnnual: number,
  startIso: string,
  endIso?: string | null,
): number {
  if (principal <= 0 || rateAnnual <= 0) return 0
  const start = new Date(startIso).getTime()
  const end = endIso ? new Date(endIso).getTime() : Date.now()
  const days = Math.max(0, (end - start) / (1000 * 60 * 60 * 24))
  return principal * (rateAnnual / 100) * (days / 365)
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const d =
    (new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) /
    (1000 * 60 * 60 * 24)
  return Math.round(d)
}

export function daysBetween(fromIso: string, toIso?: string): number {
  const a = new Date(fromIso).setHours(0, 0, 0, 0)
  const b = (toIso ? new Date(toIso) : new Date()).setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)))
}

/**
 * Lãi tạm tính theo kiểu lãi + số ngày / tháng.
 * - annual: remaining * rateAnnual/100 * days/365
 * - percent_monthly: remaining * interestValue/100 * (days/30)
 * - per_million_daily: remaining/1e6 * interestValue * days  (vd 1000đ/1tr/ngày)
 * - flat_monthly: interestValue * (days/30)  (vd 1.300.000đ/tháng)
 *
 * @param fromDate — mốc bắt đầu tính (mặc định = lendDate).
 *   Sau khi đóng lãi: truyền ngày đóng lãi gần nhất → chỉ tính kỳ mới.
 */
export function calcLoanInterest(input: {
  remaining: number
  rateAnnual: number
  interestType?: string
  interestValue?: number
  lendDate: string
  /** Ghi đè mốc bắt đầu (vd. sau lần thu lãi gần nhất) */
  fromDate?: string
  asOf?: string
}): number {
  const start = input.fromDate || input.lendDate
  const days = daysBetween(start, input.asOf)
  const months = days / 30
  const type = input.interestType || 'annual'
  const val = input.interestValue ?? 0
  const rem = Math.max(0, input.remaining)

  if (type === 'percent_monthly' && val > 0) {
    return rem * (val / 100) * months
  }
  if (type === 'per_million_daily' && val > 0) {
    return (rem / 1_000_000) * val * days
  }
  if (type === 'flat_monthly' && val > 0) {
    return val * months
  }
  // annual fallback
  if (input.rateAnnual > 0) {
    return rem * (input.rateAnnual / 100) * (days / 365)
  }
  return 0
}

export type LoanInterestLike = {
  remaining: number
  rateAnnual: number
  interestType?: string
  interestValue?: number
  lendDate: string
  interestPaid?: number
  payments?: { type?: string; paidAt: string; amount: number }[]
}

/**
 * Ngày bắt đầu kỳ lãi chưa thu:
 * - Chưa đóng lãi lần nào → ngày cho vay
 * - Đã đóng lãi → ngày đóng lãi gần nhất (kỳ mới sau khi thu)
 */
export function loanInterestStartDate(loan: LoanInterestLike): string {
  const pays = (loan.payments || []).filter(
    (p) => (p.type || 'principal') === 'interest',
  )
  if (pays.length === 0) return loan.lendDate
  return pays.reduce((best, p) =>
    p.paidAt > best.paidAt ? p : best,
  ).paidAt
}

/**
 * Lãi tạm tính CÒN LẠI đến hôm nay (chưa thu).
 * Tính từ mốc vay / sau lần đóng lãi gần nhất → asOf.
 * Không cộng lại phần đã thu lãi.
 */
export function calcLoanOutstandingInterest(
  loan: LoanInterestLike,
  asOf?: string,
): {
  /** Lãi còn tạm tính (chưa thu) */
  outstanding: number
  /** Tổng lãi lý thuyết từ ngày vay → asOf (trên gốc còn) */
  grossFromStart: number
  /** Mốc bắt đầu kỳ hiện tại */
  fromDate: string
  /** Số ngày trong kỳ hiện tại */
  days: number
} {
  const fromDate = loanInterestStartDate(loan)
  const outstanding = calcLoanInterest({
    remaining: loan.remaining,
    rateAnnual: loan.rateAnnual,
    interestType: loan.interestType,
    interestValue: loan.interestValue,
    lendDate: loan.lendDate,
    fromDate,
    asOf,
  })
  const grossFromStart = calcLoanInterest({
    remaining: loan.remaining,
    rateAnnual: loan.rateAnnual,
    interestType: loan.interestType,
    interestValue: loan.interestValue,
    lendDate: loan.lendDate,
    asOf,
  })
  return {
    outstanding: Math.max(0, outstanding),
    grossFromStart: Math.max(0, grossFromStart),
    fromDate,
    days: daysBetween(fromDate, asOf),
  }
}

/** Lãi 1 ngày (ước) theo kiểu lãi — dùng gợi ý UI */
export function calcLoanInterestPerDay(input: {
  remaining: number
  rateAnnual: number
  interestType?: string
  interestValue?: number
}): number {
  const rem = Math.max(0, input.remaining)
  const type = input.interestType || 'annual'
  const val = input.interestValue ?? 0

  if (type === 'percent_monthly' && val > 0) {
    return (rem * (val / 100)) / 30
  }
  if (type === 'per_million_daily' && val > 0) {
    return (rem / 1_000_000) * val
  }
  if (type === 'flat_monthly' && val > 0) {
    return val / 30
  }
  if (input.rateAnnual > 0) {
    return (rem * (input.rateAnnual / 100)) / 365
  }
  return 0
}

export function loanInterestLabel(input: {
  rateAnnual?: number
  interestType?: string
  interestValue?: number
}): string {
  const type = input.interestType || 'annual'
  const val = input.interestValue ?? 0
  if (type === 'percent_monthly') {
    return val > 0 ? `${val}%/tháng` : 'Không lãi'
  }
  if (type === 'per_million_daily') {
    if (val <= 0) return 'Không lãi'
    // 1000 → "1k/1tr/ngày"
    if (val >= 1000 && val % 1000 === 0) {
      return `${val / 1000}k/1tr/ngày`
    }
    return `${val.toLocaleString('vi-VN')}đ/1tr/ngày`
  }
  if (type === 'flat_monthly') {
    return val > 0
      ? `${Math.round(val).toLocaleString('vi-VN')}đ/tháng`
      : 'Không lãi'
  }
  const a = input.rateAnnual ?? 0
  return a > 0 ? `${a}%/năm` : 'Không lãi'
}

/** Quy đổi sang rateAnnual để tương thích P/L cũ */
export function toRateAnnual(
  interestType: string,
  interestValue: number,
): number {
  if (interestType === 'percent_monthly') return interestValue * 12
  if (interestType === 'per_million_daily') {
    // val đ/triệu/ngày → %/năm ≈ (val/1e6)*365*100
    return Math.round((interestValue / 1_000_000) * 365 * 100 * 100) / 100
  }
  if (interestType === 'flat_monthly') return 0 // không quy % được ổn định
  return interestValue
}
