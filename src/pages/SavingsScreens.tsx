import { useState } from 'react'
import { useStore } from '../store/useStore'
import {
  daysUntil,
  estimateInterest,
  fmtNum,
  fmtVnd,
  nowIso,
  toDateInput,
  formatMoneyInput,
  moneyNum,
} from '../lib/format'
import type { SavingsAccount } from '../types'
import { MoneyInput } from '../components/MoneyInput'
import { mask } from '../lib/ui'

export function SavingsList({ privacy }: { privacy: boolean }) {
  const savings = useStore((s) => s.savings)
  const setScreen = useStore((s) => s.setScreen)
  const active = savings
    .filter((s) => s.status === 'active' && s.principal > 0)
    .slice()
    .sort((a, b) => {
      const da = daysUntil(a.maturityDate)
      const db = daysUntil(b.maturityDate)
      if (da == null && db == null) return b.principal - a.principal
      if (da == null) return 1
      if (db == null) return -1
      return da - db
    })
  const total = active.reduce((a, s) => a + s.principal, 0)
  const totalInterest = active.reduce(
    (a, s) => a + estimateInterest(s.principal, s.rateAnnual, s.startDate),
    0,
  )
  const soon = active.filter((s) => {
    const d = daysUntil(s.maturityDate)
    return d != null && d >= 0 && d <= 30
  }).length

  return (
    <div className="scroll">
      <div className="large-title" style={{ paddingTop: 8 }}>
        <h1>Tiết kiệm</h1>
        <div className="sub">Sổ gửi ngân hàng đang mở</div>
      </div>

      <div className="sav-hero">
        <div className="sav-hero-label">Tổng gốc đang gửi</div>
        <div className="sav-hero-total num">
          {mask(privacy, fmtVnd(total))}
          <small>đ</small>
        </div>
        <div className="sav-hero-grid">
          <div>
            <div className="k">Số khoản</div>
            <div className="v num">{active.length}</div>
          </div>
          <div>
            <div className="k">Lãi ước tính</div>
            <div className="v num up">
              +{mask(privacy, fmtVnd(totalInterest, true))}
            </div>
          </div>
          <div>
            <div className="k">Sắp đáo hạn</div>
            <div className="v num">{soon > 0 ? `${soon} khoản` : '—'}</div>
          </div>
        </div>
      </div>

      <button
        className="btn-primary"
        style={{ marginBottom: 14 }}
        onClick={() => setScreen('savings-form')}
      >
        + Gửi tiết kiệm mới
      </button>

      {active.length === 0 ? (
        <div className="empty">
          <h3>Chưa có khoản đang gửi</h3>
          <p>Thêm sổ tiết kiệm ngân hàng để theo dõi gốc, lãi và đáo hạn.</p>
        </div>
      ) : (
        <div className="sav-list">
          {active.map((s) => (
            <SavingsRow key={s.id} s={s} privacy={privacy} />
          ))}
        </div>
      )}
    </div>
  )
}


