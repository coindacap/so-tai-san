import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AppSettings,
  AppState,
  Asset,
  Loan,
  LoanInterestType,
  LoanPayment,
  NavFrame,
  PriceQuote,
  SavingsAccount,
  Screen,
  Transaction,
} from '../types'
import { nowIso, uid } from '../lib/format'
import { getBySymbol, qtyHoldAt, usdtAvgCost } from '../lib/calc'
import {
  convertTaiChinhBackup,
  isTaiChinhBackup,
  parseImportText,
} from '../lib/importTaiChinh'
import {
  listSafetyBackups,
  pushSafetyBackup,
  getSafetyBackup,
  type SafetyReason,
} from '../lib/localBackup'
import { pushAppHistory, syncBrowserBack } from '../lib/appHistory'

const STORAGE_KEY = 'so-tai-san-v1'

function seedAssets(): Asset[] {
  const t = nowIso()
  return [
    {
      id: 'asset-vnd',
      assetClass: 'cash',
      symbol: 'VND',
      name: 'Tiền mặt VND',
      unit: 'đ',
      quoteCurrency: 'VND',
      isBridge: false,
      isSeed: true,
      isArchived: false,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: 'asset-usdt',
      assetClass: 'stable',
      symbol: 'USDT',
      name: 'USDT',
      unit: 'USDT',
      quoteCurrency: 'VND',
      isBridge: true,
      isSeed: true,
      isArchived: false,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: 'asset-gold',
      assetClass: 'gold',
      symbol: 'NHAN9999',
      name: 'Vàng nhẫn 9999',
      unit: 'chỉ',
      quoteCurrency: 'VND',
      isBridge: false,
      isSeed: true,
      isArchived: false,
      createdAt: t,
      updatedAt: t,
    },
  ]
}

function seedQuotes(): Record<string, PriceQuote> {
  const t = nowIso()
  return {
    'asset-gold': {
      assetId: 'asset-gold',
      price: 7_820_000,
      priceBid: 7_820_000,
      priceAsk: 7_920_000,
      currency: 'VND',
      label: 'Tiệm',
      quotedAt: t,
    },
    'asset-usdt': {
      assetId: 'asset-usdt',
      price: 25_650,
      currency: 'VND',
      label: 'OTC',
      quotedAt: t,
    },
  }
}

const defaultSettings: AppSettings = {
  displayCurrency: 'VND',
  enforceUsdtForCrypto: true,
  privacyMode: false,
  defaultUsdtVnd: 25_650,
  hasOnboarded: false,
  autoGoldPrice: false,
}

function hasAnyData(s: {
  transactions: unknown[]
  savings: unknown[]
  loans: unknown[]
  settings?: AppSettings
}): boolean {
  return (
    !!s.settings?.hasOnboarded ||
    s.transactions.length > 0 ||
    s.savings.length > 0 ||
    s.loans.length > 0
  )
}

interface NavState {
  screen: Screen
  detailAssetId: string | null
  toast: string | null
  navStack: NavFrame[]
}

interface Actions {
  setScreen: (
    s: Screen,
    detailAssetId?: string | null,
    opts?: { replace?: boolean },
  ) => void
  goBack: (opts?: { fromBrowser?: boolean }) => boolean
  showToast: (msg: string) => void
  clearToast: () => void

  setQuote: (q: PriceQuote) => void
  updateSettings: (p: Partial<AppSettings>) => void

  /** Onboarding: set initial cash / gold / usdt holdings */
  bootstrapHoldings: (input: {
    vnd: number
    usdt: number
    usdtAvg: number
    goldChi: number
    goldAvg: number
  }) => void

  /** Nạp / rút tiền mặt VND (từ ngân hàng, ví, tiền túi…) */
  adjustCash: (input: {
    side: 'deposit' | 'withdraw'
    amount: number
    tradedAt: string
    venue?: string
    note?: string
  }) => { ok: true } | { ok: false; error: string }

  /** VND ↔ USDT */
  convertVndUsdt: (input: {
    direction: 'vnd_to_usdt' | 'usdt_to_vnd'
    usdtQty: number
    rateVnd: number
    fee?: number
    tradedAt: string
    venue?: string
    note?: string
  }) => { ok: true } | { ok: false; error: string }

  /** Buy / sell nhẫn 9999 */
  tradeGold: (input: {
    side: 'buy' | 'sell'
    chi: number
    pricePerChi: number
    fee?: number
    tradedAt: string
    venue?: string
    note?: string
  }) => { ok: true } | { ok: false; error: string }

  /**
   * Mua / ghi nhận coin.
   * deductUsdt=true (mặc định): trừ USDT trong sổ.
   * deductUsdt=false: coin mua từ trước / hold sẵn — không trừ USDT hiện tại
   *   (vẫn ghi giá vốn USDT để tính P/L).
   */
  buyCoin: (input: {
    symbol: string
    name?: string
    qty: number
    usdtSpent: number
    fee?: number
    tradedAt: string
    venue?: string
    note?: string
    deductUsdt?: boolean
  }) => { ok: true } | { ok: false; error: string }

  /** Điều chỉnh số dư USDT (cộng/trừ) không qua mua coin */
  adjustUsdtHold: (input: {
    side: 'in' | 'out'
    qty: number
    costPerUsdtVnd?: number
    tradedAt: string
    note?: string
  }) => { ok: true } | { ok: false; error: string }

  /** Sell crypto for USDT */
  sellCoin: (input: {
    assetId: string
    qty: number
    usdtReceived: number
    fee?: number
    tradedAt: string
    venue?: string
    note?: string
  }) => { ok: true } | { ok: false; error: string }

  ensureCryptoAsset: (symbol: string, name?: string) => string

  // --- Tiết kiệm ---
  addSavings: (input: {
    name: string
    bank: string
    principal: number
    rateAnnual: number
    startDate: string
    maturityDate: string | null
    termMonths: number | null
    note?: string
    linkedCash: boolean
  }) => { ok: true; id: string } | { ok: false; error: string }

  topUpSavings: (input: {
    id: string
    amount: number
    linkedCash: boolean
    tradedAt: string
  }) => { ok: true } | { ok: false; error: string }

  closeSavings: (input: {
    id: string
    amountBack: number
    linkedCash: boolean
    tradedAt: string
  }) => { ok: true } | { ok: false; error: string }

