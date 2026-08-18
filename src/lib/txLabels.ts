import type { Asset, ExpenseEntry, Transaction } from '../types'

export type TxLabelContext = {
  assets: Asset[]
  expenses?: ExpenseEntry[]
}

function assetOf(assets: Asset[], id: string): Asset | undefined {
  return assets.find((a) => a.id === id)
}

/** Phân loại adjust để UI/History không gộp chung “Điều chỉnh” */
export type AdjustKind =
  | 'expense_cash'
  | 'income_cash'
  | 'savings'
  | 'loan'
  | 'cash_deposit'
  | 'cash_withdraw'
  | 'usdt_hold'
  | 'coin_old_hold'
  | 'cost_basis'
  | 'bootstrap'
  | 'other'

export function classifyAdjust(
  t: Transaction,
  ctx: TxLabelContext,
): AdjustKind {
  if (t.costBasisDeltaNative != null) return 'cost_basis'

  const exp = ctx.expenses?.find((e) => e.cashTxId === t.id)
  if (exp) return exp.kind === 'income' ? 'income_cash' : 'expense_cash'

  const note = (t.note || '').toLowerCase()
  const venue = (t.venue || '').toLowerCase()

  if (
    note.includes('chi tiêu') ||
    note.startsWith('chi tiêu') ||
    note.includes('thu nhập')
  ) {
    return note.includes('thu') ? 'income_cash' : 'expense_cash'
  }
  if (
    note.includes('tiết kiệm') ||
    note.includes('gửi tiết kiệm') ||
    note.includes('gửi thêm tk') ||
    note.includes('tất toán tk')
  ) {
    return 'savings'
  }
  if (note.includes('cho vay') || note.includes('thu nợ') || note.includes('thu gốc')) {
    return 'loan'
  }
  if (
    note.includes('nạp tiền mặt') ||
    note.includes('nạp vào sổ') ||
    (t.assetId === 'asset-vnd' && t.side === 'in' && note.includes('nạp'))
  ) {
    return 'cash_deposit'
  }
  if (
    note.includes('rút tiền mặt') ||
    note.includes('rút khỏi sổ') ||
    (t.assetId === 'asset-vnd' &&
      t.side === 'out' &&
      (note.includes('rút') || venue.includes('ngân hàng')))
  ) {
    // Chỉ khi không phải expense/savings/loan đã match ở trên
    if (
      !note.includes('chi tiêu') &&
      !note.includes('tiết kiệm') &&
      !note.includes('cho vay')
    ) {
      return t.side === 'in' ? 'cash_deposit' : 'cash_withdraw'
    }
  }

  const asset = assetOf(ctx.assets, t.assetId)
  if (asset?.symbol === 'USDT' && (t.counterQty === 0 || t.counterAssetId === t.assetId)) {
    return 'usdt_hold'
  }
  if (
    asset?.assetClass === 'crypto' &&
    (note.includes('hold sẵn') ||
      note.includes('mua từ trước') ||
      venue.includes('hold cũ'))
  ) {
    return 'coin_old_hold'
  }
  if (note.includes('onboarding') || note.includes('số dư ban đầu') || note.includes('bootstrap')) {
    return 'bootstrap'
  }
  if (asset?.symbol === 'VND' && t.side === 'in') return 'cash_deposit'
  if (asset?.symbol === 'VND' && t.side === 'out') return 'cash_withdraw'
  if (asset?.symbol === 'USDT') return 'usdt_hold'
  if (asset?.assetClass === 'crypto') return 'coin_old_hold'
  return 'other'
}

/** Nhãn ngắn cho list History / chi tiết */
export function kindLabel(t: Transaction, ctx: TxLabelContext): string {
  if (t.costBasisDeltaNative != null) return 'Sửa giá vốn'

  if (t.kind === 'convert') {
    return t.side === 'in' ? 'Đổi · nhận' : 'Đổi · chi'
  }
  if (t.kind === 'buy') {
    return t.side === 'in' ? 'Mua' : 'Chi (mua)'
  }
  if (t.kind === 'sell') {
    return t.side === 'out' ? 'Bán' : 'Nhận (bán)'
  }

  // adjust
  const k = classifyAdjust(t, ctx)
  switch (k) {
    case 'expense_cash': {
      // note store: "Chi tiêu · {danh mục} · {ghi chú?}"
      const fromNote = t.note?.match(/^Chi tiêu · ([^·]+)/)?.[1]?.trim()
      if (fromNote) return `Chi tiêu · ${fromNote}`
      const exp = ctx.expenses?.find((e) => e.cashTxId === t.id)
      return exp?.note?.trim()
        ? `Chi tiêu · ${exp.note.trim()}`
        : 'Chi tiêu · trừ tiền mặt'
    }
    case 'income_cash': {
      const fromNote = t.note?.match(/^Thu nhập · ([^·]+)/)?.[1]?.trim()
      if (fromNote) return `Thu nhập · ${fromNote}`
      const exp = ctx.expenses?.find((e) => e.cashTxId === t.id)
      return exp?.note?.trim()
        ? `Thu nhập · ${exp.note.trim()}`
        : 'Thu nhập · cộng tiền mặt'
    }
    case 'savings':
      return t.side === 'out' ? 'Tiết kiệm · trừ VND' : 'Tiết kiệm · cộng VND'
    case 'loan':
      return t.side === 'out' ? 'Cho vay · trừ VND' : 'Cho vay · cộng VND'
    case 'cash_deposit':
      return 'Nạp tiền mặt'
    case 'cash_withdraw':
      return 'Rút tiền mặt'
    case 'usdt_hold':
      return t.side === 'in' ? 'Điều chỉnh · cộng USDT' : 'Điều chỉnh · trừ USDT'
    case 'coin_old_hold':
      return 'Hold coin cũ'
    case 'cost_basis':
      return 'Sửa giá vốn'
    case 'bootstrap':
      return 'Số dư ban đầu'
    default:
      return t.side === 'in' ? 'Điều chỉnh · nhận' : 'Điều chỉnh · chi'
  }
}

/** Filter bucket cho History */
export type HistoryFilter =
  | 'all'
  | 'buy'
  | 'sell'
  | 'convert'
  | 'adjust'
  | 'cash_flow'

export function matchesHistoryFilter(
  t: Transaction,
  filter: HistoryFilter,
  ctx: TxLabelContext,
): boolean {
  if (filter === 'all') return true
  if (filter === 'buy' || filter === 'sell' || filter === 'convert') {
    return t.kind === filter
  }
  if (filter === 'cash_flow') {
    if (t.kind !== 'adjust') return false
    const k = classifyAdjust(t, ctx)
    return (
      k === 'expense_cash' ||
      k === 'income_cash' ||
      k === 'savings' ||
      k === 'loan' ||
      k === 'cash_deposit' ||
      k === 'cash_withdraw'
    )
  }
  // adjust = mọi adjust (kể cả cash flow)
  return t.kind === 'adjust'
}
