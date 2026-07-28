/**
 * Logic sổ chi tiêu: danh mục mặc định, tổng hợp tháng, ngân sách.
 */
import type {
  ExpenseBudget,
  ExpenseCategory,
  ExpenseEntry,
  ExpenseKind,
} from '../types'
import { nowIso, uid } from './format'

export function yearMonthOf(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function currentYearMonth(): string {
  return yearMonthOf(nowIso())
}

/** Danh mục seed — chi + thu */
export function seedExpenseCategories(): ExpenseCategory[] {
  const t = nowIso()
  const mk = (
    name: string,
    icon: string,
    color: string,
    kind: ExpenseKind,
    sortOrder: number,
  ): ExpenseCategory => ({
    id: uid(),
    name,
    icon,
    color,
    kind,
    isSystem: true,
    archived: false,
    sortOrder,
    createdAt: t,
    updatedAt: t,
  })

  // Danh mục thực tế — lưới 3 cột dễ chạm (giống form ghi nhanh)
  return [
    // Chi
    mk('Ăn uống', '🍽', '#ff9f0a', 'expense', 1),
    mk('Khác', '🤲', '#ff375f', 'expense', 2),
    mk('Tiền điện', '💧', '#0a84ff', 'expense', 3),
    mk('Xăng Xe', '🚂', '#ff9f0a', 'expense', 4),
    mk('Nước Mạng', '📱', '#8e8e93', 'expense', 5),
    mk('Tiền Chợ', '🏠', '#ac8e68', 'expense', 6),
    mk('Mua Sắm', '🛒', '#ffd60a', 'expense', 7),
    mk('Du Lịch', '✈️', '#ff9f0a', 'expense', 8),
    // Thu
    mk('Lương', '💰', '#30d158', 'income', 1),
    mk('Thưởng', '🎁', '#bf5af2', 'income', 2),
    mk('Bán hàng', '🧾', '#0a84ff', 'income', 3),
    mk('Khác', '➕', '#8e8e93', 'income', 99),
  ]
}

export function filterByMonth(
  entries: ExpenseEntry[],
  yearMonth: string,
): ExpenseEntry[] {
  return entries.filter((e) => yearMonthOf(e.spentAt) === yearMonth)
}

export function sumByKind(
  entries: ExpenseEntry[],
  kind: ExpenseKind,
): number {
  return entries
    .filter((e) => e.kind === kind)
    .reduce((a, e) => a + e.amount, 0)
}

export type CategorySpend = {
  categoryId: string
  name: string
  icon: string
  color: string
  amount: number
  pct: number
}

export function spendByCategory(
  entries: ExpenseEntry[],
  categories: ExpenseCategory[],
  kind: ExpenseKind = 'expense',
): CategorySpend[] {
  const subset = entries.filter((e) => e.kind === kind)
  const total = sumByKind(subset, kind)
  const map = new Map<string, number>()
  for (const e of subset) {
    map.set(e.categoryId, (map.get(e.categoryId) || 0) + e.amount)
  }
  const rows: CategorySpend[] = []
  for (const [categoryId, amount] of map) {
    const cat = categories.find((c) => c.id === categoryId)
    rows.push({
      categoryId,
      name: cat?.name || 'Không rõ',
      icon: cat?.icon || '?',
      color: cat?.color || '#8e8e93',
      amount,
      pct: total > 0 ? (amount / total) * 100 : 0,
    })
  }
  return rows.sort((a, b) => b.amount - a.amount)
}

export function budgetFor(
  budgets: ExpenseBudget[],
  yearMonth: string,
  categoryId: string | null,
): ExpenseBudget | undefined {
  return budgets.find(
    (b) =>
      b.yearMonth === yearMonth &&
      (categoryId == null
        ? b.categoryId == null
        : b.categoryId === categoryId),
  )
}

export function monthSummary(
  entries: ExpenseEntry[],
  categories: ExpenseCategory[],
  budgets: ExpenseBudget[],
  yearMonth: string,
) {
  const monthEntries = filterByMonth(entries, yearMonth)
  const expense = sumByKind(monthEntries, 'expense')
  const income = sumByKind(monthEntries, 'income')
  const net = income - expense
  const totalBudget = budgetFor(budgets, yearMonth, null)?.amount ?? null
  const budgetLeft =
    totalBudget != null ? totalBudget - expense : null
  const byCat = spendByCategory(monthEntries, categories, 'expense')
  return {
    yearMonth,
    expense,
    income,
    net,
    totalBudget,
    budgetLeft,
    budgetUsedPct:
      totalBudget && totalBudget > 0
        ? (expense / totalBudget) * 100
        : null,
    count: monthEntries.length,
    byCat,
    entries: monthEntries
      .slice()
      .sort((a, b) => b.spentAt.localeCompare(a.spentAt)),
  }
}

/** Ngày trong tháng (local) — dùng filter form */
export function monthBounds(yearMonth: string): { start: string; end: string } {
  const [y, m] = yearMonth.split('-').map(Number)
  const start = new Date(y!, m! - 1, 1)
  const end = new Date(y!, m!, 0, 23, 59, 59, 999)
  return { start: start.toISOString(), end: end.toISOString() }
}