  deleteSavings: (id: string) => void

  // --- Cho vay ---
  addLoan: (input: {
    borrower: string
    phone?: string
    principal: number
    rateAnnual: number
    interestType?: LoanInterestType
    interestValue?: number
    lendDate: string
    dueDate: string | null
    note?: string
    linkedCash: boolean
  }) => { ok: true; id: string } | { ok: false; error: string }

  updateLoan: (
    id: string,
    patch: Partial<
      Pick<
        Loan,
        | 'borrower'
        | 'phone'
        | 'principal'
        | 'remaining'
        | 'rateAnnual'
        | 'interestType'
        | 'interestValue'
        | 'lendDate'
        | 'dueDate'
        | 'note'
        | 'linkedCash'
      >
    >,
  ) => { ok: true } | { ok: false; error: string }

  /** Thu gốc — giảm remaining */
  receiveLoanPayment: (input: {
    id: string
    amount: number
    paidAt: string
    note?: string
    linkedCash: boolean
  }) => { ok: true } | { ok: false; error: string }

  /** Đóng lãi — không giảm remaining */
  payLoanInterest: (input: {
    id: string
    amount: number
    paidAt: string
    note?: string
    linkedCash: boolean
  }) => { ok: true } | { ok: false; error: string }

  /** Đánh dấu không thu được (giữ lịch sử, remaining = 0) */
  writeOffLoan: (id: string) => { ok: true } | { ok: false; error: string }

  /** Ẩn khỏi list — có thể khôi phục */
  softDeleteLoan: (id: string) => { ok: true } | { ok: false; error: string }

  restoreLoan: (id: string) => { ok: true } | { ok: false; error: string }

  /** Xóa vĩnh viễn (thùng rác) */
  hardDeleteLoan: (id: string) => void

  /**
   * Xóa giao dịch + leg cặp (pairId hoặc heuristic).
   * Chụp safety backup trước khi xóa.
   */
  deleteTransaction: (
    id: string,
  ) => { ok: true; removed: number } | { ok: false; error: string }
  /** Sửa ghi chú (áp cả cặp nếu có pairId) */
  updateTransactionNote: (
    id: string,
    note: string,
  ) => { ok: true } | { ok: false; error: string }
  /** Tìm các id cùng cặp (để UI) */
  findPairIds: (id: string) => string[]
  exportJson: () => string
  importJson: (
    raw: string,
  ) =>
    | { ok: true; message?: string }
    | { ok: false; error: string }
  /** Snapshot để đẩy cloud (không gồm nav/toast) */
  getCloudSnapshot: () => {
    version: number
    assets: Asset[]
    transactions: Transaction[]
    quotes: Record<string, PriceQuote>
    settings: AppSettings
    savings: SavingsAccount[]
    loans: Loan[]
    savedAt: string
  }
  /** Áp snapshot từ cloud (ghi đè data, giữ localStorage sync) */
  applyCloudSnapshot: (data: {
    version?: number
    assets: Asset[]
    transactions?: Transaction[]
    quotes?: Record<string, PriceQuote>
    settings?: Partial<AppSettings>
    savings?: SavingsAccount[]
    loans?: Loan[]
  }) => void
  /** Chụp bản an toàn (trước ghi đè). reason: import | cloud-pull | reset | manual */
  saveSafetyBackup: (reason: SafetyReason) => string | null
  listSafetyBackups: () => ReturnType<typeof listSafetyBackups>
  restoreSafetyBackup: (
    id: string,
  ) => { ok: true; message: string } | { ok: false; error: string }
  resetAll: () => void
}

function snapshotCounts(s: {
  transactions: unknown[]
  savings: unknown[]
  loans: unknown[]
}) {
  return {
    tx: s.transactions.length,
    savings: s.savings.length,
    loans: s.loans.length,
  }
}

type Store = AppState & NavState & Actions

function pairTx(
  primary: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'pairId'>,
  counter: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'pairId'>,
): Transaction[] {
  const t = nowIso()
  const pairId = uid()
  return [
    { ...primary, id: uid(), pairId, createdAt: t, updatedAt: t },
    { ...counter, id: uid(), pairId, createdAt: t, updatedAt: t },
  ]
}

