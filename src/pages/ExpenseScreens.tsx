import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import {
  currentYearMonth,
  monthSummary,
  yearMonthOf,
} from '../lib/expense'
import {
  fmtNum,
  fmtVnd,
  moneyNum,
  nowIso,
  toLocalInput,
  fromLocalInput,
} from '../lib/format'
import { MoneyInput } from '../components/MoneyInput'
import { mask, pctClass } from '../lib/ui'
import type { ExpenseKind } from '../types'

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y!, m! - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return `Tháng ${Number(m)}/${y}`
}

/** Tab chính — dashboard chi tiêu tháng */
export function SpendHome({ privacy }: { privacy: boolean }) {
  const setScreen = useStore((s) => s.setScreen)
  const expenses = useStore((s) => s.expenses)
  const categories = useStore((s) => s.expenseCategories)
  const budgets = useStore((s) => s.expenseBudgets)
  const [ym, setYm] = useState(currentYearMonth)

  const sum = useMemo(
    () => monthSummary(expenses, categories, budgets, ym),
    [expenses, categories, budgets, ym],
  )

  const overBudget =
    sum.budgetLeft != null && sum.budgetLeft < 0

  return (
    <div className="scroll">
      <div className="large-title" style={{ paddingTop: 8 }}>
        <h1>Chi tiêu</h1>
        <div className="sub">Theo dõi thu · chi · ngân sách</div>
      </div>

      <div className="spend-month-nav">
        <button type="button" className="icon-btn" onClick={() => setYm(shiftMonth(ym, -1))}>
          ‹
        </button>
        <div className="spend-month-label">{monthLabel(ym)}</div>
        <button type="button" className="icon-btn" onClick={() => setYm(shiftMonth(ym, 1))}>
          ›
        </button>
      </div>

      <div className="spend-hero">
        <div className="spend-hero-row">
          <div>
            <div className="k">Chi tháng này</div>
            <div className="v num down">
              {mask(privacy, fmtVnd(sum.expense))}
              <small>đ</small>
            </div>
          </div>
          <div className="end">
            <div className="k">Thu</div>
            <div className="v num up">
              {mask(privacy, fmtVnd(sum.income))}
            </div>
          </div>
        </div>
        <div className="spend-hero-net">
          <span>Còn lại (thu − chi)</span>
          <span className={`num ${pctClass(sum.net)}`}>
            {mask(privacy, fmtVnd(sum.net))}
          </span>
        </div>
        {sum.totalBudget != null && (
          <div className="spend-budget-bar-wrap">
            <div className="spend-budget-meta">
              <span>
                Ngân sách {mask(privacy, fmtVnd(sum.totalBudget))}
              </span>
              <span className={overBudget ? 'down' : ''}>
                {overBudget
                  ? `Vượt ${mask(privacy, fmtVnd(-sum.budgetLeft!))}`
                  : `Còn ${mask(privacy, fmtVnd(sum.budgetLeft!))}`}
              </span>
            </div>
            <div className="spend-budget-bar">
              <div
                className={`fill ${overBudget ? 'over' : ''}`}
                style={{
                  width: `${Math.min(100, sum.budgetUsedPct ?? 0)}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="quick home-quick" style={{ marginBottom: 8 }}>
        <button type="button" onClick={() => setScreen('spend-form', 'expense')}>
          <div className="qico" style={{ background: '#FFE5E8', color: '#C41E3A' }}>−</div>
          <span>Ghi chi</span>
        </button>
        <button type="button" onClick={() => setScreen('spend-form', 'income')}>
          <div className="qico" style={{ background: '#D8F5E2', color: '#1B7A3D' }}>+</div>
          <span>Ghi thu</span>
        </button>
        <button type="button" onClick={() => setScreen('spend-budget')}>
          <div className="qico" style={{ background: '#E8E0FF', color: '#5E5CE6' }}>▦</div>
          <span>Ngân sách</span>
        </button>
        <button type="button" onClick={() => setScreen('spend-categories')}>
          <div className="qico" style={{ background: '#ECECEE', color: '#3A3A40' }}>☰</div>
          <span>Danh mục</span>
        </button>
      </div>

      <div className="sec">
        <h2>Theo danh mục</h2>
      </div>
      {sum.byCat.length === 0 ? (
        <div className="empty" style={{ paddingTop: 20 }}>
          <h3>Chưa có chi tiêu</h3>
          <p>Bấm “Ghi chi” để thêm khoản đầu tiên trong tháng.</p>
        </div>
      ) : (
        <div className="group">
          {sum.byCat.map((c) => (
            <div key={c.categoryId} className="row" style={{ cursor: 'default' }}>
              <div
                className="mark"
                style={{ background: `${c.color}22`, color: c.color }}
              >
                {c.icon}
              </div>
              <div className="body">
                <div className="t">{c.name}</div>
                <div className="d">{fmtNum(c.pct, 0)}% chi tháng</div>
                <div className="spend-mini-bar">
                  <div style={{ width: `${c.pct}%`, background: c.color }} />
                </div>
              </div>
              <div className="end">
                <div className="amt num">
                  {mask(privacy, fmtVnd(c.amount, true))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="sec">
        <h2>Gần đây</h2>
        <button type="button" onClick={() => setScreen('spend-form', 'expense')}>
          Thêm
        </button>
      </div>
      <div className="group">
        {sum.entries.slice(0, 40).map((e) => {
          const cat = categories.find((c) => c.id === e.categoryId)
          return (
            <button
              key={e.id}
              type="button"
              className="row"
              onClick={() => setScreen('spend-detail', e.id)}
            >
              <div
                className="mark"
                style={{
                  background: `${cat?.color || '#888'}22`,
                  color: cat?.color || '#888',
                }}
              >
                {cat?.icon || '?'}
              </div>
              <div className="body">
                <div className="t">{cat?.name || '—'}</div>
                <div className="d">
                  {new Date(e.spentAt).toLocaleString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {e.note ? ` · ${e.note}` : ''}
                  {e.linkCash ? ' · ₫' : ''}
                </div>
              </div>
              <div className="end">
                <div
                  className={`amt num ${e.kind === 'expense' ? 'down' : 'up'}`}
                >
                  {e.kind === 'expense' ? '−' : '+'}
                  {mask(privacy, fmtVnd(e.amount, true))}
                </div>
              </div>
              <span className="chev">›</span>
            </button>
          )
        })}
        {sum.entries.length === 0 && (
          <div className="row" style={{ color: 'var(--muted)' }}>
            Không có giao dịch tháng này
          </div>
        )}
      </div>
    </div>
  )
}

/** Form ghi chi / thu — detailAssetId = 'expense' | 'income' | entry id edit */
export function SpendForm() {
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const addExpense = useStore((s) => s.addExpense)
  const detail = useStore((s) => s.detailAssetId)
  const categories = useStore((s) => s.expenseCategories)
  const linkDefault = useStore((s) => s.settings.expenseLinkCashDefault)
  const updateSettings = useStore((s) => s.updateSettings)

  const kind: ExpenseKind =
    detail === 'income' ? 'income' : 'expense'

  const cats = categories
    .filter((c) => c.kind === kind && !c.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [spentAt, setSpentAt] = useState(toLocalInput(nowIso()))
  const [linkCash, setLinkCash] = useState(linkDefault)
  const [busy, setBusy] = useState(false)

  const firstCatId = cats[0]?.id || ''
  useEffect(() => {
    setCategoryId(firstCatId)
  }, [kind, firstCatId])

  function submit() {
    const a = moneyNum(amount)
    if (!categoryId) {
      showToast('Chọn danh mục')
      return
    }
    setBusy(true)
    const res = addExpense({
      kind,
      categoryId,
      amount: a,
      spentAt: fromLocalInput(spentAt),
      note,
      linkCash,
    })
    setBusy(false)
    if (!res.ok) {
      showToast(res.error)
      return
    }
    showToast(kind === 'expense' ? 'Đã ghi chi' : 'Đã ghi thu')
    setScreen('spend')
  }

  return (
    <div className="scroll">
      <div className="nav">
        <button type="button" className="back" onClick={() => setScreen('spend')}>
          ‹ Chi tiêu
        </button>
      </div>
      <div className="large-title" style={{ paddingTop: 4 }}>
        <h1>{kind === 'expense' ? 'Ghi chi' : 'Ghi thu'}</h1>
      </div>

      <div className="field">
        <label>Số tiền (đ)</label>
        <MoneyInput value={amount} onChange={setAmount} unit="đ" />
      </div>

      <div className="sec">
        <h2>Danh mục</h2>
      </div>
      <div className="spend-cat-grid">
        {cats.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`spend-cat-chip ${categoryId === c.id ? 'on' : ''}`}
            onClick={() => setCategoryId(c.id)}
            style={
              categoryId === c.id
                ? { borderColor: c.color, background: `${c.color}18` }
                : undefined
            }
          >
            <span className="ico">{c.icon}</span>
            <span>{c.name}</span>
          </button>
        ))}
      </div>

      <div className="field">
        <label>Thời điểm</label>
        <input
          type="datetime-local"
          value={spentAt}
          onChange={(e) => setSpentAt(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Ghi chú</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Tùy chọn"
        />
      </div>

      <div className="card" style={{ margin: '12px 0' }}>
        <div className="switch-row">
          <div>
            <div style={{ fontWeight: 650 }}>
              {kind === 'expense' ? 'Trừ tiền mặt VND' : 'Cộng tiền mặt VND'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Đồng bộ với sổ tài sản (tiền mặt)
            </div>
          </div>
          <button
            type="button"
            className={`toggle ${linkCash ? 'on' : ''}`}
            onClick={() => setLinkCash((v) => !v)}
            aria-label="Link cash"
          />
        </div>
        <div className="switch-row">
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Mặc định lần sau
          </div>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              updateSettings({ expenseLinkCashDefault: linkCash })
              showToast(
                linkCash
                  ? 'Mặc định: có gắn tiền mặt'
                  : 'Mặc định: chỉ sổ chi tiêu',
              )
            }}
          >
            Lưu mặc định
          </button>
        </div>
      </div>

      <button
        className="btn-primary"
        type="button"
        disabled={busy}
        onClick={submit}
      >
        {busy ? 'Đang lưu…' : kind === 'expense' ? 'Lưu chi tiêu' : 'Lưu thu nhập'}
      </button>
    </div>
  )
}

export function SpendDetail({ privacy }: { privacy: boolean }) {
  const id = useStore((s) => s.detailAssetId)
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const expenses = useStore((s) => s.expenses)
  const categories = useStore((s) => s.expenseCategories)
  const deleteExpense = useStore((s) => s.deleteExpense)
  const updateExpense = useStore((s) => s.updateExpense)

  const e = expenses.find((x) => x.id === id)
  const cat = e ? categories.find((c) => c.id === e.categoryId) : null
  const [note, setNote] = useState(e?.note || '')

  if (!e) {
    return (
      <div className="scroll">
        <button type="button" className="back" onClick={() => setScreen('spend')}>
          ‹ Chi tiêu
        </button>
        <div className="empty">
          <h3>Không tìm thấy</h3>
        </div>
      </div>
    )
  }

  return (
    <div className="scroll">
      <div className="nav">
        <button type="button" className="back" onClick={() => setScreen('spend')}>
          ‹ Chi tiêu
        </button>
      </div>
      <div className="large-title">
        <h1>{cat?.icon} {cat?.name || 'Giao dịch'}</h1>
        <div className="sub">
          {yearMonthOf(e.spentAt)} ·{' '}
          {e.kind === 'expense' ? 'Chi' : 'Thu'}
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div
          className={`num ${e.kind === 'expense' ? 'down' : 'up'}`}
          style={{ fontSize: 28, fontWeight: 750 }}
        >
          {e.kind === 'expense' ? '−' : '+'}
          {mask(privacy, fmtVnd(e.amount))} đ
        </div>
        <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 13 }}>
          {new Date(e.spentAt).toLocaleString('vi-VN')}
          {e.linkCash ? ' · Đã gắn tiền mặt' : ' · Chỉ sổ chi tiêu'}
        </div>
      </div>

      <div className="field">
        <label>Ghi chú</label>
        <input value={note} onChange={(ev) => setNote(ev.target.value)} />
      </div>
      <button
        className="btn-secondary"
        type="button"
        onClick={() => {
          const res = updateExpense(e.id, { note })
          showToast(res.ok ? 'Đã lưu ghi chú' : res.error)
        }}
      >
        Lưu ghi chú
      </button>

      <button
        className="btn-secondary"
        type="button"
        style={{ marginTop: 12, color: 'var(--down)' }}
        onClick={() => {
          if (
            !window.confirm(
              e.linkCash
                ? 'Xóa giao dịch và hoàn tác tiền mặt đã gắn?'
                : 'Xóa giao dịch chi tiêu?',
            )
          )
            return
          const res = deleteExpense(e.id)
          if (!res.ok) showToast(res.error)
          else {
            showToast('Đã xóa')
            setScreen('spend')
          }
        }}
      >
        Xóa giao dịch
      </button>
    </div>
  )
}

export function SpendCategories() {
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const categories = useStore((s) => s.expenseCategories)
  const addExpenseCategory = useStore((s) => s.addExpenseCategory)
  const updateExpenseCategory = useStore((s) => s.updateExpenseCategory)
  const [kind, setKind] = useState<ExpenseKind>('expense')
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🏷')

  const list = categories
    .filter((c) => c.kind === kind && !c.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div className="scroll">
      <div className="nav">
        <button type="button" className="back" onClick={() => setScreen('spend')}>
          ‹ Chi tiêu
        </button>
      </div>
      <div className="large-title">
        <h1>Danh mục</h1>
      </div>

      <div className="seg" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className={kind === 'expense' ? 'on' : ''}
          onClick={() => setKind('expense')}
        >
          Chi
        </button>
        <button
          type="button"
          className={kind === 'income' ? 'on' : ''}
          onClick={() => setKind('income')}
        >
          Thu
        </button>
      </div>

      <div className="group">
        {list.map((c) => (
          <div key={c.id} className="row" style={{ cursor: 'default' }}>
            <div
              className="mark"
              style={{ background: `${c.color}22`, color: c.color }}
            >
              {c.icon}
            </div>
            <div className="body">
              <div className="t">{c.name}</div>
              <div className="d">{c.isSystem ? 'Hệ thống' : 'Tự tạo'}</div>
            </div>
            {!c.isSystem && (
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  updateExpenseCategory(c.id, { archived: true })
                  showToast('Đã ẩn danh mục')
                }}
              >
                Ẩn
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="sec">
        <h2>Thêm danh mục</h2>
      </div>
      <div className="field">
        <label>Icon (emoji)</label>
        <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} />
      </div>
      <div className="field">
        <label>Tên</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="VD: Cà phê"
        />
      </div>
      <button
        className="btn-primary"
        type="button"
        onClick={() => {
          const res = addExpenseCategory({
            name,
            icon: icon || '🏷',
            color: kind === 'income' ? '#30d158' : '#ff9f0a',
            kind,
          })
          if (!res.ok) showToast(res.error)
          else {
            showToast('Đã thêm danh mục')
            setName('')
          }
        }}
      >
        Thêm
      </button>
    </div>
  )
}

export function SpendBudget() {
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const budgets = useStore((s) => s.expenseBudgets)
  const expenses = useStore((s) => s.expenses)
  const categories = useStore((s) => s.expenseCategories)
  const setExpenseBudget = useStore((s) => s.setExpenseBudget)
  const clearExpenseBudget = useStore((s) => s.clearExpenseBudget)
  const [ym, setYm] = useState(currentYearMonth)
  const sum = useMemo(
    () => monthSummary(expenses, categories, budgets, ym),
    [expenses, categories, budgets, ym],
  )
  const [amount, setAmount] = useState(
    sum.totalBudget != null ? String(Math.round(sum.totalBudget)) : '',
  )

  return (
    <div className="scroll">
      <div className="nav">
        <button type="button" className="back" onClick={() => setScreen('spend')}>
          ‹ Chi tiêu
        </button>
      </div>
      <div className="large-title">
        <h1>Ngân sách</h1>
        <div className="sub">{monthLabel(ym)}</div>
      </div>

      <div className="spend-month-nav">
        <button type="button" className="icon-btn" onClick={() => setYm(shiftMonth(ym, -1))}>
          ‹
        </button>
        <div className="spend-month-label">{monthLabel(ym)}</div>
        <button type="button" className="icon-btn" onClick={() => setYm(shiftMonth(ym, 1))}>
          ›
        </button>
      </div>

      <div className="field">
        <label>Ngân sách tổng chi tháng (đ)</label>
        <MoneyInput
          value={amount}
          onChange={setAmount}
          unit="đ"
        />
        <div className="hint">
          Đã chi {fmtVnd(sum.expense)} ·{' '}
          {sum.totalBudget != null
            ? `Hạn mức ${fmtVnd(sum.totalBudget)}`
            : 'Chưa đặt hạn mức'}
        </div>
      </div>
      <button
        className="btn-primary"
        type="button"
        onClick={() => {
          const a = moneyNum(amount)
          const res = setExpenseBudget({
            yearMonth: ym,
            categoryId: null,
            amount: a,
          })
          showToast(res.ok ? 'Đã lưu ngân sách' : res.error)
        }}
      >
        Lưu ngân sách tháng
      </button>
      {sum.totalBudget != null && (
        <button
          className="btn-secondary"
          type="button"
          style={{ marginTop: 8 }}
          onClick={() => {
            clearExpenseBudget(ym, null)
            setAmount('')
            showToast('Đã xóa ngân sách tháng')
          }}
        >
          Xóa ngân sách tháng này
        </button>
      )}

      <div className="sec" style={{ marginTop: 24 }}>
        <h2>Gợi ý</h2>
      </div>
      <div className="card" style={{ padding: 14, fontSize: 13, lineHeight: 1.45, color: 'var(--muted)' }}>
        Đặt hạn mức chi theo tháng để Home / tab Chi tiêu cảnh báo khi sắp vượt.
        Có thể gắn từng khoản chi với <b>tiền mặt VND</b> để khớp sổ tài sản.
      </div>
    </div>
  )
}
