/**
 * Convert backup "QuanLyTaiChinh" → Sổ Tài Sản
 * Chỉ lấy khoản ĐANG HOẠT ĐỘNG:
 * - Tiết kiệm status=active (bỏ settled / hết hạn đã tất toán)
 * - Cho vay status=active (bỏ paid)
 * - Coin/USDT: số dư hiện còn hold (không import lịch sử đã bán hết)
 * - Bỏ chi tiêu
 */
import type {
  AppSettings,
  AppState,
  Asset,
  Loan,
  LoanPayment,
  PriceQuote,
  SavingsAccount,
  Transaction,
} from '../types'
import { uid } from './format'

const VND_ID = 'asset-vnd'
const USDT_ID = 'asset-usdt'
const GOLD_ID = 'asset-gold'

function seedAssets(now: string): Asset[] {
  return [
    {
      id: VND_ID,
      assetClass: 'cash',
      symbol: 'VND',
      name: 'Tiền mặt VND',
      unit: 'đ',
      quoteCurrency: 'VND',
      isBridge: false,
      isSeed: true,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: USDT_ID,
      assetClass: 'stable',
      symbol: 'USDT',
      name: 'USDT',
      unit: 'USDT',
      quoteCurrency: 'VND',
      isBridge: true,
      isSeed: true,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: GOLD_ID,
      assetClass: 'gold',
      symbol: 'NHAN9999',
      name: 'Vàng nhẫn 9999',
      unit: 'chỉ',
      quoteCurrency: 'VND',
      isBridge: false,
      isSeed: true,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    },
  ]
}

function rateAnnualFromLoan(
  interestType: string,
  interestValue: number,
): { rateAnnual: number; noteExtra: string } {
  if (interestType === 'percent_monthly') {
    return {
      rateAnnual: interestValue * 12,
      noteExtra: `Lãi ${interestValue}%/tháng`,
    }
  }
  if (interestType === 'per_million_daily') {
    const annual = (interestValue / 1_000_000) * 365 * 100
    return {
      rateAnnual: Math.round(annual * 100) / 100,
      noteExtra: `Lãi ${interestValue}đ/triệu/ngày`,
    }
  }
  if (interestType === 'flat_monthly') {
    return {
      rateAnnual: 0,
      noteExtra: `Lãi cố định ${Number(interestValue).toLocaleString('vi-VN')}đ/tháng`,
    }
  }
  return { rateAnnual: 0, noteExtra: '' }
}

export type ImportReport = {
  savings: number
  loans: number
  coins: number
  usdt: number
  skippedSavings: number
  skippedLoans: number
  expensesSkipped: number
  notes: string[]
}

export function isTaiChinhBackup(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  if (o.appName === 'QuanLyTaiChinh') return true
  // Không nhầm với backup Sổ Tài Sản (có assets[])
  if (Array.isArray(o.assets)) return false

  const candidates = [o.data, o].filter(Boolean) as Record<string, unknown>[]
  for (const data of candidates) {
    if (!data || typeof data !== 'object') continue
    const savings = data.savings as Record<string, unknown> | undefined
    const loans = data.loans as Record<string, unknown> | undefined
    const crypto = data.crypto as Record<string, unknown> | undefined
    if (savings && (Array.isArray(savings.deposits) || Array.isArray(savings)))
      return true
    if (loans && (Array.isArray(loans.loans) || Array.isArray(loans))) return true
    if (crypto && (crypto.usdtBuys || crypto.coinHoldings)) return true
    if (data.finance) return true
  }
  return false
}