/** Ids cùng cặp: pairId hoặc heuristic (giao dịch cũ không có pairId) */
function resolvePairIds(txs: Transaction[], id: string): string[] {
  const tx = txs.find((t) => t.id === id)
  if (!tx) return []
  if (tx.pairId) {
    const same = txs.filter((t) => t.pairId === tx.pairId).map((t) => t.id)
    return same.length ? same : [id]
  }
  // Heuristic: cùng thời điểm + kind + asset/counter đảo
  const mate = txs.find(
    (t) =>
      t.id !== tx.id &&
      !t.pairId &&
      t.tradedAt === tx.tradedAt &&
      t.kind === tx.kind &&
      t.assetId === tx.counterAssetId &&
      t.counterAssetId === tx.assetId &&
      Math.abs(t.qty - (tx.counterQty || 0)) < 1e-9,
  )
  return mate ? [tx.id, mate.id] : [tx.id]
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      version: 2,
      assets: seedAssets(),
      transactions: [],
      quotes: seedQuotes(),
      settings: defaultSettings,
      savings: [],
      loans: [],
      // Mặc định home — onboarding chỉ khi chưa có data sau hydrate
      screen: 'home',
      detailAssetId: null,
      toast: null,
      navStack: [],

      setScreen: (screen, detailAssetId = null, opts) => {
        const cur = get()
        const nextId = detailAssetId === undefined ? null : detailAssetId
        const same =
          cur.screen === screen && cur.detailAssetId === nextId
        if (same) return

        const mainTabs = new Set([
          'home',
          'savings',
          'loans',
          'settings',
          'assets',
          'history',
        ])

        if (opts?.replace || mainTabs.has(screen)) {
          set({
            screen,
            detailAssetId: nextId,
            navStack: mainTabs.has(screen) ? [] : cur.navStack,
          })
          return
        }

        // Push current frame for back / swipe
        const frame: NavFrame = {
          screen: cur.screen,
          detailAssetId: cur.detailAssetId,
        }
        const stack = [...cur.navStack, frame].slice(-30)
        set({ screen, detailAssetId: nextId, navStack: stack })
        // Thêm entry history — Safari vuốt mép trái sẽ popstate trong app, không rời site
        pushAppHistory()
      },

      goBack: (opts?: { fromBrowser?: boolean }) => {
        const cur = get()
        let went = false

        if (cur.navStack.length === 0) {
          // fallback: detail → list tab
          if (cur.screen === 'loan-detail' || cur.screen === 'loan-edit') {
            set({ screen: 'loans', detailAssetId: null })
            went = true
          } else if (
            cur.screen === 'savings-detail' ||
            cur.screen === 'savings-form'
          ) {
            set({ screen: 'savings', detailAssetId: null })
            went = true
          } else if (
            cur.screen === 'gold' ||
            cur.screen === 'asset-detail' ||
            cur.screen === 'buy-gold' ||
            cur.screen === 'sell-gold' ||
            cur.screen === 'usdt' ||
            cur.screen === 'buy-coin' ||
            cur.screen === 'sell-coin' ||
            cur.screen === 'adjust-usdt' ||
            cur.screen === 'prices' ||
            cur.screen === 'cash'
          ) {
            set({ screen: 'home', detailAssetId: null })
            went = true
          } else if (cur.screen === 'loans-trash') {
            set({ screen: 'loans', detailAssetId: null })
            went = true
          } else {
            went = false
          }
        } else {
          const stack = [...cur.navStack]
          const prev = stack.pop()!
          set({
            screen: prev.screen,
            detailAssetId: prev.detailAssetId,
            navStack: stack,
          })
          went = true
        }

        // Nút Back / vuốt trong app: đồng bộ history browser
        // (popstate từ Safari thì không gọi history.back lần nữa)
        if (went && !opts?.fromBrowser) {
          syncBrowserBack()
        }
        return went
      },

      showToast: (msg) => {
        set({ toast: msg })
        const ms = msg.length > 60 ? 4200 : 2000
        setTimeout(() => {
          if (get().toast === msg) set({ toast: null })
        }, ms)
      },
      clearToast: () => set({ toast: null }),

      setQuote: (q) =>
        set((s) => ({
          quotes: { ...s.quotes, [q.assetId]: q },
        })),

      updateSettings: (p) =>
        set((s) => ({ settings: { ...s.settings, ...p } })),

      bootstrapHoldings: (input) => {
        const state = get()
        const vnd = getBySymbol(state, 'VND')!
        const usdt = getBySymbol(state, 'USDT')!
        const gold = getBySymbol(state, 'NHAN9999')!
        const t = nowIso()
        const txs: Transaction[] = []

        if (input.vnd > 0) {
          txs.push({
            id: uid(),
            kind: 'adjust',
            assetId: vnd.id,
            side: 'in',
            qty: input.vnd,
            pricePerUnit: 1,
            priceCurrency: 'VND',
            fee: 0,
            counterAssetId: vnd.id,
            counterQty: 0,
            tradedAt: t,
            note: 'Số dư ban đầu',
            createdAt: t,
            updatedAt: t,
          })
        }
        if (input.usdt > 0) {
          txs.push({
            id: uid(),
            kind: 'adjust',
            assetId: usdt.id,
            side: 'in',
            qty: input.usdt,
            pricePerUnit: input.usdtAvg,
            priceCurrency: 'VND',
            fee: 0,
            counterAssetId: vnd.id,
            counterQty: input.usdt * input.usdtAvg,
            tradedAt: t,
            note: 'Số dư ban đầu',
            createdAt: t,
            updatedAt: t,
          })
        }
        if (input.goldChi > 0) {
          txs.push({
            id: uid(),
            kind: 'adjust',
            assetId: gold.id,
            side: 'in',
            qty: input.goldChi,
            pricePerUnit: input.goldAvg,
            priceCurrency: 'VND',
            fee: 0,
            counterAssetId: vnd.id,
            counterQty: input.goldChi * input.goldAvg,
            tradedAt: t,
            note: 'Số dư ban đầu',
            createdAt: t,
            updatedAt: t,
          })
        }

        set((s) => ({
          transactions: [...s.transactions, ...txs],
          quotes: {
            ...s.quotes,
            [usdt.id]: {
              assetId: usdt.id,
              price: input.usdtAvg || s.settings.defaultUsdtVnd,
              currency: 'VND',
              label: 'OTC',
              quotedAt: t,
            },
            [gold.id]: {
              ...s.quotes[gold.id],
              assetId: gold.id,
              price: input.goldAvg || s.quotes[gold.id]?.price || 7_820_000,
              priceBid: input.goldAvg || s.quotes[gold.id]?.priceBid,
              priceAsk:
                (input.goldAvg || s.quotes[gold.id]?.priceAsk || 7_920_000) *
                1.01,
              currency: 'VND',
              quotedAt: t,
            },
          },
          settings: {
            ...s.settings,
            defaultUsdtVnd: input.usdtAvg || s.settings.defaultUsdtVnd,
            hasOnboarded: true,
          },
          screen: 'home',
        }))
        get().showToast('Đã tạo sổ tài sản')
      },

      adjustCash: (input) => {
        const state = get()
        const vnd = getBySymbol(state, 'VND')!
        const { amount, tradedAt, venue, note } = input
        if (amount <= 0) return { ok: false, error: 'Số tiền phải > 0' }

        if (input.side === 'withdraw') {
          const hold = qtyHoldAt(state, vnd.id)
          if (hold < amount)
            return {
              ok: false,
              error: `Không đủ tiền mặt (còn ${Math.round(hold).toLocaleString('vi-VN')}đ)`,
            }
        }

        const t = nowIso()
        const tx: Transaction = {
          id: uid(),
          kind: 'adjust',
          assetId: vnd.id,
          side: input.side === 'deposit' ? 'in' : 'out',
          qty: amount,
          pricePerUnit: 1,
          priceCurrency: 'VND',
          fee: 0,
          counterAssetId: vnd.id,
          counterQty: 0,
          tradedAt,
          venue,
          note:
            note ||
            (input.side === 'deposit'
              ? 'Nạp tiền mặt vào sổ'
              : 'Rút tiền mặt khỏi sổ'),
          createdAt: t,
          updatedAt: t,
        }
        set((s) => ({ transactions: [...s.transactions, tx] }))
        return { ok: true }
      },

      convertVndUsdt: (input) => {
        const state = get()
        const vnd = getBySymbol(state, 'VND')!
        const usdt = getBySymbol(state, 'USDT')!
        const { usdtQty, rateVnd, fee = 0, tradedAt, venue, note } = input
        if (usdtQty <= 0 || rateVnd <= 0)
          return { ok: false, error: 'Số lượng / giá không hợp lệ' }

        const vndAmount = usdtQty * rateVnd + fee

        if (input.direction === 'vnd_to_usdt') {
          const hold = qtyHoldAt(state, vnd.id)
          if (hold < vndAmount)
            return {
              ok: false,
              error: `Không đủ VND (còn ${Math.round(hold).toLocaleString('vi-VN')}đ)`,
            }
          const txs = pairTx(
            {
              kind: 'convert',
              assetId: usdt.id,
              side: 'in',
              qty: usdtQty,
              pricePerUnit: rateVnd,
              priceCurrency: 'VND',
              fee,
              counterAssetId: vnd.id,
              counterQty: vndAmount,
              tradedAt,
              venue,
              note,
            },
            {
              kind: 'convert',
              assetId: vnd.id,
              side: 'out',
              qty: vndAmount,
              pricePerUnit: 1,
              priceCurrency: 'VND',
              fee: 0,
              counterAssetId: usdt.id,
              counterQty: usdtQty,
              tradedAt,
              venue,
              note,
            },
          )
          set((s) => ({
            transactions: [...s.transactions, ...txs],
            quotes: {
              ...s.quotes,
              [usdt.id]: {
                assetId: usdt.id,
                price: rateVnd,
                currency: 'VND',
                label: venue || 'OTC',
                quotedAt: tradedAt,
              },
            },
            settings: { ...s.settings, defaultUsdtVnd: rateVnd },
          }))
        } else {
          const hold = qtyHoldAt(state, usdt.id)
          if (hold < usdtQty)
            return { ok: false, error: `Không đủ USDT (còn ${hold})` }
          const vndIn = usdtQty * rateVnd - fee
          const txs = pairTx(
            {
              kind: 'convert',
              assetId: usdt.id,
              side: 'out',
              qty: usdtQty,
              pricePerUnit: rateVnd,
              priceCurrency: 'VND',
              fee,
              counterAssetId: vnd.id,
              counterQty: vndIn,
              tradedAt,
              venue,
              note,
            },
            {
              kind: 'convert',
              assetId: vnd.id,
              side: 'in',
              qty: vndIn,
              pricePerUnit: 1,
              priceCurrency: 'VND',
              fee: 0,
              counterAssetId: usdt.id,
              counterQty: usdtQty,
              tradedAt,
              venue,
              note,
            },
          )
          set((s) => ({
            transactions: [...s.transactions, ...txs],
            quotes: {
              ...s.quotes,
              [usdt.id]: {
                assetId: usdt.id,
                price: rateVnd,
                currency: 'VND',
                label: venue || 'OTC',
                quotedAt: tradedAt,
              },
            },
            settings: { ...s.settings, defaultUsdtVnd: rateVnd },
          }))
        }
        return { ok: true }
      },

      tradeGold: (input) => {
        const state = get()
        const gold = getBySymbol(state, 'NHAN9999')!
        const vnd = getBySymbol(state, 'VND')!
        const { chi, pricePerChi, fee = 0, tradedAt, venue, note } = input
        if (chi <= 0 || pricePerChi <= 0)
          return { ok: false, error: 'Số chỉ / giá không hợp lệ' }

        if (input.side === 'buy') {
          const money = chi * pricePerChi + fee
          const hold = qtyHoldAt(state, vnd.id)
          if (hold < money)
            return {
              ok: false,
              error: `Không đủ VND (cần ${Math.round(money).toLocaleString('vi-VN')}đ)`,
            }
          const txs = pairTx(
            {
              kind: 'buy',
              assetId: gold.id,
              side: 'in',
              qty: chi,
              pricePerUnit: pricePerChi,
              priceCurrency: 'VND',
              fee,
              counterAssetId: vnd.id,
              counterQty: money,
              tradedAt,
              venue,
              note,
            },
            {
              kind: 'buy',
              assetId: vnd.id,
              side: 'out',
              qty: money,
              pricePerUnit: 1,
              priceCurrency: 'VND',
              fee: 0,
              counterAssetId: gold.id,
              counterQty: chi,
              tradedAt,
              venue,
              note,
            },
          )
          set((s) => {
            const prev = s.quotes[gold.id]
            return {
              transactions: [...s.transactions, ...txs],
              quotes: {
                ...s.quotes,
                [gold.id]: {
                  assetId: gold.id,
                  price: prev?.priceBid ?? pricePerChi,
                  priceBid: prev?.priceBid ?? pricePerChi * 0.99,
                  priceAsk: pricePerChi,
                  currency: 'VND',
                  label: venue || 'Tiệm',
                  quotedAt: tradedAt,
                },
              },
            }
          })
        } else {
          const hold = qtyHoldAt(state, gold.id)
          if (hold < chi)
            return { ok: false, error: `Chỉ còn hold ${hold} chỉ` }
          const money = chi * pricePerChi - fee
          const txs = pairTx(
            {
              kind: 'sell',
              assetId: gold.id,
              side: 'out',
              qty: chi,
              pricePerUnit: pricePerChi,
              priceCurrency: 'VND',
              fee,
              counterAssetId: vnd.id,
              counterQty: money,
              tradedAt,
              venue,
              note,
            },
            {
              kind: 'sell',
              assetId: vnd.id,
              side: 'in',
              qty: money,
              pricePerUnit: 1,
              priceCurrency: 'VND',
              fee: 0,
              counterAssetId: gold.id,
              counterQty: chi,
              tradedAt,
              venue,
              note,
            },
          )
          set((s) => {
            const prev = s.quotes[gold.id]
            return {
              transactions: [...s.transactions, ...txs],
              quotes: {
                ...s.quotes,
                [gold.id]: {
                  assetId: gold.id,
                  price: pricePerChi,
                  priceBid: pricePerChi,
                  priceAsk: prev?.priceAsk ?? pricePerChi * 1.01,
                  currency: 'VND',
                  label: venue || 'Tiệm',
                  quotedAt: tradedAt,
                },
              },
            }
          })
        }
        return { ok: true }
      },

      ensureCryptoAsset: (symbol, name) => {
        const state = get()
        const sym = symbol.trim().toUpperCase()
        const existing = state.assets.find(
          (a) => a.symbol === sym && a.assetClass === 'crypto',
        )
        if (existing) return existing.id
        const t = nowIso()
        const id = uid()
        const asset: Asset = {
          id,
          assetClass: 'crypto',
          symbol: sym,
          name: name?.trim() || sym,
          unit: sym,
          quoteCurrency: 'USDT',
          isBridge: false,
          isSeed: false,
          isArchived: false,
          createdAt: t,
          updatedAt: t,
        }
        set((s) => ({ assets: [...s.assets, asset] }))
        return id
      },

      buyCoin: (input) => {
        const state = get()
        const usdt = getBySymbol(state, 'USDT')!
        const {
          qty,
          usdtSpent,
          fee = 0,
          tradedAt,
          venue,
          note,
          deductUsdt = true,
        } = input
        if (qty <= 0 || usdtSpent < 0)
          return { ok: false, error: 'Số lượng / giá vốn USDT không hợp lệ' }
        // hold sẵn: cho phép usdtSpent = 0 (không biết giá vốn)
        if (deductUsdt && usdtSpent <= 0)
          return { ok: false, error: 'Số USDT chi phải > 0' }

        const totalUsdt = usdtSpent + fee
        const assetId = get().ensureCryptoAsset(input.symbol, input.name)
        const pricePerUnit = qty > 0 ? totalUsdt / qty : 0
        const avgUsdt = usdtAvgCost(get()) || state.settings.defaultUsdtVnd
        const counterCostVnd = totalUsdt * avgUsdt
        const t = nowIso()

        // Coin cũ / hold sẵn: chỉ ghi coin, KHÔNG trừ USDT
        if (!deductUsdt) {
          const tx: Transaction = {
            id: uid(),
            kind: 'adjust',
            assetId,
            side: 'in',
            qty,
            pricePerUnit: pricePerUnit || 0,
            priceCurrency: 'USDT',
            fee: 0,
            counterAssetId: usdt.id,
            counterQty: totalUsdt,
            counterCostVnd,
            tradedAt,
            venue: venue || 'Hold cũ',
            note:
              note ||
              'Hold sẵn / mua từ trước — không trừ USDT hiện tại',
            createdAt: t,
            updatedAt: t,
          }
          set((s) => ({
            transactions: [...s.transactions, tx],
            quotes: {
              ...s.quotes,
              [assetId]: {
                assetId,
                price: pricePerUnit || s.quotes[assetId]?.price || 0,
                currency: 'USDT',
                label: venue || 'Hold cũ',
                quotedAt: tradedAt,
              },
            },
          }))
          return { ok: true }
        }

        const hold = qtyHoldAt(state, usdt.id)
        if (hold < totalUsdt)
          return { ok: false, error: `Không đủ USDT (còn ${hold})` }

        const txs = pairTx(
          {
            kind: 'buy',
            assetId,
            side: 'in',
            qty,
            pricePerUnit,
            priceCurrency: 'USDT',
            fee,
            counterAssetId: usdt.id,
            counterQty: totalUsdt,
            counterCostVnd,
            tradedAt,
            venue,
            note,
          },
          {
            kind: 'buy',
            assetId: usdt.id,
            side: 'out',
            qty: totalUsdt,
            pricePerUnit: avgUsdt,
            priceCurrency: 'VND',
            fee: 0,
            counterAssetId: assetId,
            counterQty: qty,
            counterCostVnd,
            tradedAt,
            venue,
            note,
          },
        )
        set((s) => ({
          transactions: [...s.transactions, ...txs],
          quotes: {
            ...s.quotes,
            [assetId]: {
              assetId,
              price: pricePerUnit,
              currency: 'USDT',
              label: venue || 'Sàn',
              quotedAt: tradedAt,
            },
          },
        }))
        return { ok: true }
      },

      adjustUsdtHold: (input) => {
        const state = get()
        const usdt = getBySymbol(state, 'USDT')!
        if (input.qty <= 0) return { ok: false, error: 'Số USDT phải > 0' }
        if (input.side === 'out') {
          const hold = qtyHoldAt(state, usdt.id)
          if (hold < input.qty)
            return { ok: false, error: `Chỉ còn ${hold} USDT` }
        }
        const cost =
          input.costPerUsdtVnd ||
          usdtAvgCost(state) ||
          state.settings.defaultUsdtVnd
        const t = nowIso()
        const tx: Transaction = {
          id: uid(),
          kind: 'adjust',
          assetId: usdt.id,
          side: input.side,
          qty: input.qty,
          pricePerUnit: cost,
          priceCurrency: 'VND',
          fee: 0,
          counterAssetId: usdt.id,
          counterQty: 0,
          counterCostVnd: input.qty * cost,
          tradedAt: input.tradedAt,
          note: input.note || 'Điều chỉnh USDT',
          createdAt: t,
          updatedAt: t,
        }
        set((s) => ({ transactions: [...s.transactions, tx] }))
        return { ok: true }
      },

      sellCoin: (input) => {
        const state = get()
        const usdt = getBySymbol(state, 'USDT')!
        const { assetId, qty, usdtReceived, fee = 0, tradedAt, venue, note } =
          input
        if (qty <= 0 || usdtReceived <= 0)
          return { ok: false, error: 'Số lượng / USDT không hợp lệ' }
        const hold = qtyHoldAt(state, assetId)
        if (hold < qty) return { ok: false, error: `Chỉ còn hold ${hold}` }

        const netUsdt = usdtReceived - fee
        const pricePerUnit = usdtReceived / qty
        const rate = state.settings.defaultUsdtVnd
        const counterCostVnd = netUsdt * rate

        const txs = pairTx(
          {
            kind: 'sell',
            assetId,
            side: 'out',
            qty,
            pricePerUnit,
            priceCurrency: 'USDT',
            fee,
            counterAssetId: usdt.id,
            counterQty: netUsdt,
            counterCostVnd,
            tradedAt,
            venue,
            note,
          },
          {
            kind: 'sell',
            assetId: usdt.id,
            side: 'in',
            qty: netUsdt,
            pricePerUnit: rate,
            priceCurrency: 'VND',
            fee: 0,
            counterAssetId: assetId,
            counterQty: qty,
            counterCostVnd,
            tradedAt,
            venue,
            note,
          },
        )
        set((s) => ({
          transactions: [...s.transactions, ...txs],
          quotes: {
            ...s.quotes,
            [assetId]: {
              assetId,
              price: pricePerUnit,
              currency: 'USDT',
              quotedAt: tradedAt,
            },
          },
        }))
        return { ok: true }
      },

      addSavings: (input) => {
        if (input.principal <= 0)
          return { ok: false, error: 'Số tiền gửi phải > 0' }
        if (!input.name.trim())
          return { ok: false, error: 'Nhập tên khoản tiết kiệm' }

        const state = get()
        if (input.linkedCash) {
          const vnd = getBySymbol(state, 'VND')!
          const hold = qtyHoldAt(state, vnd.id)
          if (hold < input.principal)
            return {
              ok: false,
              error: `Không đủ tiền mặt (còn ${Math.round(hold).toLocaleString('vi-VN')}đ). Nạp VND hoặc tắt “trừ tiền mặt”.`,
            }
          const cashRes = get().adjustCash({
            side: 'withdraw',
            amount: input.principal,
            tradedAt: input.startDate,
            venue: input.bank,
            note: `Gửi tiết kiệm: ${input.name}`,
          })
          if (!cashRes.ok) return cashRes
        }

        const t = nowIso()
        const id = uid()
        const row: SavingsAccount = {
          id,
          name: input.name.trim(),
          bank: input.bank.trim() || 'Ngân hàng',
          principal: input.principal,
          rateAnnual: input.rateAnnual || 0,
          startDate: input.startDate,
          maturityDate: input.maturityDate,
          termMonths: input.termMonths,
          status: 'active',
          note: input.note,
          linkedCash: input.linkedCash,
          createdAt: t,
          updatedAt: t,
        }
        set((s) => ({ savings: [row, ...s.savings] }))
        return { ok: true, id }
      },

      topUpSavings: (input) => {
        if (input.amount <= 0) return { ok: false, error: 'Số tiền phải > 0' }
        const s = get().savings.find((x) => x.id === input.id)
        if (!s || s.status !== 'active')
          return { ok: false, error: 'Không tìm thấy khoản đang mở' }

        if (input.linkedCash) {
          const cashRes = get().adjustCash({
            side: 'withdraw',
            amount: input.amount,
            tradedAt: input.tradedAt,
            venue: s.bank,
            note: `Gửi thêm TK: ${s.name}`,
          })
          if (!cashRes.ok) return cashRes
        }

        set((st) => ({
          savings: st.savings.map((x) =>
            x.id === input.id
              ? {
                  ...x,
                  principal: x.principal + input.amount,
                  updatedAt: nowIso(),
                }
              : x,
          ),
        }))
        return { ok: true }
      },

      closeSavings: (input) => {
        if (input.amountBack < 0)
          return { ok: false, error: 'Số tiền nhận không hợp lệ' }
        const s = get().savings.find((x) => x.id === input.id)
        if (!s || s.status !== 'active')
          return { ok: false, error: 'Không tìm thấy khoản đang mở' }

        if (input.linkedCash && input.amountBack > 0) {
          const cashRes = get().adjustCash({
            side: 'deposit',
            amount: input.amountBack,
            tradedAt: input.tradedAt,
            venue: s.bank,
            note: `Tất toán TK: ${s.name}`,
          })
          if (!cashRes.ok) return cashRes
        }

        set((st) => ({
          savings: st.savings.map((x) =>
            x.id === input.id
              ? {
                  ...x,
                  principal: 0,
                  status: 'closed' as const,
                  updatedAt: nowIso(),
                }
              : x,
          ),
        }))
        return { ok: true }
      },

      deleteSavings: (id) =>
        set((s) => ({ savings: s.savings.filter((x) => x.id !== id) })),

      addLoan: (input) => {
        if (input.principal <= 0)
          return { ok: false, error: 'Số tiền cho vay phải > 0' }
        if (!input.borrower.trim())
          return { ok: false, error: 'Nhập tên người vay' }

        if (input.linkedCash) {
          const cashRes = get().adjustCash({
            side: 'withdraw',
            amount: input.principal,
            tradedAt: input.lendDate,
            venue: input.borrower,
            note: `Cho vay: ${input.borrower}`,
          })
          if (!cashRes.ok) return cashRes
        }

        const t = nowIso()
        const id = uid()
        const row: Loan = {
          id,
          borrower: input.borrower.trim(),
          phone: input.phone?.trim() || undefined,
          principal: input.principal,
          remaining: input.principal,
          rateAnnual: input.rateAnnual || 0,
          interestType: input.interestType || 'annual',
          interestValue: input.interestValue ?? input.rateAnnual ?? 0,
          interestPaid: 0,
          lendDate: input.lendDate,
          dueDate: input.dueDate,
          status: 'open',
          note: input.note,
          payments: [],
          linkedCash: input.linkedCash,
          deletedAt: null,
          createdAt: t,
          updatedAt: t,
        }
        set((s) => ({ loans: [row, ...s.loans] }))
        return { ok: true, id }
      },

      updateLoan: (id, patch) => {
        const loan = get().loans.find((x) => x.id === id)
        if (!loan) return { ok: false, error: 'Không tìm thấy khoản vay' }
        if (loan.deletedAt) return { ok: false, error: 'Khoản đã xóa — hãy khôi phục trước' }

        let remaining = patch.remaining ?? loan.remaining
        let principal = patch.principal ?? loan.principal
        if (principal < 0) return { ok: false, error: 'Gốc không hợp lệ' }
        if (remaining < 0) return { ok: false, error: 'Còn thu không hợp lệ' }
        if (remaining > principal) remaining = principal

        let status: Loan['status'] = loan.status
        if (status !== 'written_off') {
          if (remaining <= 0) status = 'paid'
          else if (remaining < principal) status = 'partial'
          else status = 'open'
        }

        set((st) => ({
          loans: st.loans.map((x) =>
            x.id === id
              ? {
                  ...x,
                  ...patch,
                  principal,
                  remaining,
                  status,
                  phone: patch.phone !== undefined ? patch.phone || undefined : x.phone,
                  updatedAt: nowIso(),
                }
              : x,
          ),
        }))
        return { ok: true }
      },

      receiveLoanPayment: (input) => {
        if (input.amount <= 0) return { ok: false, error: 'Số thu phải > 0' }
        const loan = get().loans.find((x) => x.id === input.id)
        if (!loan) return { ok: false, error: 'Không tìm thấy khoản vay' }
        if (loan.deletedAt) return { ok: false, error: 'Khoản đã ở thùng rác' }
        if (loan.status === 'paid' || loan.status === 'written_off')
          return { ok: false, error: 'Khoản này đã đóng' }
        if (input.amount > loan.remaining + 0.001)
          return {
            ok: false,
            error: `Chỉ còn phải thu gốc ${Math.round(loan.remaining).toLocaleString('vi-VN')}đ`,
          }

        if (input.linkedCash) {
          const cashRes = get().adjustCash({
            side: 'deposit',
            amount: input.amount,
            tradedAt: input.paidAt,
            venue: loan.borrower,
            note: `Thu gốc: ${loan.borrower}`,
          })
          if (!cashRes.ok) return cashRes
        }

        const pay: LoanPayment = {
          id: uid(),
          amount: input.amount,
          paidAt: input.paidAt,
          note: input.note,
          type: 'principal',
        }
        const remaining = Math.max(0, loan.remaining - input.amount)
        const status: Loan['status'] =
          remaining <= 0 ? 'paid' : remaining < loan.principal ? 'partial' : 'open'

        set((st) => ({
          loans: st.loans.map((x) =>
            x.id === input.id
              ? {
                  ...x,
                  remaining,
                  status,
                  payments: [...x.payments, pay],
                  updatedAt: nowIso(),
                }
              : x,
          ),
        }))
        return { ok: true }
      },

      payLoanInterest: (input) => {
        if (input.amount <= 0) return { ok: false, error: 'Số lãi phải > 0' }
        const loan = get().loans.find((x) => x.id === input.id)
        if (!loan) return { ok: false, error: 'Không tìm thấy khoản vay' }
        if (loan.deletedAt) return { ok: false, error: 'Khoản đã ở thùng rác' }
        if (loan.status === 'written_off')
          return { ok: false, error: 'Khoản đã xóa nợ' }

        if (input.linkedCash) {
          const cashRes = get().adjustCash({
            side: 'deposit',
            amount: input.amount,
            tradedAt: input.paidAt,
            venue: loan.borrower,
            note: `Đóng lãi: ${loan.borrower}`,
          })
          if (!cashRes.ok) return cashRes
        }

        const pay: LoanPayment = {
          id: uid(),
          amount: input.amount,
          paidAt: input.paidAt,
          note: input.note || 'Đóng lãi',
          type: 'interest',
        }

        set((st) => ({
          loans: st.loans.map((x) =>
            x.id === input.id
              ? {
                  ...x,
                  interestPaid: (x.interestPaid || 0) + input.amount,
                  payments: [...x.payments, pay],
                  updatedAt: nowIso(),
                }
              : x,
          ),
        }))
        return { ok: true }
      },

      writeOffLoan: (id) => {
        const loan = get().loans.find((x) => x.id === id)
        if (!loan) return { ok: false, error: 'Không tìm thấy' }
        set((st) => ({
          loans: st.loans.map((x) =>
            x.id === id
              ? {
                  ...x,
                  status: 'written_off' as const,
                  remaining: 0,
                  updatedAt: nowIso(),
                  note: x.note
                    ? `${x.note} · [Xóa nợ — không thu được]`
                    : '[Xóa nợ — không thu được]',
                }
              : x,
          ),
        }))
        return { ok: true }
      },

      softDeleteLoan: (id) => {
        const loan = get().loans.find((x) => x.id === id)
        if (!loan) return { ok: false, error: 'Không tìm thấy' }
        set((st) => ({
          loans: st.loans.map((x) =>
            x.id === id
              ? { ...x, deletedAt: nowIso(), updatedAt: nowIso() }
              : x,
          ),
        }))
        return { ok: true }
      },

      restoreLoan: (id) => {
        const loan = get().loans.find((x) => x.id === id)
        if (!loan) return { ok: false, error: 'Không tìm thấy' }
        set((st) => ({
          loans: st.loans.map((x) =>
            x.id === id
              ? { ...x, deletedAt: null, updatedAt: nowIso() }
              : x,
          ),
        }))
        return { ok: true }
      },

      hardDeleteLoan: (id) =>
        set((s) => ({ loans: s.loans.filter((x) => x.id !== id) })),

      findPairIds: (id) => resolvePairIds(get().transactions, id),

      deleteTransaction: (id) => {
        const cur = get()
        const ids = resolvePairIds(cur.transactions, id)
        if (ids.length === 0) return { ok: false, error: 'Không tìm thấy giao dịch' }
        if (hasAnyData(cur)) {
          pushSafetyBackup('manual', cur.exportJson(), snapshotCounts(cur))
        }
        const remove = new Set(ids)
        set((s) => ({
          transactions: s.transactions.filter((t) => !remove.has(t.id)),
        }))
        return { ok: true, removed: ids.length }
      },

      updateTransactionNote: (id, note) => {
        const cur = get()
        const ids = resolvePairIds(cur.transactions, id)
        if (ids.length === 0) return { ok: false, error: 'Không tìm thấy giao dịch' }
        const setIds = new Set(ids)
        const t = nowIso()
        const trimmed = note.trim()
        set((s) => ({
          transactions: s.transactions.map((tx) =>
            setIds.has(tx.id)
              ? {
                  ...tx,
                  note: trimmed || undefined,
                  updatedAt: t,
                }
              : tx,
          ),
        }))
        return { ok: true }
      },

      exportJson: () => {
        const s = get()
        return JSON.stringify(
          {
            version: s.version,
            assets: s.assets,
            transactions: s.transactions,
            quotes: s.quotes,
            settings: s.settings,
            savings: s.savings,
            loans: s.loans,
            exportedAt: nowIso(),
          },
          null,
          2,
        )
      },

      getCloudSnapshot: () => {
        const s = get()
        return {
          version: s.version,
          assets: s.assets,
          transactions: s.transactions,
          quotes: s.quotes,
          settings: s.settings,
          savings: s.savings,
          loans: s.loans,
          savedAt: nowIso(),
        }
      },

      applyCloudSnapshot: (data) => {
        // An toàn: chụp local trước khi cloud ghi đè
        const cur = get()
        if (hasAnyData(cur)) {
          pushSafetyBackup(
            'cloud-pull',
            cur.exportJson(),
            snapshotCounts(cur),
          )
        }
        const loans = (data.loans ?? []).map((l) => ({
          ...l,
          interestPaid: l.interestPaid ?? 0,
          deletedAt: l.deletedAt ?? null,
          interestType: l.interestType ?? ('annual' as const),
          interestValue: l.interestValue ?? l.rateAnnual ?? 0,
        }))
        const settings = {
          ...defaultSettings,
          ...data.settings,
          hasOnboarded: true,
        }
        set({
          version: data.version ?? 2,
          assets: data.assets?.length ? data.assets : seedAssets(),
          transactions: data.transactions ?? [],
          quotes: data.quotes ?? seedQuotes(),
          settings,
          savings: data.savings ?? [],
          loans,
          screen: 'home',
          detailAssetId: null,
          navStack: [],
        })
      },

      saveSafetyBackup: (reason) => {
        const s = get()
        return pushSafetyBackup(reason, s.exportJson(), snapshotCounts(s))
      },

      listSafetyBackups: () => listSafetyBackups(),

      restoreSafetyBackup: (id) => {
        const bk = getSafetyBackup(id)
        if (!bk?.payload) return { ok: false, error: 'Không tìm thấy bản lưu' }
        // Chụp sổ hiện tại trước khi khôi phục
        const cur = get()
        if (hasAnyData(cur)) {
          pushSafetyBackup('manual', cur.exportJson(), snapshotCounts(cur))
        }
        const res = get().importJson(bk.payload)
        if (!res.ok) return res
        return {
          ok: true,
          message: `Đã khôi phục bản ${bk.label} · ${new Date(bk.createdAt).toLocaleString('vi-VN')}`,
        }
      },

      importJson: (raw) => {
        try {
          const data = parseImportText(raw) as Record<string, unknown>

          // Chụp sổ hiện tại trước khi import ghi đè
          const cur = get()
          if (hasAnyData(cur)) {
            pushSafetyBackup('import', cur.exportJson(), snapshotCounts(cur))
          }

          // Backup app QuanLyTaiChinh (iOS)
          if (isTaiChinhBackup(data)) {
            const { state, report } = convertTaiChinhBackup(data)
            set({
              version: state.version,
              assets: state.assets,
              transactions: state.transactions,
              quotes: state.quotes,
              settings: {
                ...defaultSettings,
                ...state.settings,
                hasOnboarded: true,
              },
              savings: state.savings,
              loans: state.loans,
              screen: 'home',
              detailAssetId: null,
            })
            return {
              ok: true,
              message:
                (report.notes.join(' ') ||
                  `OK: ${report.savings} TK, ${report.loans} vay, ${report.coins} coin`) +
                ' · Đã giữ bản local cũ trong Sao lưu an toàn',
            }
          }

          // Backup Sổ Tài Sản
          if (Array.isArray(data.assets)) {
            const settings = {
              ...defaultSettings,
              ...(data.settings as object),
              hasOnboarded: true,
            }
            set({
              assets: data.assets as AppState['assets'],
              transactions: (data.transactions as AppState['transactions']) || [],
              quotes: (data.quotes as AppState['quotes']) || seedQuotes(),
              settings,
              savings: (data.savings as AppState['savings']) || [],
              loans: (data.loans as AppState['loans']) || [],
              version: (data.version as number) || 2,
              screen: 'home',
              detailAssetId: null,
            })
            return {
              ok: true,
              message:
                'Đã import backup Sổ Tài Sản · Bản local cũ nằm trong Sao lưu an toàn',
            }
          }

          const keys = Object.keys(data).slice(0, 8).join(', ')
          return {
            ok: false,
            error: `Không nhận ra định dạng backup (keys: ${keys}). Cần file QuanLyTaiChinh hoặc Sổ Tài Sản.`,
          }
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : 'Không đọc được JSON',
          }
        }
      },

      resetAll: () => {
        const cur = get()
        if (hasAnyData(cur)) {
          pushSafetyBackup('reset', cur.exportJson(), snapshotCounts(cur))
        }
        set({
          assets: seedAssets(),
          transactions: [],
          quotes: seedQuotes(),
          settings: { ...defaultSettings, hasOnboarded: false },
          savings: [],
          loans: [],
          screen: 'onboarding',
          detailAssetId: null,
        })
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({
        version: s.version,
        assets: s.assets,
        transactions: s.transactions,
        quotes: s.quotes,
        settings: s.settings,
        savings: s.savings,
        loans: s.loans,
      }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<
          Pick<
            Store,
            | 'version'
            | 'assets'
            | 'transactions'
            | 'quotes'
            | 'settings'
            | 'savings'
            | 'loans'
          >
        >
        const settings = {
          ...defaultSettings,
          ...p.settings,
          autoGoldPrice: p.settings?.autoGoldPrice ?? false,
          hasOnboarded:
            p.settings?.hasOnboarded ||
            hasAnyData({
              transactions: p.transactions || [],
              savings: p.savings || [],
              loans: p.loans || [],
              settings: p.settings,
            }),
        }
        // migrate old loans missing new fields
        const loans = (p.loans ?? []).map((l) => ({
          ...l,
          interestPaid: l.interestPaid ?? 0,
          deletedAt: l.deletedAt ?? null,
          interestType: l.interestType ?? ('annual' as const),
          interestValue: l.interestValue ?? l.rateAnnual ?? 0,
        }))
        const merged = {
          ...current,
          version: p.version ?? current.version,
          assets: p.assets?.length ? p.assets : current.assets,
          transactions: p.transactions ?? [],
          quotes: p.quotes ?? current.quotes,
          settings,
          savings: p.savings ?? [],
          loans,
          navStack: [],
        }
        merged.screen = hasAnyData(merged) ? 'home' : 'onboarding'
        return merged
      },
      onRehydrateStorage: () => (state, err) => {
        if (err) {
          console.error('rehydrate error', err)
          return
        }
        if (!state) return
        // setState sau rehydrate để chắc chắn UI cập nhật (iOS)
        setTimeout(() => {
          const s = useStore.getState()
          const next = hasAnyData(s) ? 'home' : 'onboarding'
          if (s.screen !== next || !s.settings.hasOnboarded) {
            useStore.setState({
              screen: next,
              settings: {
                ...s.settings,
                hasOnboarded: s.settings.hasOnboarded || hasAnyData(s),
              },
            })
          }
        }, 0)
      },
    },
  ),
)
