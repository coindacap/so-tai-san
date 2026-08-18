import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
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
import { AppIcon } from '../components/AppIcon'
import { mask } from '../lib/ui'

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y!, m! - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `Tháng ${m} · ${y}`
}

function monthRangeLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(y!, m!, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return `01/${mm} · ${String(last).padStart(2, '0')}/${mm}`
}

const WEEKDAYS_VI = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

/** YYYY-MM-DD local */
function dayKeyOf(iso: string): string {
  const d = new Date(iso)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function dayKeyToday(): string {
  return dayKeyOf(nowIso())
}

function dayKeyYesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return dayKeyOf(d.toISOString())
}

/** Nhãn nhóm ngày: Hôm nay / Hôm qua / Thứ x, dd/mm */
function dayGroupLabel(dayKey: string): string {
  if (dayKey === dayKeyToday()) return 'Hôm nay'
  if (dayKey === dayKeyYesterday()) return 'Hôm qua'
  const [y, m, d] = dayKey.split('-').map(Number)
  const dt = new Date(y!, m! - 1, d!)
  const wd = WEEKDAYS_VI[dt.getDay()]
  return `${wd}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

type DayGroup<T> = {
  dayKey: string
  label: string
  totalExpense: number
  totalIncome: number
  items: T[]
}

function groupByDay<T extends { spentAt: string; kind: string; amount: number }>(
  entries: T[],
): DayGroup<T>[] {
  const map = new Map<string, DayGroup<T>>()
  for (const e of entries) {
    const key = dayKeyOf(e.spentAt)
    let g = map.get(key)
    if (!g) {
      g = {
        dayKey: key,
        label: dayGroupLabel(key),
        totalExpense: 0,
        totalIncome: 0,
        items: [],
      }
      map.set(key, g)
    }
    g.items.push(e)
    if (e.kind === 'expense') g.totalExpense += e.amount
    else g.totalIncome += e.amount
  }
  // entries đã sort mới → cũ; giữ thứ tự ngày theo first-seen
  return [...map.values()]
}

/** Donut CSS conic-gradient từ % danh mục */
function donutStyle(
  slices: { pct: number; color: string }[],
): string {
  if (!slices.length) return 'conic-gradient(var(--color-rule) 0 100%)'
  let acc = 0
  const parts: string[] = []
  for (const s of slices) {
    const from = acc
    acc += s.pct
    parts.push(`${s.color} ${from}% ${Math.min(100, acc)}%`)
  }
  if (acc < 100) parts.push(`var(--color-rule) ${acc}% 100%`)
  return `conic-gradient(${parts.join(', ')})`
}

/** Tab chính — báo cáo chi theo tháng (biểu đồ + list %) */
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

  const donut = useMemo(() => donutStyle(sum.byCat), [sum.byCat])
  const expenseCount = useMemo(
    () => sum.entries.filter((e) => e.kind === 'expense').length,
    [sum.entries],
  )
  /** Toàn bộ giao dịch tháng, gom theo ngày (mới → cũ) */
  const dayGroups = useMemo(() => groupByDay(sum.entries), [sum.entries])

  return (
    <div className="scroll spend-home">
      <header className="spend-home__head">
        <h1 className="spend-home__title">Chi tiêu</h1>
        <button
          type="button"
          className="spend-home__text-btn"
          onClick={() => setScreen('spend-categories')}
        >
          Danh mục
        </button>
      </header>

      <div className="spend-home__month" role="group" aria-label="Chọn tháng">
        <button
          type="button"
          className="spend-home__month-nav"
          onClick={() => setYm(shiftMonth(ym, -1))}
          aria-label="Tháng trước"
        >
          <AppIcon name="arrow-left" size={18} />
        </button>
        <div className="spend-home__month-core">
          <strong>{monthLabel(ym)}</strong>
          <span>{monthRangeLabel(ym)}</span>
        </div>
        <button
          type="button"
          className="spend-home__month-nav"
          onClick={() => setYm(shiftMonth(ym, 1))}
          aria-label="Tháng sau"
        >
          <AppIcon name="chevron-right" size={18} />
        </button>
      </div>

      <section className="spend-home__hero" aria-label="Tổng chi tháng">
        <p className="spend-home__eyebrow">Tổng chi</p>
        <p className="spend-home__amount num">
          −{mask(privacy, fmtVnd(sum.expense))}

        </p>
        <p className="spend-home__meta">
          {sum.byCat.length} danh mục · {expenseCount} khoản
          {dayGroups.length > 0 ? ` · ${dayGroups.length} ngày` : ''}
        </p>
        {sum.income > 0 ? (
          <p className="spend-home__income">
            Thu nhập{' '}
            <span className="num up">+{mask(privacy, fmtVnd(sum.income))}</span>
          </p>
        ) : null}

        <button
          type="button"
          className="spend-home__cta"
          onClick={() => setScreen('spend-form')}
        >
          <span className="spend-home__cta-ico" aria-hidden>
            <AppIcon name="plus" size={22} />
          </span>
          Ghi chi
        </button>
      </section>

      <section className="spend-home__section" aria-labelledby="spend-cat-heading">
        <div className="spend-home__section-head">
          <h2 id="spend-cat-heading">Theo danh mục</h2>
        </div>

        {sum.byCat.length === 0 ? (
          <div className="spend-home__empty">
            <p className="spend-home__empty-title">Chưa có chi tháng này</p>
            <p className="spend-home__empty-copy">
              Ghi chi để xem phân bổ theo danh mục.
            </p>
          </div>
        ) : (
          <div className="spend-home__breakdown">
            <div
              className="spend-home__donut"
              style={{ background: donut }}
              aria-hidden
            >
              <div className="spend-home__donut-hole">
                <span>{sum.byCat.length}</span>
                <small>nhóm</small>
              </div>
            </div>

            <ul className="spend-home__cats">
              {sum.byCat.map((c) => (
                <li key={c.categoryId} className="spend-home__cat">
                  <span
                    className="spend-home__cat-mark"
                    style={{ ['--swatch']: c.color  } as CSSProperties}
                    aria-hidden
                  >
                    {c.icon}
                  </span>
                  <div className="spend-home__cat-main">
                    <div className="spend-home__cat-row">
                      <span className="spend-home__cat-name">{c.name}</span>
                      <span className="spend-home__cat-amt num">
                        {mask(privacy, fmtVnd(c.amount))}
                      </span>
                    </div>
                    <div className="spend-home__cat-track" aria-hidden>
                      <div
                        className="spend-home__cat-fill"
                        style={
                          {
                            width: `${Math.min(100, Math.max(2, c.pct))}%`,
                            ['--swatch']: c.color,
                          } as CSSProperties
                        }
                      />
                    </div>
                    <span className="spend-home__cat-pct">
                      {fmtNum(c.pct, 1)}%
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="spend-home__section" aria-labelledby="spend-recent-heading">
        <div className="spend-home__section-head">
          <h2 id="spend-recent-heading">Gần đây</h2>
        </div>

        {dayGroups.length === 0 ? (
          <div className="spend-home__empty spend-home__empty--soft">
            <p className="spend-home__empty-copy">Chưa có khoản chi</p>
          </div>
        ) : (
          dayGroups.map((g) => (
            <div key={g.dayKey} className="spend-home__day">
              <div className="spend-home__day-head">
                <span className="spend-home__day-label">{g.label}</span>
                <span className="spend-home__day-sum">
                  {g.totalExpense > 0 && (
                    <span className="num down">
                      −{mask(privacy, fmtVnd(g.totalExpense))}
                    </span>
                  )}
                  {g.totalIncome > 0 && (
                    <span className="num up">
                      +{mask(privacy, fmtVnd(g.totalIncome))}
                    </span>
                  )}
                </span>
              </div>
              <div className="spend-home__day-list">
                {g.items.map((e) => {
                  const cat = categories.find((c) => c.id === e.categoryId)
                  const isOut = e.kind === 'expense'
                  return (
                    <button
                      key={e.id}
                      type="button"
                      className="spend-home__tx"
                      onClick={() => setScreen('spend-detail', e.id)}
                    >
                      <span
                        className="spend-home__cat-mark"
                        style={{ ['--swatch']: cat?.color || 'var(--color-muted)',
                         } as CSSProperties}
                        aria-hidden
                      >
                        {cat?.icon || '?'}
                      </span>
                      <span className="spend-home__tx-body">
                        <span className="spend-home__tx-title">
                          {cat?.name || 'Khác'}
                        </span>
                        <span className="spend-home__tx-sub">
                          {new Date(e.spentAt).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {e.note ? ` · ${e.note}` : ''}
                        </span>
                      </span>
                      <span
                        className={`spend-home__tx-amt num ${isOut ? 'down' : 'up'}`}
                      >
                        {isOut ? '−' : '+'}
                        {mask(privacy, fmtVnd(e.amount))}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  )
}

function formatDayLabel(localInput: string): string {
  const d = new Date(fromLocalInput(localInput))
  if (Number.isNaN(d.getTime())) return localInput
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy} (${WEEKDAYS_VI[d.getDay()]})`
}