export function SavingsRow({
  s,
  privacy,
}: {
  s: SavingsAccount
  privacy: boolean
}) {
  const setScreen = useStore((s) => s.setScreen)
  const interest = estimateInterest(s.principal, s.rateAnnual, s.startDate)
  const due = daysUntil(s.maturityDate)
  const termDays =
    s.startDate && s.maturityDate
      ? Math.max(
          1,
          Math.round(
            (new Date(s.maturityDate).getTime() -
              new Date(s.startDate).getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : null
  const elapsed =
    s.startDate && termDays
      ? Math.min(
          1,
          Math.max(
            0,
            (Date.now() - new Date(s.startDate).getTime()) /
              (1000 * 60 * 60 * 24) /
              termDays,
          ),
        )
      : null
  const pct = elapsed != null ? Math.round(elapsed * 100) : null
  const urgent = due != null && due <= 30
  const overdue = due != null && due < 0

  return (
    <button
      type="button"
      className={`sav-card ${urgent ? 'sav-card-warn' : ''} ${overdue ? 'sav-card-over' : ''}`}
      onClick={() => setScreen('savings-detail', s.id)}
    >
      <div className="sav-card-top">
        <div className="sav-bank-badge">{s.bank.slice(0, 2).toUpperCase()}</div>
        <div className="sav-card-mid">
          <div className="sav-card-name">{s.name}</div>
          <div className="sav-card-meta">
            {s.bank}
            {s.rateAnnual > 0 ? ` · ${fmtNum(s.rateAnnual, 2)}%/năm` : ''}
          </div>
        </div>
        <div className="sav-card-amt">
          <div className="num">{mask(privacy, fmtVnd(s.principal))}</div>
          <div className="unit">đ</div>
        </div>
      </div>

      <div className="sav-card-bottom">
        <div className="sav-interest up">
          Lãi ~{mask(privacy, fmtVnd(interest))}đ
        </div>
        <div
          className={`sav-due ${overdue ? 'over' : urgent ? 'warn' : ''}`}
        >
          {due == null
            ? 'Không kỳ hạn'
            : overdue
              ? `Quá hạn ${-due} ngày`
              : due === 0
                ? 'Đáo hạn hôm nay'
                : `Còn ${due} ngày`}
        </div>
      </div>

      {pct != null && (
        <div className="sav-progress">
          <div className="sav-progress-bar" style={{ width: `${pct}%` }} />
        </div>
      )}
    </button>
  )
}


export function SavingsForm() {
  const addSavings = useStore((s) => s.addSavings)
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const [name, setName] = useState('Sổ tiết kiệm')
  const [bank, setBank] = useState('')
  const [principal, setPrincipal] = useState('50000000')
  const [rate, setRate] = useState('5.5')
  const [start, setStart] = useState(toDateInput(nowIso()))
  const [term, setTerm] = useState('6')
  const [noTerm, setNoTerm] = useState(false)
  const [linkedCash, setLinkedCash] = useState(true)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  const maturity = (() => {
    if (noTerm || !term) return null
    const d = new Date(start + 'T12:00:00')
    d.setMonth(d.getMonth() + (Number(term) || 0))
    return d.toISOString()
  })()

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => setScreen('savings')}>
          ‹ Huỷ
        </button>
        <div className="mid">Gửi tiết kiệm</div>
        <div style={{ minWidth: 64 }} />
      </div>

      <div className="card">
        <div className="field">
          <label>Tên khoản</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ fontSize: 17, fontWeight: 600 }}
          />
        </div>
        <div className="field">
          <label>Ngân hàng</label>
          <input
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            placeholder="VCB, ACB, MB…"
            style={{ fontSize: 17, fontWeight: 600 }}
          />
        </div>
        <div className="field">
          <label>Số tiền gửi</label>
          <MoneyInput value={principal} onChange={setPrincipal} />
        </div>
        <div className="field">
          <label>Lãi suất %/năm</label>
          <div className="inline">
            <input
              className="num"
              type="text"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))}
            />
            <span className="unit">%</span>
          </div>
        </div>
        <div className="field">
          <label>Ngày gửi</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            style={{ fontSize: 16, fontWeight: 600 }}
          />
        </div>
        <div className="field">
          <label>Kỳ hạn (tháng)</label>
          <div className="inline">
            <input
              className="num"
              type="text"
              inputMode="numeric"
              value={term}
              disabled={noTerm}
              onChange={(e) => setTerm(e.target.value.replace(/\D/g, ''))}
            />
            <span className="unit">th</span>
          </div>
          {maturity && !noTerm && (
            <div className="hint">
              Đáo hạn ước tính:{' '}
              {new Date(maturity).toLocaleDateString('vi-VN')}
            </div>
          )}
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={noTerm}
            onChange={(e) => setNoTerm(e.target.checked)}
          />
          <span>Không kỳ hạn</span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={linkedCash}
            onChange={(e) => setLinkedCash(e.target.checked)}
          />
          <span>
            Trừ từ <b>tiền mặt VND</b> trong sổ (cần nạp VND trước nếu bật)
          </span>
        </label>
        <div className="field">
          <label>Ghi chú</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ fontSize: 16, fontWeight: 600 }}
          />
        </div>
      </div>

      <div className="summary">
        <div className="r">
          <span>Số tiền gửi</span>
          <span>{formatMoneyInput(principal) || '0'} đ</span>
        </div>
        <div className="total">
          <span className="k">Ghi nhận</span>
          <span className="v num">{formatMoneyInput(principal) || '0'}đ</span>
        </div>
      </div>

      {err && <div className="error">{err}</div>}
      <button
        className="btn-primary"
        onClick={() => {
          const res = addSavings({
            name,
            bank,
            principal: moneyNum(principal),
            rateAnnual: Number(rate) || 0,
            startDate: new Date(start + 'T12:00:00').toISOString(),
            maturityDate: noTerm ? null : maturity,
            termMonths: noTerm ? null : Number(term) || null,
            note: note || undefined,
            linkedCash,
          })
          if (!res.ok) {
            setErr(res.error)
            return
          }
          showToast('Đã thêm tiết kiệm')
          setScreen('savings-detail', res.id)
        }}
      >
        Lưu khoản tiết kiệm
      </button>
    </div>
  )
}