/** Làm sạch text dán từ iOS (BOM, smart quotes, rác ngoài JSON) */
export function parseImportText(raw: string): unknown {
  let s = String(raw ?? '').trim()
  if (!s) throw new Error('Nội dung trống')

  // BOM
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1).trim()

  // iOS smart quotes
  s = s
    .replace(/[\u201C\u201D\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")

  // Đôi khi copy kèm tên file / chữ thừa phía trước
  const brace = s.indexOf('{')
  if (brace > 0) s = s.slice(brace)
  const end = s.lastIndexOf('}')
  if (end >= 0 && end < s.length - 1) s = s.slice(0, end + 1)

  try {
    return JSON.parse(s)
  } catch {
    // Thử bỏ trailing commas thô
    try {
      const fixed = s.replace(/,\s*([\]}])/g, '$1')
      return JSON.parse(fixed)
    } catch {
      const preview = s.slice(0, 40).replace(/\s+/g, ' ')
      throw new Error(
        `JSON hỏng. Bắt đầu bằng: “${preview}…”. Hãy copy lại TOÀN BỘ file.`,
      )
    }
  }
}

export function convertTaiChinhBackup(raw: unknown): {
  state: AppState
  report: ImportReport
} {
  const root = raw as {
    data?: {
      finance?: { transactions?: Array<{ type?: string }> }
      savings?: { deposits?: Array<Record<string, unknown>> }
      crypto?: {
        usdtBuys?: Array<Record<string, unknown>>
        coinHoldings?: Array<Record<string, unknown>>
      }
      loans?: { loans?: Array<Record<string, unknown>> }
    }
    finance?: unknown
    savings?: unknown
    crypto?: unknown
    loans?: unknown
  }

  // Hỗ trợ cả { data: {...} } và object data trần (khi copy dở)
  type DataShape = NonNullable<(typeof root)['data']>
  let data: DataShape = {}
  if (root.data) data = root.data
  else if (root.savings || root.crypto || root.loans || root.finance) {
    data = {
      finance: root.finance as DataShape['finance'],
      savings: root.savings as DataShape['savings'],
      crypto: root.crypto as DataShape['crypto'],
      loans: root.loans as DataShape['loans'],
    }
  }
  const now = new Date().toISOString()
  const report: ImportReport = {
    savings: 0,
    loans: 0,
    coins: 0,
    usdt: 0,
    skippedSavings: 0,
    skippedLoans: 0,
    expensesSkipped: 0,
    notes: [],
  }

  report.expensesSkipped = (data.finance?.transactions || []).filter(
    (t) => t.type === 'expense',
  ).length

  // --- Chỉ tiết kiệm đang active ---
  const savings: SavingsAccount[] = []
  for (const d of data.savings?.deposits || []) {
    const statusRaw = String(d.status || 'active')
    if (statusRaw !== 'active') {
      report.skippedSavings++
      continue
    }
    const principal = Number(d.principal) || 0
    if (principal <= 0) {
      report.skippedSavings++
      continue
    }
    const bank = String(d.bankName || d.bankShort || 'Ngân hàng')
    const rate = Number(d.interestRate) || 0
    const term = d.termMonths != null ? Number(d.termMonths) : null
    const startDate = String(d.startDate || now)
    savings.push({
      id: String(d.id || uid()),
      name: `${bank}${term ? ` ${term}th` : ''}`,
      bank,
      principal,
      rateAnnual: rate,
      startDate,
      maturityDate: d.maturityDate ? String(d.maturityDate) : null,
      termMonths: term,
      status: 'active',
      note: d.note ? String(d.note) : undefined,
      linkedCash: false,
      createdAt: startDate,
      updatedAt: now,
    })
    report.savings++
  }

  // --- Chỉ cho vay còn active ---
  const loans: Loan[] = []
  for (const l of data.loans?.loans || []) {
    const statusRaw = String(l.status || 'active')
    if (statusRaw !== 'active') {
      report.skippedLoans++
      continue
    }
    const principal = Number(l.principal) || 0
    if (principal <= 0) {
      report.skippedLoans++
      continue
    }

    const { rateAnnual, noteExtra } = rateAnnualFromLoan(
      String(l.interestType || ''),
      Number(l.interestValue) || 0,
    )
    const dueDay = l.dueDate != null ? String(l.dueDate) : ''
    const dueDateIso = /^\d{4}-\d{2}-\d{2}/.test(dueDay) ? dueDay : null

    // Chỉ giữ payment gần đây? User said đã thu thì không cần — bỏ toàn bộ payment history của khoản paid (đã skip). 
    // Với active: có thể có thu lãi — ghi note, không giảm gốc (lãi-only)
    const interestPays = (
      (l.payments as Array<Record<string, unknown>>) || []
    ).filter((p) => String(p.type || '') === 'interest')
    const payments: LoanPayment[] = []
    // Không import payment history — chỉ số dư đang vay
    void interestPays

    const noteParts = [
      l.note ? String(l.note) : '',
      noteExtra,
      dueDay && !dueDateIso ? `Thu ngày ${dueDay}/tháng` : '',
    ].filter(Boolean)

    const rawType = String(l.interestType || 'annual')
    const interestType =
      rawType === 'percent_monthly' ||
      rawType === 'per_million_daily' ||
      rawType === 'flat_monthly'
        ? rawType
        : ('annual' as const)

    loans.push({
      id: String(l.id || uid()),
      borrower: String(l.borrowerName || 'Không tên'),
      phone: l.borrowerPhone ? String(l.borrowerPhone) : undefined,
      principal,
      remaining: principal,
      rateAnnual,
      interestType,
      interestValue: Number(l.interestValue) || rateAnnual,
      interestPaid: 0,
      lendDate: String(l.startDate || l.createdAt || now),
      dueDate: dueDateIso,
      status: 'open',
      note: noteParts.join(' · ') || undefined,
      payments,
      linkedCash: false,
      deletedAt: null,
      createdAt: String(l.createdAt || l.startDate || now),
      updatedAt: now,
    })
    report.loans++
  }

  // --- Coin/USDT: chỉ số dư hiện còn ---
  const assets = seedAssets(now)
  const transactions: Transaction[] = []
  let lastUsdtRate = 25_650

  // Net USDT from buys - spent on coins + from sells
  let usdtBought = 0
  let usdtCostVnd = 0
  for (const b of data.crypto?.usdtBuys || []) {
    const u = Number(b.usdtAmount) || 0
    const v =
      Number(b.vndAmount) || u * (Number(b.rate) || lastUsdtRate)
    const rate = Number(b.rate) || (u ? v / u : lastUsdtRate)
    lastUsdtRate = rate
    usdtBought += u
    usdtCostVnd += v
  }

  let usdtSpentOnCoins = 0
  let usdtFromSells = 0
  const coinPositions: Array<{
    symbol: string
    qty: number
    costUsdt: number
    lastPrice: number
  }> = []

  for (const h of data.crypto?.coinHoldings || []) {
    const symbol = String(h.symbol || 'COIN').toUpperCase()
    let qty = 0
    let costUsdt = 0
    let lastPrice = 0

    // FIFO-ish for remaining: process buys then sells
    type Lot = { qty: number; cost: number; price: number }
    const lots: Lot[] = []
    const events: Array<{ t: string; side: 'b' | 's'; row: Record<string, unknown> }> =
      []
    for (const b of (h.buys as Array<Record<string, unknown>>) || []) {
      events.push({ t: String(b.date || ''), side: 'b', row: b })
    }
    for (const s of (h.sells as Array<Record<string, unknown>>) || []) {
      events.push({ t: String(s.date || ''), side: 's', row: s })
    }
    events.sort((a, b) => a.t.localeCompare(b.t))

    for (const ev of events) {
      if (ev.side === 'b') {
        const q = Number(ev.row.coinAmount) || 0
        const c = Number(ev.row.usdtAmount) || 0
        const p = Number(ev.row.price) || (q ? c / q : 0)
        lots.push({ qty: q, cost: c, price: p })
        usdtSpentOnCoins += c
        lastPrice = p
      } else {
        let sellQ = Number(ev.row.coinAmount) || 0
        usdtFromSells +=
          Number(ev.row.usdtReceived) ||
          Number(ev.row.usdtAmount) ||
          sellQ * (Number(ev.row.price) || 0)
        lastPrice = Number(ev.row.price) || lastPrice
        while (sellQ > 0 && lots.length) {
          const lot = lots[0]
          const take = Math.min(lot.qty, sellQ)
          const ratio = lot.qty ? take / lot.qty : 0
          lot.qty -= take
          lot.cost -= lot.cost * ratio
          sellQ -= take
          if (lot.qty <= 1e-12) lots.shift()
        }
      }
    }

    qty = lots.reduce((a, l) => a + l.qty, 0)
    costUsdt = lots.reduce((a, l) => a + l.cost, 0)
    if (qty > 1e-10) {
      coinPositions.push({
        symbol,
        qty,
        costUsdt,
        lastPrice: lastPrice || (qty ? costUsdt / qty : 0),
      })
    }
  }

  const usdtHold = Math.max(0, usdtBought - usdtSpentOnCoins + usdtFromSells)
  const usdtAvg =
    usdtBought > 0 ? usdtCostVnd / usdtBought : lastUsdtRate

  // Adjust current USDT
  if (usdtHold > 0) {
    transactions.push({
      id: uid(),
      kind: 'adjust',
      assetId: USDT_ID,
      side: 'in',
      qty: usdtHold,
      pricePerUnit: usdtAvg,
      priceCurrency: 'VND',
      fee: 0,
      counterAssetId: VND_ID,
      counterQty: usdtHold * usdtAvg,
      tradedAt: now,
      note: 'Import số dư USDT đang hold',
      createdAt: now,
      updatedAt: now,
    })
    report.usdt = usdtHold
  }

  const quotes: Record<string, PriceQuote> = {
    [GOLD_ID]: {
      assetId: GOLD_ID,
      price: 7_820_000,
      priceBid: 7_820_000,
      priceAsk: 7_920_000,
      currency: 'VND',
      label: 'Tiệm',
      quotedAt: now,
    },
    [USDT_ID]: {
      assetId: USDT_ID,
      price: lastUsdtRate,
      currency: 'VND',
      label: 'OTC',
      quotedAt: now,
    },
  }

  for (const c of coinPositions) {
    const id = uid()
    assets.push({
      id,
      assetClass: 'crypto',
      symbol: c.symbol,
      name: c.symbol,
      unit: c.symbol,
      quoteCurrency: 'USDT',
      isBridge: false,
      isSeed: false,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    })
    const price = c.qty ? c.costUsdt / c.qty : c.lastPrice
    transactions.push({
      id: uid(),
      kind: 'adjust',
      assetId: id,
      side: 'in',
      qty: c.qty,
      pricePerUnit: price,
      priceCurrency: 'USDT',
      fee: 0,
      counterAssetId: USDT_ID,
      counterQty: c.costUsdt,
      counterCostVnd: c.costUsdt * usdtAvg,
      tradedAt: now,
      note: `Import hold ${c.symbol}`,
      createdAt: now,
      updatedAt: now,
    })
    quotes[id] = {
      assetId: id,
      price: c.lastPrice || price,
      currency: 'USDT',
      label: 'Import',
      quotedAt: now,
    }
    report.coins++
  }

  const settings: AppSettings = {
    displayCurrency: 'VND',
    enforceUsdtForCrypto: true,
    privacyMode: false,
    defaultUsdtVnd: lastUsdtRate,
    hasOnboarded: true,
  }

  report.notes.push(
    `Chỉ import đang hoạt động: ${report.savings} TK, ${report.loans} cho vay, ${report.coins} coin, ${report.usdt.toFixed(0)} USDT.`,
  )
  if (report.skippedSavings || report.skippedLoans) {
    report.notes.push(
      `Đã bỏ: ${report.skippedSavings} TK tất toán/hết hạn, ${report.skippedLoans} khoản đã thu xong.`,
    )
  }
  if (report.expensesSkipped) {
    report.notes.push(`Bỏ ${report.expensesSkipped} giao dịch chi tiêu.`)
  }

  return {
    state: {
      version: 2,
      assets,
      transactions,
      quotes,
      settings,
      savings,
      loans,
    },
    report,
  }
}
