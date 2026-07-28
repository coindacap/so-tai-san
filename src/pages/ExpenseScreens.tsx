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
import { mask } from '../lib/ui'

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y!, m! - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return `${String(m).padStart(2, '0')}/${y}`
}

function monthRangeLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(y!, m!, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return `01/${mm} – ${last}/${mm}`
}

/** Donut CSS conic-gradient từ % danh mục */
function donutStyle(
  slices: { pct: number; color: string }[],
): string {
  if (!slices.length) return 'conic-gradient(#e5e5ea 0 100%)'
  let acc = 0
  const parts: string[] = []
  for (const s of slices) {
    const from = acc
    acc += s.pct
    parts.push(`${s.color} ${from}% ${Math.min(100, acc)}%`)
  }
  if (acc < 100) parts.push(`#e5e5ea ${acc}% 100%`)
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
  const recent = useMemo(
    () =>
      sum.entries
        .filter((e) => e.kind === 'expense')
        .slice(0, 25),
    [sum.entries],
  )

  return (
    <div className="scroll">
      <div className="report-head">
        <h1>Báo cáo</h1>
        <button
          type="button"
          className="link-btn"
          onClick={() => setScreen('spend-categories')}
        >
          Danh mục
        </button>
      </div>

      {/* Chọn tháng */}
      <div className="report-month-pill">
        <button type="button" onClick={() => setYm(shiftMonth(ym, -1))} aria-label="Tháng trước">
          ‹
        </button>
        <div className="report-month-mid">
          <strong>{monthLabel(ym)}</strong>
          <span>({monthRangeLabel(ym)})</span>
        </div>
        <button type="button" onClick={() => setYm(shiftMonth(ym, 1))} aria-label="Tháng sau">
          ›
        </button>
      </div>

      {/* Tổng chi */}
      <div className="report-sum-card">
        <div className="report-sum-row">
          <span>Chi tiêu</span>
          <span className="num down">
            −{mask(privacy, fmtVnd(sum.expense))}đ
          </span>
        </div>
        <div className="report-sum-row muted">
          <span>{sum.byCat.length} danh mục · {recent.length > 0 ? sum.entries.filter((e) => e.kind === 'expense').length : 0} khoản</span>
        </div>
      </div>

      {/* CTA ghi chi to */}
      <div className="spend-cta-wrap">
        <button
          type="button"
          className="spend-cta-main"
          onClick={() => setScreen('spend-form')}
        >
          <span className="spend-cta-ico">−</span>
          <span className="spend-cta-title">Ghi chi</span>
          <span className="spend-cta-sub">Chạm để thêm khoản chi ngay</span>
        </button>
      </div>

      {/* Donut + list danh mục */}
      <div className="report-section-title">Chi theo danh mục</div>

      {sum.byCat.length === 0 ? (
        <div className="empty" style={{ paddingTop: 8 }}>
          <h3>Chưa có dữ liệu tháng này</h3>
          <p>Ghi chi để xem biểu đồ báo cáo.</p>
        </div>
      ) : (
        <>
          <div className="report-donut-wrap">
            <div className="report-donut" style={{ background: donut }}>
              <div className="report-donut-hole">
                <div className="k">Tổng chi</div>
                <div className="v num">
                  {mask(privacy, fmtVnd(sum.expense, true))}
                </div>
              </div>
            </div>
          </div>

          <div className="group report-cat-list">
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
                  <div className="d">{fmtNum(c.pct, 1)}%</div>
                </div>
                <div className="end">
                  <div className="amt num">
                    {mask(privacy, fmtVnd(c.amount))}đ
                  </div>
                  <div className="d" style={{ textAlign: 'right' }}>
                    {fmtNum(c.pct, 1)} %
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="sec" style={{ marginTop: 18 }}>
        <h2>Gần đây</h2>
        <button type="button" onClick={() => setScreen('spend-form')}>
          Ghi chi
        </button>
      </div>
      <div className="group">
        {recent.map((e) => {
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
                </div>
              </div>
              <div className="end">
                <div className="amt num down">
                  −{mask(privacy, fmtVnd(e.amount, true))}
                </div>
              </div>
              <span className="chev">›</span>
            </button>
          )
        })}
        {recent.length === 0 && (
          <div className="row" style={{ color: 'var(--muted)' }}>
            Chưa có khoản chi
          </div>
        )}
      </div>
    </div>
  )
}

/** Form ghi chi (chỉ chi, không thu) */
export function SpendForm() {
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const addExpense = useStore((s) => s.addExpense)
  const categories = useStore((s) => s.expenseCategories)
  const linkDefault = useStore((s) => s.settings.expenseLinkCashDefault)
  const updateSettings = useStore((s) => s.updateSettings)

  const cats = categories
    .filter((c) => c.kind === 'expense' && !c.archived)
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
  }, [firstCatId])

  function submit() {
    const a = moneyNum(amount)
    if (!categoryId) {
      showToast('Chọn danh mục')
      return
    }
    setBusy(true)
    const res = addExpense({
      kind: 'expense',
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
    showToast('Đã ghi chi')
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
        <h1>Ghi chi</h1>
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
            <div style={{ fontWeight: 650 }}>Trừ tiền mặt VND</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Đồng bộ sổ tài sản (tùy chọn)
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
                  ? 'Mặc định: trừ tiền mặt'
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
        {busy ? 'Đang lưu…' : 'Lưu chi tiêu'}
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
        <div className="sub">{yearMonthOf(e.spentAt)} · Chi</div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div className="num down" style={{ fontSize: 28, fontWeight: 750 }}>
          −{mask(privacy, fmtVnd(e.amount))} đ
        </div>
        <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 13 }}>
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

  const list = categories
    .filter((c) => c.kind === 'expense' && !c.archived)
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
      kind: 'expense',
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
        <button type="button" className="back" onClick={() => setScreen('spend')}>
          ‹ Báo cáo
        </button>
      </div>
      <div className="large-title">
        <h1>Danh mục chi</h1>
        <div className="sub">Chạm dòng để sửa · chọn icon bên dưới</div>
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
              className="mark"
              style={{ background: `${c.color}22`, color: c.color }}
            >
              {c.icon}
            </div>
            <div className="body">
              <div className="t">{c.name}</div>
              <div className="d">{c.isSystem ? 'Mặc định' : 'Tự tạo'}</div>
            </div>
            <span className="link-btn">Sửa</span>
            <span className="chev">›</span>
          </button>
        ))}
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
              className={`color-pick ${color === col ? 'on' : ''}`}
              style={{ background: col }}
              onClick={() => setColor(col)}
              aria-label={col}
            />
          ))}
        </div>
      </div>

      <div className="cat-preview">
        <div className="mark" style={{ background: `${color}22`, color }}>
          {icon}
        </div>
        <span>{name.trim() || 'Tên danh mục'}</span>
      </div>

      <button className="btn-primary" type="button" onClick={save}>
        {editing ? 'Lưu thay đổi' : 'Thêm danh mục'}
      </button>

      {editing && editCat && !editCat.isSystem && (
        <button
          className="btn-secondary"
          type="button"
          style={{ marginTop: 10, color: 'var(--down)' }}
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