export function SavingsDetail({ privacy }: { privacy: boolean }) {
  const id = useStore((s) => s.detailAssetId)
  const savings = useStore((s) => s.savings)
  const setScreen = useStore((s) => s.setScreen)
  const closeSavings = useStore((s) => s.closeSavings)
  const deleteSavings = useStore((s) => s.deleteSavings)
  const showToast = useStore((s) => s.showToast)
  const s = savings.find((x) => x.id === id)
  const [closeAmt, setCloseAmt] = useState('')
  const [closeTouched, setCloseTouched] = useState(false)
  const [linkCash, setLinkCash] = useState(false)
  const [err, setErr] = useState('')

  if (!s) {
    return (
      <div className="scroll plain">
        <button className="back" onClick={() => setScreen('savings')}>
          ‹ Tiết kiệm
        </button>
        <div className="empty">
          <h3>Không tìm thấy</h3>
        </div>
      </div>
    )
  }

  const interest = estimateInterest(
    s.principal,
    s.rateAnnual,
    s.startDate,
    s.status === 'closed' ? s.updatedAt : undefined,
  )
  const suggestClose = Math.round(s.principal + interest)
  const closeDisplay = closeTouched
    ? closeAmt
    : String(suggestClose)
  const due = daysUntil(s.maturityDate)

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => setScreen('savings')}>
          ‹ Tiết kiệm
        </button>
        <div className="mid">{s.name}</div>
        <div style={{ minWidth: 64 }} />
      </div>

      <div className="sav-detail-hero">
        <div className="pill sav-status-pill">
          {s.status === 'active' ? 'Đang gửi' : 'Đã tất toán'} · {s.bank}
        </div>
        <div className="k">Gốc</div>
        <div className="big num">
          {mask(privacy, fmtVnd(s.principal))}
          <small>đ</small>
        </div>
        <div className="sav-detail-row">
          <div>
            <div className="k">Lãi suất</div>
            <div className="v num">{fmtNum(s.rateAnnual, 2)}%/năm</div>
          </div>
          <div>
            <div className="k">Lãi ước tính</div>
            <div className="v num up">+{mask(privacy, fmtVnd(interest))}đ</div>
          </div>
          <div>
            <div className="k">Đáo hạn</div>
            <div className="v">
              {s.maturityDate
                ? new Date(s.maturityDate).toLocaleDateString('vi-VN')
                : 'KKH'}
            </div>
          </div>
        </div>
        {due != null && (
          <div className={`sav-due-banner ${due <= 30 ? 'warn' : ''} ${due < 0 ? 'over' : ''}`}>
            {due < 0
              ? `Đã quá hạn ${-due} ngày`
              : due === 0
                ? 'Đáo hạn hôm nay'
                : `Còn ${due} ngày đến đáo hạn`}
          </div>
        )}
      </div>

      {s.note && (
        <div className="card">
          <div className="field">
            <label>Ghi chú</label>
            <div style={{ fontSize: 15 }}>{s.note}</div>
          </div>
        </div>
      )}

      {s.status === 'active' && (
        <>
          <div className="sec">
            <h2>Tất toán</h2>
          </div>
          <div className="card">
            <div className="field">
              <label>Số nhận về (gốc + lãi)</label>
              <MoneyInput
                value={closeDisplay}
                onChange={(digits) => {
                  setCloseTouched(true)
                  setCloseAmt(digits)
                }}
              />
              <div className="hint">
                Gợi ý gốc + lãi ước:{' '}
                <b>{fmtVnd(suggestClose)} đ</b>
              </div>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={linkCash}
                onChange={(e) => setLinkCash(e.target.checked)}
              />
              <span>Cộng vào tiền mặt VND trong sổ</span>
            </label>
          </div>

          <div className="summary">
            <div className="r">
              <span>Gốc</span>
              <span>{fmtVnd(s.principal)} đ</span>
            </div>
            <div className="r">
              <span>Lãi ước</span>
              <span>+{fmtVnd(interest)} đ</span>
            </div>
            <div className="total">
              <span className="k">Nhận về</span>
              <span className="v num">
                {formatMoneyInput(closeDisplay) || '0'}đ
              </span>
            </div>
          </div>

          <button
            className="btn-primary"
            onClick={() => {
              const amountBack = moneyNum(closeDisplay) || suggestClose
              const res = closeSavings({
                id: s.id,
                amountBack,
                linkedCash: linkCash,
                tradedAt: nowIso(),
              })
              if (!res.ok) {
                setErr(res.error)
                return
              }
              showToast('Đã tất toán')
              setScreen('savings')
            }}
          >
            Tất toán khoản này
          </button>
        </>
      )}

      {err && <div className="error">{err}</div>}
      <button
        className="btn-secondary"
        style={{ color: 'var(--down)', marginTop: 16 }}
        onClick={() => {
          if (confirm('Xoá khoản tiết kiệm này khỏi sổ?')) {
            deleteSavings(s.id)
            showToast('Đã xoá')
            setScreen('savings')
          }
        }}
      >
        Xoá khỏi sổ
      </button>
    </div>
  )
}

/* ========== CHO VAY ========== */