function shiftDayLocal(localInput: string, delta: number): string {
  const d = new Date(fromLocalInput(localInput))
  if (Number.isNaN(d.getTime())) return localInput
  d.setDate(d.getDate() + delta)
  return toLocalInput(d.toISOString())
}

/** Form ghi chi/thu — layout nhanh giống app sổ thu chi (lưới danh mục + nút cam) */
export function SpendForm() {
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const addExpense = useStore((s) => s.addExpense)
  const categories = useStore((s) => s.expenseCategories)
  const linkDefault = useStore((s) => s.settings.expenseLinkCashDefault)

  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [spentAt, setSpentAt] = useState(toLocalInput(nowIso()))
  const [linkCash, setLinkCash] = useState(linkDefault)
  const [busy, setBusy] = useState(false)

  const cats = useMemo(
    () =>
      categories
        .filter((c) => c.kind === kind && !c.archived)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories, kind],
  )

  const firstCatId = cats[0]?.id || ''
  // Đổi tab thu/chi (hoặc list đổi) → chọn lại danh mục đầu
  useEffect(() => {
    setCategoryId(firstCatId)
  }, [kind, firstCatId])

  function submit() {
    const a = moneyNum(amount)
    if (!(a > 0)) {
      showToast('Nhập số tiền')
      return
    }
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
    setAmount('')
    setNote('')
    setScreen('spend')
  }

  const isExpense = kind === 'expense'
  const amountLabel = isExpense ? 'Tiền chi' : 'Tiền thu'
  const ctaLabel = busy
    ? 'Đang lưu…'
    : isExpense
      ? 'Nhập khoản chi'
      : 'Nhập khoản thu'

  return (
    <div className="scroll spend-form-page">
      <div className="spend-form-top">
        <div className="spend-kind-seg" role="tablist" aria-label="Loại">
          <button
            type="button"
            role="tab"
            aria-selected={isExpense}
            className={isExpense ? 'on' : ''}
            onClick={() => setKind('expense')}
          >
            Tiền chi
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isExpense}
            className={!isExpense ? 'on' : ''}
            onClick={() => setKind('income')}
          >
            Tiền thu
          </button>
        </div>
        <button
          type="button"
          className="spend-form-close"
          aria-label="Đóng"
          onClick={() => setScreen('spend')}
        >
          <AppIcon name="close" size={19} />
        </button>
      </div>

      {/* Số tiền đứng riêng · trọng tâm form */}
      <section className="spend-form-block spend-form-block--amount">
        <div className="spend-form-block-label">{amountLabel}</div>
        <div className="spend-amount-field">
          <MoneyInput
            value={amount}
            onChange={setAmount}
                        placeholder="0"
            className="spend-amount-input"
            ariaLabel={amountLabel}
          />
        </div>
      </section>

      {/* Ngày + ghi chú · một card, hàng thoáng */}
      <section className="spend-form-block">
        <div className="spend-form-row">
          <span className="spend-form-lab">Ngày</span>
          <div className="spend-date-nav">
            <button
              type="button"
              aria-label="Ngày trước"
              onClick={() => setSpentAt((v) => shiftDayLocal(v, -1))}
            >
              <AppIcon name="arrow-left" size={18} />
            </button>
            <label className="spend-date-pill">
              <span>{formatDayLabel(spentAt)}</span>
              <input
                type="datetime-local"
                value={spentAt}
                onChange={(e) => setSpentAt(e.target.value)}
                aria-label="Chọn ngày giờ"
              />
            </label>
            <button
              type="button"
              aria-label="Ngày sau"
              onClick={() => setSpentAt((v) => shiftDayLocal(v, 1))}
            >
              <AppIcon name="chevron-right" size={18} />
            </button>
          </div>
        </div>
        <div className="spend-form-row">
          <span className="spend-form-lab">Ghi chú</span>
          <input
            className="spend-form-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Tuỳ chọn"
          />
        </div>
      </section>

      <section className="spend-form-block spend-form-block--cats">
        <div className="spend-form-block-head">
          <div className="spend-form-block-label">Danh mục</div>
          <button
            type="button"
            className="spend-form-manage"
            onClick={() => setScreen('spend-categories')}
          >
            Quản lý
          </button>
        </div>
        <div className="spend-cat-tiles">
          {cats.map((c) => {
            const on = categoryId === c.id
            return (
              <button
                key={c.id}
                type="button"
                className={`spend-cat-tile ${on ? 'on' : ''}`}
                onClick={() => setCategoryId(c.id)}
                style={
                  {
                    ['--tile-color']: c.color,
                    ['--tile-soft']: `${c.color}18`,
                  } as CSSProperties
                }
              >
                <span className="tile-ico-wrap">
                  <span className="tile-ico" style={{ color: c.color }}>
                    {c.icon}
                  </span>
                </span>
                <span className="tile-name">{c.name}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="spend-form-linkcash">
        <div>
          <div className="t">
            {isExpense ? 'Trừ tiền mặt VND' : 'Cộng tiền mặt VND'}
          </div>
          <div className="d">
            {linkCash
              ? isExpense
                ? 'Trừ sổ tài sản · đừng rút VND tay thêm'
                : 'Cộng sổ tài sản · đừng nạp VND tay thêm'
              : 'Chỉ sổ chi tiêu · không đụng tiền mặt tài sản'}
          </div>
        </div>
        <button
          type="button"
          className={`toggle ${linkCash ? 'on' : ''}`}
          onClick={() => setLinkCash((v) => !v)}
          aria-label="Link cash"
        />
      </section>

      <div className="spend-form-cta-space" />

      <div className="spend-form-cta-bar">
        <button
          type="button"
          className="spend-form-cta"
          disabled={busy}
          onClick={submit}
        >
          {ctaLabel}
        </button>
      </div>
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
          <AppIcon name="arrow-left" size={18} />
          Chi tiêu
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
          <AppIcon name="arrow-left" size={18} />
          Chi tiêu
        </button>
      </div>
      <div className="large-title">
        <h1>{cat?.icon} {cat?.name || 'Giao dịch'}</h1>
        <div className="sub">{yearMonthOf(e.spentAt)} · Chi</div>
      </div>

      <div className="card detail-card">
        <div className="num down amount-xl">
          −{mask(privacy, fmtVnd(e.amount))}
        </div>
        <div className="detail-meta">
          {new Date(e.spentAt).toLocaleString('vi-VN')}
          {e.linkCash ? ' · Đã trừ tiền mặt' : ' · Chỉ sổ chi tiêu'}
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
        className="btn-secondary btn-danger"
        type="button"
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

/** Icon sẵn chọn nhanh khi tạo / sửa danh mục */
const CATEGORY_ICONS = [
  '🍜', '☕', '🍔', '🥗', '🍺', '🛒',
  '🚗', '🛵', '⛽', '🚌', '✈️', '🚇',
  '🏠', '💡', '💧', '📡', '🔑', '🛏',
  '🛍', '👕', '📱', '💻', '🎁', '📦',
  '💊', '🏥', '🏋', '🎮', '🎬', '🎵',
  '📚', '✏️', '💼', '👶', '🐶', '💄',
  '💇', '🧾', '📄', '🏦', '💳', '🪙',
  '🔧', '🧹', '🌳', '🎉', '❤️', '⋯',
]

const CATEGORY_COLORS = [
  '#ff9f0a',
  '#ff375f',
  '#bf5af2',
  '#5e5ce6',
  '#0a84ff',
  '#64d2ff',
  '#30d158',
  '#ac8e68',
  '#ff6482',
  '#8e8e93',
  '#c41e3a',
  '#ffd60a',
]

export function SpendCategories() {
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const categories = useStore((s) => s.expenseCategories)
  const addExpenseCategory = useStore((s) => s.addExpenseCategory)
  const updateExpenseCategory = useStore((s) => s.updateExpenseCategory)

  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const list = categories
    .filter((c) => c.kind === kind && !c.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  /** null = tạo mới; string = id đang sửa */
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🏷')
  const [color, setColor] = useState(CATEGORY_COLORS[0]!)
  const editing = editId != null
  const editCat = editId ? list.find((c) => c.id === editId) : null

  function openCreate() {
    setEditId(null)
    setName('')
    setIcon('🏷')
    setColor(CATEGORY_COLORS[0]!)
  }

  function openEdit(id: string) {
    const c = list.find((x) => x.id === id)
    if (!c) return
    setEditId(id)
    setName(c.name)
    setIcon(c.icon)
    setColor(c.color || CATEGORY_COLORS[0]!)
  }

  function save() {
    if (editing && editId) {
      const res = updateExpenseCategory(editId, {
        name: name.trim(),
        icon: icon || '🏷',
        color,
      })
      if (!res.ok) showToast(res.error)
      else {
        showToast('Đã cập nhật danh mục')
        openCreate()
      }
      return
    }
    const res = addExpenseCategory({
      name,
      icon: icon || '🏷',
      color,
      kind,
    })
    if (!res.ok) showToast(res.error)
    else {
      showToast('Đã thêm danh mục')
      openCreate()
    }
  }

  return (
    <div className="scroll">
      <div className="nav">
        <button
          type="button"
          className="back"
          onClick={() => setScreen('spend-form')}
        >
          <AppIcon name="arrow-left" size={18} />
          Ghi chi
        </button>
      </div>
      <div className="large-title">
        <h1>Danh mục</h1>
        <div className="sub">Chạm dòng để sửa · chọn icon bên dưới</div>
      </div>

      <div className="spend-kind-seg mb-sm">
        <button
          type="button"
          className={kind === 'expense' ? 'on' : ''}
          onClick={() => {
            setKind('expense')
            openCreate()
          }}
        >
          Tiền chi
        </button>
        <button
          type="button"
          className={kind === 'income' ? 'on' : ''}
          onClick={() => {
            setKind('income')
            openCreate()
          }}
        >
          Tiền thu
        </button>
      </div>

      <div className="group">
        {list.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`row ${editId === c.id ? 'cat-row-on' : ''}`}
            onClick={() => openEdit(c.id)}
          >
            <div
              className="mark cat-swatch" style={{ ['--swatch']: c.color  } as CSSProperties}
            >
              {c.icon}
            </div>
            <div className="body">
              <div className="t">{c.name}</div>
              <div className="d">{c.isSystem ? 'Mặc định' : 'Tự tạo'}</div>
            </div>
            <span className="link-btn">Sửa</span>
            <span className="chev">
              <AppIcon name="chevron-right" size={18} />
            </span>
          </button>
        ))}
        {list.length === 0 && (
          <div className="row row-muted">
            Chưa có danh mục
          </div>
        )}
      </div>

      <div className="sec">
        <h2>{editing ? `Sửa · ${editCat?.name || ''}` : 'Thêm danh mục'}</h2>
        {editing && (
          <button type="button" className="link-btn" onClick={openCreate}>
            Tạo mới
          </button>
        )}
      </div>

      <div className="field">
        <label>Tên</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="VD: Cà phê, Tiền chợ…"
        />
      </div>

      <div className="field">
        <label>Chọn icon</label>
        <div className="icon-picker">
          {CATEGORY_ICONS.map((ic) => (
            <button
              key={ic}
              type="button"
              className={`icon-pick ${icon === ic ? 'on' : ''}`}
              onClick={() => setIcon(ic)}
            >
              {ic}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Màu</label>
        <div className="color-picker">
          {CATEGORY_COLORS.map((col) => (
            <button
              key={col}
              type="button"
              className={`color-pick cat-swatch-solid ${color === col ? 'on' : ''}`}
              style={{ ['--swatch']: col  } as CSSProperties}
              onClick={() => setColor(col)}
              aria-label={col}
            />
          ))}
        </div>
      </div>

      <div className="cat-preview">
        <div className="mark cat-swatch" style={{ ['--swatch']: color  } as CSSProperties}>
          {icon}
        </div>
        <span>{name.trim() || 'Tên danh mục'}</span>
      </div>

      <button className="btn-primary" type="button" onClick={save}>
        {editing ? 'Lưu thay đổi' : 'Thêm danh mục'}
      </button>

      {editing && editCat && !editCat.isSystem && (
        <button
          className="btn-secondary btn-danger"
          type="button"
          onClick={() => {
            if (!window.confirm('Ẩn danh mục này?')) return
            updateExpenseCategory(editId!, { archived: true })
            showToast('Đã ẩn danh mục')
            openCreate()
          }}
        >
          Ẩn danh mục này
        </button>
      )}
    </div>
  )
}
