import { useState } from 'react'
import { useStore } from '../store/useStore'
import {
  calcLoanInterestPerDay,
  calcLoanOutstandingInterest,
  daysUntil,
  fmtVnd,
  loanInterestLabel,
  nowIso,
  toDateInput,
  toRateAnnual,
  formatMoneyInput,
  moneyNum,
} from '../lib/format'
import type { Loan, LoanInterestType } from '../types'
import { MoneyInput } from '../components/MoneyInput'
import { AppIcon } from '../components/AppIcon'
import { mask } from '../lib/ui'

export function LoansList({ privacy }: { privacy: boolean }) {
  const loans = useStore((s) => s.loans)
  const setScreen = useStore((s) => s.setScreen)
  const trashCount = loans.filter((l) => l.deletedAt).length
  const open = loans
    .filter(
      (l) =>
        !l.deletedAt &&
        (l.status === 'open' || l.status === 'partial') &&
        l.remaining > 0,
    )
    .slice()
    .sort((a, b) => b.remaining - a.remaining)
  const total = open.reduce((a, l) => a + l.remaining, 0)
  const principalSum = open.reduce((a, l) => a + l.principal, 0)
  const collected = principalSum - total
  const overdueN = open.filter((l) => {
    const d = daysUntil(l.dueDate)
    return d != null && d < 0
  }).length
  const accrued = open.reduce(
    (a, l) => a + calcLoanOutstandingInterest(l).outstanding,
    0,
  )

  return (
    <div className="scroll wb-page loans-page">
      <div className="large-title">
        <h1>Cho vay</h1>
        <div className="sub">Khoản còn phải thu</div>
      </div>

      <section className="wb-hero" aria-label="Tổng còn thu">
        <p className="wb-hero__label">Tổng còn thu</p>
        <p className="wb-hero__amount num">
          {mask(privacy, fmtVnd(total))}

        </p>
        <div className="wb-hero__stats">
          <div className="wb-hero__stat">
            <span className="wb-hero__stat-k">Số khoản</span>
            <span className="wb-hero__stat-v num">{open.length}</span>
          </div>
          <div className="wb-hero__stat">
            <span className="wb-hero__stat-k">Đã thu gốc</span>
            <span className="wb-hero__stat-v num">
              {mask(privacy, fmtVnd(Math.max(0, collected)))}
            </span>
          </div>
          <div className="wb-hero__stat">
            <span className="wb-hero__stat-k">Lãi tạm tính</span>
            <span className="wb-hero__stat-v num">
              {mask(privacy, fmtVnd(Math.round(accrued)))}
            </span>
          </div>
        </div>
        {overdueN > 0 ? (
          <div className="wb-hero__alert" role="status">
            {overdueN} khoản đang trễ hạn
          </div>
        ) : null}
      </section>

      <div className="btn-row">
        <button
          type="button"
          className="btn-primary"
          onClick={() => setScreen('loan-form')}
        >
          <AppIcon name="plus" size={18} />
          Cho vay mới
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setScreen('loans-trash')}
        >
          Thùng rác{trashCount ? ` (${trashCount})` : ''}
        </button>
      </div>

      {open.length === 0 ? (
        <div className="empty">
          <h3>Không còn khoản đang vay</h3>
          <p>Chỉ hiện khoản còn phải thu. Đã xóa nằm trong Thùng rác.</p>
        </div>
      ) : (
        <div className="loan-list">
          {open.map((l) => (
            <LoanRow key={l.id} l={l} privacy={privacy} />
          ))}
        </div>
      )}
    </div>
  )
}

export function LoanRow({ l, privacy }: { l: Loan; privacy: boolean }) {
  const setScreen = useStore((s) => s.setScreen)
  const due = daysUntil(l.dueDate)
  const paidPct =
    l.principal > 0
      ? Math.round(((l.principal - l.remaining) / l.principal) * 100)
      : 0
  const paidPrincipal = Math.max(0, l.principal - l.remaining)
  const interestInfo = calcLoanOutstandingInterest(l)
  const accrued = Math.round(interestInfo.outstanding)
  const interestPaid = Math.round(l.interestPaid || 0)
  const lendLabel = new Date(l.lendDate).toLocaleDateString('vi-VN')
  const rateLabel = loanInterestLabel({
    rateAnnual: l.rateAnnual,
    interestType: l.interestType,
    interestValue: l.interestValue,
  })
  const initials = l.borrower
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 2) || 'V'
  const overdue = due != null && due < 0
  const urgent = due != null && due >= 0 && due <= 7
  const statusLabel = l.status === 'partial' ? 'Thu một phần' : 'Đang vay'

  return (
    <button
      type="button"
      className={`loan-card ${urgent ? 'loan-card-warn' : ''} ${overdue ? 'loan-card-over' : ''}`}
      onClick={() => setScreen('loan-detail', l.id)}
    >
      <div className="loan-card-top">
        <div className="loan-avatar">{initials}</div>
        <div className="loan-card-mid">
          <div className="loan-card-name">{l.borrower}</div>
          <div className="loan-card-meta">
            {statusLabel}
            {' · '}
            {rateLabel}
            {l.phone ? ` · ${l.phone}` : ''}
          </div>
        </div>
        <div className="loan-card-amt">
          <div className="num">{mask(privacy, fmtVnd(l.remaining))}</div>
          <div className="unit">còn thu (gốc)</div>
        </div>
      </div>

      <div className="loan-card-facts" aria-label="Chi tiết khoản vay">
        <div className="loan-fact">
          <span className="loan-fact-k">Ngày vay</span>
          <span className="loan-fact-v">{lendLabel}</span>
        </div>
        <div className="loan-fact">
          <span className="loan-fact-k">
            Lãi tạm
            {interestInfo.days > 0 ? ` · ${interestInfo.days}n` : ''}
          </span>
          <span className={`loan-fact-v num ${accrued > 0 ? 'loan-fact-v--accrued' : ''}`}>
            {mask(privacy, fmtVnd(accrued))}
          </span>
        </div>
        <div className="loan-fact">
          <span className="loan-fact-k">Đã thu lãi</span>
          <span className="loan-fact-v num">
            {mask(privacy, fmtVnd(interestPaid))}
          </span>
        </div>
      </div>

      <div className="loan-card-bottom">
        <div className="loan-orig">
          Gốc {mask(privacy, fmtVnd(l.principal))}
          {paidPrincipal > 0
            ? ` · đã thu gốc ${mask(privacy, fmtVnd(paidPrincipal))}`
            : ''}
          {paidPct > 0 ? ` (${paidPct}%)` : ''}
        </div>
        <div className={`loan-due ${overdue ? 'over' : urgent ? 'warn' : ''}`}>
          {due == null
            ? 'Không hẹn hạn'
            : overdue
              ? `Trễ ${-due} ngày`
              : due === 0
                ? 'Hẹn hôm nay'
                : `Còn ${due} ngày`}
        </div>
      </div>
      {l.principal > 0 && (
        <div className="loan-progress">
          <div
            className="loan-progress-bar"
            style={{ width: `${Math.min(100, paidPct)}%` }}
          />
        </div>
      )}
    </button>
  )
}

export function LoanForm({ mode }: { mode: 'create' | 'edit' }) {
  const addLoan = useStore((s) => s.addLoan)
  const updateLoan = useStore((s) => s.updateLoan)
  const goBack = useStore((s) => s.goBack)
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const detailId = useStore((s) => s.detailAssetId)
  const existing = useStore((s) =>
    mode === 'edit' ? s.loans.find((x) => x.id === detailId) : undefined,
  )

  const [borrower, setBorrower] = useState(existing?.borrower || '')
  const [phone, setPhone] = useState(existing?.phone || '')
  const [principal, setPrincipal] = useState(
    String(existing?.principal ?? 5000000),
  )
  const [remaining, setRemaining] = useState(
    String(existing?.remaining ?? existing?.principal ?? 5000000),
  )
  // 3 kiểu lãi chính: %/tháng | /1tr/ngày | cố định/tháng
  const initType: LoanInterestType =
    existing?.interestType === 'per_million_daily' ||
    existing?.interestType === 'flat_monthly' ||
    existing?.interestType === 'percent_monthly'
      ? existing.interestType
      : existing?.interestType === 'annual' && (existing.rateAnnual || 0) > 0
        ? 'percent_monthly' // annual cũ → nhập lại %/tháng (rateAnnual/12)
        : 'percent_monthly'

  const [interestType, setInterestType] =
    useState<LoanInterestType>(initType)
  const defaultVal =
    existing?.interestValue != null && existing.interestValue > 0
      ? String(existing.interestValue)
      : existing?.interestType === 'annual' && existing.rateAnnual
        ? String(Math.round((existing.rateAnnual / 12) * 100) / 100)
        : interestType === 'per_million_daily'
          ? '1000'
          : interestType === 'flat_monthly'
            ? '1300000'
            : '1.5'
  const [interestVal, setInterestVal] = useState(defaultVal)
  const [lendDate, setLendDate] = useState(
    toDateInput(existing?.lendDate || nowIso()),
  )
  const [dueDate, setDueDate] = useState(
    existing?.dueDate ? toDateInput(existing.dueDate) : '',
  )
  const [linkedCash, setLinkedCash] = useState(
    mode === 'create' ? false : !!existing?.linkedCash,
  )
  const [note, setNote] = useState(existing?.note || '')
  const [err, setErr] = useState('')

  const pNum = moneyNum(principal)
  const remNum = mode === 'edit' ? moneyNum(remaining) : pNum
  const vNum = moneyNum(interestVal)
  const previewDay = calcLoanInterestPerDay({
    remaining: remNum || pNum,
    rateAnnual: toRateAnnual(interestType, vNum),
    interestType,
    interestValue: vNum,
  })
  const previewMonth =
    interestType === 'flat_monthly'
      ? vNum
      : interestType === 'percent_monthly'
        ? (remNum || pNum) * (vNum / 100)
        : interestType === 'per_million_daily'
          ? ((remNum || pNum) / 1_000_000) * vNum * 30
          : previewDay * 30

  function pickType(t: LoanInterestType) {
    setInterestType(t)
    if (t === 'percent_monthly' && (!interestVal || interestVal === '0'))
      setInterestVal('1.5')
    if (t === 'per_million_daily' && (!interestVal || interestVal === '0'))
      setInterestVal('1000')
    if (t === 'flat_monthly' && (!interestVal || interestVal === '0'))
      setInterestVal('1300000')
  }

  function buildInterestFields() {
    const val = moneyNum(interestVal)
    return {
      interestType,
      interestValue: val,
      rateAnnual: toRateAnnual(interestType, val),
    }
  }

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => goBack()}>
          <AppIcon name="arrow-left" size={18} />
          Huỷ
        </button>
        <div className="mid">
          {mode === 'edit' ? 'Sửa khoản vay' : 'Cho vay mới'}
        </div>
        <div className="nav-spacer" />
      </div>

      <div className="card">
        <div className="field">
          <label>Người vay *</label>
          <input
            value={borrower}
            onChange={(e) => setBorrower(e.target.value)}
            placeholder="Tên / biệt danh"
            className="field-control"
          />
        </div>
        <div className="field">
          <label>SĐT (tuỳ chọn)</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            className="field-control"
          />
        </div>
        <div className="field">
          <label>Số tiền cho vay (gốc)</label>
          <MoneyInput
            value={principal}
            onChange={(v) => {
              setPrincipal(v)
              if (mode === 'create') setRemaining(v)
            }}
          />
        </div>
        {mode === 'edit' && (
          <div className="field">
            <label>Còn phải thu (gốc)</label>
            <MoneyInput value={remaining} onChange={setRemaining} />
          </div>
        )}
      </div>

      <div className="sec">
        <h2>Cách tính lãi</h2>
      </div>
      <div className="interest-type-grid">
        <button
          type="button"
          className={interestType === 'percent_monthly' ? 'on' : ''}
          onClick={() => pickType('percent_monthly')}
        >
          <strong>% / tháng</strong>
          <span>vd 1,5%/tháng</span>
        </button>
        <button
          type="button"
          className={interestType === 'per_million_daily' ? 'on' : ''}
          onClick={() => pickType('per_million_daily')}
        >
          <strong>/ 1tr / ngày</strong>
          <span>vd 1k/1tr/ngày</span>
        </button>
        <button
          type="button"
          className={interestType === 'flat_monthly' ? 'on' : ''}
          onClick={() => pickType('flat_monthly')}
        >
          <strong>Cố định / tháng</strong>
          <span>vd 1.300.000</span>
        </button>
      </div>

      <div className="card">
        {interestType === 'percent_monthly' && (
          <div className="field">
            <label>Lãi suất (% / tháng)</label>
            <MoneyInput
              value={interestVal}
              onChange={setInterestVal}
              unit="%/th"
              decimal
              maxFraction={3}
            />
            <div className="hint">
              Gốc {fmtVnd(remNum || pNum)} → lãi khoảng{' '}
              <b>{fmtVnd(Math.round(previewMonth))}/tháng</b>
            </div>
          </div>
        )}
        {interestType === 'per_million_daily' && (
          <div className="field">
            <label>Lãi (/ 1 triệu / ngày)</label>
            <MoneyInput
              value={interestVal}
              onChange={setInterestVal}
                          />
            <div className="hint">
              Ví dụ <b>1.000</b> = 1k/1tr/ngày. Gốc{' '}
              {fmtVnd(remNum || pNum)} →{' '}
              <b>{fmtVnd(Math.round(previewDay))}/ngày</b>
              {' · '}
              <b>{fmtVnd(Math.round(previewMonth))}/tháng</b> (ước 30 ngày)
            </div>
          </div>
        )}
        {interestType === 'flat_monthly' && (
          <div className="field">
            <label>Lãi cố định mỗi tháng</label>
            <MoneyInput
              value={interestVal}
              onChange={setInterestVal}
              unit="/th"
            />
            <div className="hint">
              Ví dụ <b>1.300.000</b>/tháng, không phụ thuộc gốc. ≈{' '}
              <b>{fmtVnd(Math.round(previewDay))}/ngày</b>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="field">
          <label>Ngày cho vay</label>
          <input
            type="date"
            value={lendDate}
            onChange={(e) => setLendDate(e.target.value)}
            className="field-control-sm"
          />
        </div>
        <div className="field">
          <label>Hẹn trả (tuỳ chọn)</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="field-control-sm"
          />
        </div>
        {mode === 'create' && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={linkedCash}
              onChange={(e) => setLinkedCash(e.target.checked)}
            />
            <span>
              Trừ từ <b>tiền mặt VND</b> trong sổ. Bật rồi thì <b>không</b> rút
              tay thêm ở Nạp/Rút.
            </span>
          </label>
        )}
        <div className="field">
          <label>Ghi chú</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="field-control-sm"
          />
        </div>
      </div>

      <div className="summary">
        <div className="r">
          <span>Kiểu lãi</span>
          <span>
            {loanInterestLabel({
              interestType,
              interestValue: vNum,
              rateAnnual: toRateAnnual(interestType, vNum),
            })}
          </span>
        </div>
        <div className="r">
          <span>Ước / ngày</span>
          <span>{fmtVnd(Math.round(previewDay))}</span>
        </div>
        <div className="total">
          <span className="k">Ước / tháng</span>
          <span className="v num">{fmtVnd(Math.round(previewMonth))}</span>
        </div>
      </div>

      {err && <div className="error">{err}</div>}
      <button type="button" className="btn-primary"
              onClick={() => {
          const { interestType: it, interestValue: iv, rateAnnual } =
            buildInterestFields()
          if (mode === 'edit' && existing) {
            const res = updateLoan(existing.id, {
              borrower,
              phone: phone || undefined,
              principal: moneyNum(principal),
              remaining: moneyNum(remaining),
              rateAnnual,
              interestType: it,
              interestValue: iv,
              lendDate: new Date(lendDate + 'T12:00:00').toISOString(),
              dueDate: dueDate
                ? new Date(dueDate + 'T12:00:00').toISOString()
                : null,
              note: note || undefined,
            })
            if (!res.ok) {
              setErr(res.error)
              return
            }
            showToast('Đã cập nhật khoản vay')
            setScreen('loan-detail', existing.id, { replace: true })
            return
          }
          const res = addLoan({
            borrower,
            phone: phone || undefined,
            principal: moneyNum(principal),
            rateAnnual,
            interestType: it,
            interestValue: iv,
            lendDate: new Date(lendDate + 'T12:00:00').toISOString(),
            dueDate: dueDate
              ? new Date(dueDate + 'T12:00:00').toISOString()
              : null,
            note: note || undefined,
            linkedCash,
          })
          if (!res.ok) {
            setErr(res.error)
            return
          }
          showToast('Đã ghi khoản cho vay')
          setScreen('loan-detail', res.id, { replace: true })
        }}
      >
        {mode === 'edit' ? 'Lưu chỉnh sửa' : 'Lưu khoản cho vay'}
      </button>
    </div>
  )
}

export function LoanDetail({ privacy }: { privacy: boolean }) {
  const id = useStore((s) => s.detailAssetId)
  const loans = useStore((s) => s.loans)
  const setScreen = useStore((s) => s.setScreen)
  const goBack = useStore((s) => s.goBack)
  const receiveLoanPayment = useStore((s) => s.receiveLoanPayment)
  const payLoanInterest = useStore((s) => s.payLoanInterest)
  const writeOffLoan = useStore((s) => s.writeOffLoan)
  const softDeleteLoan = useStore((s) => s.softDeleteLoan)
  const showToast = useStore((s) => s.showToast)
  const l = loans.find((x) => x.id === id)
  const [panel, setPanel] = useState<'none' | 'principal' | 'interest' | 'more'>(
    'none',
  )
  const [pay, setPay] = useState('')
  const [linkCash, setLinkCash] = useState(false)
  const [err, setErr] = useState('')

  if (!l) {
    return (
      <div className="scroll plain">
        <button className="back" onClick={() => goBack()}>
          <AppIcon name="arrow-left" size={18} />
          Cho vay
        </button>
        <div className="empty">
          <h3>Không tìm thấy</h3>
        </div>
      </div>
    )
  }

  const interestInfo = calcLoanOutstandingInterest(l)
  const accrued = interestInfo.outstanding
  const active =
    !l.deletedAt &&
    (l.status === 'open' || l.status === 'partial') &&
    l.remaining > 0
  const paid = l.principal - l.remaining
  const paidPct =
    l.principal > 0 ? Math.round((paid / l.principal) * 100) : 0
  const due = daysUntil(l.dueDate)
  const interestPaid = l.interestPaid || 0
  const fromLabel = new Date(interestInfo.fromDate).toLocaleDateString('vi-VN')
  const interestStartIsLend =
    interestInfo.fromDate.slice(0, 10) === l.lendDate.slice(0, 10)

  const perDay = Math.round(
    calcLoanInterestPerDay({
      remaining: l.remaining,
      rateAnnual: l.rateAnnual,
      interestType: l.interestType,
      interestValue: l.interestValue,
    }),
  )
  const accruedRound = Math.round(accrued)
  const rateLabel = loanInterestLabel({
    rateAnnual: l.rateAnnual,
    interestType: l.interestType,
    interestValue: l.interestValue,
  })
  const statusLabel =
    l.status === 'written_off'
      ? 'Đã xóa nợ'
      : l.status === 'paid'
        ? 'Đã thu đủ gốc'
        : l.status === 'partial'
          ? 'Thu một phần'
          : 'Đang vay'
  const periodHint = interestStartIsLend
    ? `Từ ngày vay ${fromLabel} · ${interestInfo.days} ngày`
    : `Sau đóng lãi ${fromLabel} · ${interestInfo.days} ngày`

  return (
    <div className="scroll plain has-bottom-actions loan-detail-page">
      <div className="nav">
        <button type="button" className="back" onClick={() => goBack()}>
          <AppIcon name="arrow-left" size={18} />
          Cho vay
        </button>
        <div className="mid">{l.borrower}</div>
        <button
          className="link-btn"
          type="button"
          onClick={() => setScreen('loan-edit', l.id)}
        >
          Sửa
        </button>
      </div>

      <section className="wb-hero loan-detail-hero" aria-label="Còn phải thu">
        <div className="loan-detail-status-row">
          <span className="loan-status-chip">{statusLabel}</span>
          {due != null ? (
            <span
              className={`loan-due ${due < 0 ? 'over' : due <= 7 ? 'warn' : ''}`}
            >
              {due < 0
                ? `Trễ ${-due} ngày`
                : due === 0
                  ? 'Hẹn hôm nay'
                  : `Còn ${due} ngày`}
            </span>
          ) : null}
        </div>
        <p className="wb-hero__label">Còn phải thu (gốc)</p>
        <p className="wb-hero__amount num">
          {mask(privacy, fmtVnd(l.remaining))}

        </p>
        <div className="wb-hero__stats">
          <div className="wb-hero__stat">
            <span className="wb-hero__stat-k">Gốc</span>
            <span className="wb-hero__stat-v num">
              {mask(privacy, fmtVnd(l.principal, true))}
            </span>
          </div>
          <div className="wb-hero__stat">
            <span className="wb-hero__stat-k">Đã thu gốc</span>
            <span className="wb-hero__stat-v num">
              {mask(privacy, fmtVnd(paid, true))}
            </span>
          </div>
          <div className="wb-hero__stat">
            <span className="wb-hero__stat-k">Đã thu lãi</span>
            <span className="wb-hero__stat-v num">
              {mask(privacy, fmtVnd(interestPaid, true))}
            </span>
          </div>
        </div>
        {l.principal > 0 ? (
          <div className="loan-detail-progress">
            <div className="loan-progress loan-progress-dark">
              <div
                className="loan-progress-bar"
                style={{ width: `${Math.min(100, paidPct)}%` }}
              />
            </div>
            <div className="loan-progress-label">Đã thu {paidPct}% gốc</div>
          </div>
        ) : null}
      </section>

      {/* Lãi · khối tập trung cho thu lãi */}
      <section
        className={`loan-interest-card${accruedRound > 0 ? ' has-accrued' : ''}`}
        aria-label="Lãi tạm tính"
      >
        <div className="loan-interest-card__head">
          <div>
            <div className="loan-interest-card__label">Lãi tạm tính</div>
            <div className="loan-interest-card__amount num">
              {mask(privacy, fmtVnd(accruedRound))}

            </div>
          </div>
          {active && accruedRound > 0 ? (
            <button
              type="button"
              className="btn-primary btn-compact loan-interest-card__cta"
              onClick={() => {
                setPanel('interest')
                setPay(String(accruedRound))
                setErr('')
              }}
            >
              Đóng lãi
            </button>
          ) : null}
        </div>
        <div className="loan-interest-card__meta">
          <span>{rateLabel}</span>
          <span>≈ {fmtVnd(perDay)}/ngày</span>
          <span>{periodHint}</span>
        </div>
      </section>

      <section className="card loan-meta-card">
        <div className="loan-meta-row">
          <span className="loan-meta-k">Ngày cho vay</span>
          <span className="loan-meta-v">
            {new Date(l.lendDate).toLocaleDateString('vi-VN')}
          </span>
        </div>
        {l.dueDate ? (
          <div className="loan-meta-row">
            <span className="loan-meta-k">Hẹn trả</span>
            <span className="loan-meta-v">
              {new Date(l.dueDate).toLocaleDateString('vi-VN')}
            </span>
          </div>
        ) : null}
        {l.phone ? (
          <div className="loan-meta-row">
            <span className="loan-meta-k">SĐT</span>
            <a href={`tel:${l.phone}`} className="inline-link loan-meta-v">
              {l.phone}
            </a>
          </div>
        ) : null}
        {l.note ? (
          <div className="loan-meta-row loan-meta-row--note">
            <span className="loan-meta-k">Ghi chú</span>
            <span className="loan-meta-v loan-meta-v--wrap">{l.note}</span>
          </div>
        ) : null}
      </section>

      {panel === 'principal' && active ? (
        <section className="card loan-action-panel" aria-label="Thu gốc">
          <h3 className="loan-action-panel__title">Thu gốc</h3>
          <p className="loan-action-panel__hint">
            Giảm số còn thu. Còn lại:{' '}
            <strong className="num">{fmtVnd(l.remaining)}</strong>
          </p>
          <div className="field">
            <label>Số tiền thu gốc</label>
            <MoneyInput
              value={pay}
              onChange={setPay}
              placeholder={formatMoneyInput(l.remaining)}
              ariaLabel="Số tiền thu gốc"
            />
          </div>
          <label className="check-row loan-action-check">
            <input
              type="checkbox"
              checked={linkCash}
              onChange={(e) => setLinkCash(e.target.checked)}
            />
            <span>
              Cộng vào tiền mặt VND · không nạp tay thêm nếu đã bật
            </span>
          </label>
          <div className="loan-action-panel__actions">
            <button
              className="btn-primary"
              type="button"
              onClick={() => {
                const res = receiveLoanPayment({
                  id: l.id,
                  amount: moneyNum(pay) || l.remaining,
                  paidAt: nowIso(),
                  linkedCash: linkCash,
                })
                if (!res.ok) {
                  setErr(res.error)
                  return
                }
                setPay('')
                setPanel('none')
                setErr('')
                showToast('Đã thu gốc')
              }}
            >
              Xác nhận thu gốc
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                const res = receiveLoanPayment({
                  id: l.id,
                  amount: l.remaining,
                  paidAt: nowIso(),
                  linkedCash: linkCash,
                  note: 'Thu đủ gốc',
                })
                if (!res.ok) {
                  setErr(res.error)
                  return
                }
                showToast('Đã thu đủ gốc')
                setPanel('none')
                goBack()
              }}
            >
              Thu hết gốc còn lại
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setPanel('none')}
            >
              Hủy
            </button>
          </div>
        </section>
      ) : null}

      {panel === 'interest' ? (
        <section className="card loan-action-panel" aria-label="Đóng lãi">
          <h3 className="loan-action-panel__title">Đóng lãi</h3>
          <p className="loan-action-panel__hint">
            Không giảm gốc. Lãi tạm tính:{' '}
            <strong className="num">{fmtVnd(accruedRound)}</strong>
          </p>
          <div className="field">
            <label>Số tiền đóng lãi</label>
            <MoneyInput
              value={pay}
              onChange={setPay}
              placeholder={formatMoneyInput(accruedRound)}
              ariaLabel="Số tiền đóng lãi"
            />
          </div>
          <div className="loan-interest-presets" role="group" aria-label="Gợi ý">
            <button
              type="button"
              className={
                moneyNum(pay) === accruedRound ? 'on' : ''
              }
              onClick={() => setPay(String(accruedRound))}
            >
              Đủ lãi tạm
            </button>
            {perDay > 0 ? (
              <button
                type="button"
                className={moneyNum(pay) === perDay ? 'on' : ''}
                onClick={() => setPay(String(perDay))}
              >
                1 ngày
              </button>
            ) : null}
            {perDay > 0 ? (
              <button
                type="button"
                className={moneyNum(pay) === perDay * 7 ? 'on' : ''}
                onClick={() => setPay(String(perDay * 7))}
              >
                7 ngày
              </button>
            ) : null}
          </div>
          <label className="check-row loan-action-check">
            <input
              type="checkbox"
              checked={linkCash}
              onChange={(e) => setLinkCash(e.target.checked)}
            />
            <span>
              Cộng vào tiền mặt VND · không nạp tay thêm nếu đã bật
            </span>
          </label>
          <div className="loan-action-panel__actions">
            <button
              className="btn-primary"
              type="button"
              onClick={() => {
                const amt = moneyNum(pay) || accruedRound
                const res = payLoanInterest({
                  id: l.id,
                  amount: amt,
                  paidAt: nowIso(),
                  linkedCash: linkCash,
                })
                if (!res.ok) {
                  setErr(res.error)
                  return
                }
                setPay('')
                setPanel('none')
                setErr('')
                showToast('Đã đóng lãi')
              }}
            >
              Xác nhận đóng lãi
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setPanel('none')}
            >
              Hủy
            </button>
          </div>
        </section>
      ) : null}

      {panel === 'more' ? (
        <section className="card loan-action-panel" aria-label="Thêm thao tác">
          <h3 className="loan-action-panel__title">Thêm</h3>
          <p className="loan-action-panel__hint">
            Xóa nợ: không thu được, còn thu = 0, giữ lịch sử. Thùng rác: ẩn
            khỏi list, có thể khôi phục.
          </p>
          <div className="loan-action-panel__actions">
            {active ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  if (
                    confirm(
                      'Xóa nợ: đánh dấu không thu được. Khoản vẫn lưu lịch sử, còn thu = 0.',
                    )
                  ) {
                    writeOffLoan(l.id)
                    showToast('Đã xóa nợ (không thu được)')
                    goBack()
                  }
                }}
              >
                Xóa nợ (không thu được)
              </button>
            ) : null}
            <button
              className="btn-secondary btn-danger"
              type="button"
              onClick={() => {
                if (confirm('Cho vào thùng rác? Có thể khôi phục sau.')) {
                  softDeleteLoan(l.id)
                  showToast('Đã đưa vào thùng rác')
                  goBack()
                }
              }}
            >
              Cho vào thùng rác
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setPanel('none')}
            >
              Đóng
            </button>
          </div>
        </section>
      ) : null}

      <div className="sec">
        <h2>Lịch sử</h2>
      </div>
      <div className="group loan-history">
        {(l.payments || []).length === 0 ? (
          <div className="row row-muted cursor-default">
            Chưa có lần thu gốc, đóng lãi hay sửa. Mọi thao tác sẽ hiện ở đây.
          </div>
        ) : (
          [...(l.payments || [])].reverse().map((p) => {
            const kind =
              p.type === 'interest'
                ? 'Đóng lãi'
                : p.type === 'edit'
                  ? 'Sửa khoản'
                  : p.type === 'write_off'
                    ? 'Xóa nợ'
                    : 'Thu gốc'
            const showAmt =
              p.type !== 'edit' && p.amount > 0
                ? ` · ${fmtVnd(p.amount)}`
                : p.type === 'edit' && p.amount > 0
                  ? ` · Δ ${fmtVnd(p.amount)}`
                  : ''
            return (
              <div className="row cursor-default" key={p.id}>
                <div className="body">
                  <div className="t">
                    {kind}
                    {showAmt}
                  </div>
                  <div className="d">
                    {new Date(p.paidAt).toLocaleString('vi-VN')}
                    {p.note ? ` · ${p.note}` : ''}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {err ? (
        <div className="error" role="alert">
          {err}
        </div>
      ) : null}

      <nav className="bottom-actions loan-dock" aria-label="Thao tác khoản vay">
        {active ? (
          <>
            <button
              type="button"
              className={`loan-dock__btn${panel === 'principal' ? ' is-on' : ''}`}
              aria-pressed={panel === 'principal'}
              onClick={() => {
                setPanel(panel === 'principal' ? 'none' : 'principal')
                setPay('')
                setErr('')
              }}
            >
              <span className="loan-dock__ico" aria-hidden>
                <AppIcon name="cash" size={22} />
              </span>
              <span className="loan-dock__lab">Thu gốc</span>
            </button>
            <button
              type="button"
              className={`loan-dock__btn loan-dock__btn--interest${panel === 'interest' ? ' is-on' : ''}${accruedRound > 0 ? ' has-badge' : ''}`}
              aria-pressed={panel === 'interest'}
              onClick={() => {
                setPanel(panel === 'interest' ? 'none' : 'interest')
                setPay(String(accruedRound || ''))
                setErr('')
              }}
            >
              <span className="loan-dock__ico" aria-hidden>
                <AppIcon name="interest" size={22} />
              </span>
              <span className="loan-dock__lab">Đóng lãi</span>
              {accruedRound > 0 ? (
                <span className="loan-dock__badge" aria-hidden />
              ) : null}
            </button>
            <button
              type="button"
              className="loan-dock__btn"
              onClick={() => setScreen('loan-edit', l.id)}
            >
              <span className="loan-dock__ico" aria-hidden>
                <AppIcon name="edit" size={22} />
              </span>
              <span className="loan-dock__lab">Sửa</span>
            </button>
            <button
              type="button"
              className={`loan-dock__btn${panel === 'more' ? ' is-on' : ''}`}
              aria-pressed={panel === 'more'}
              onClick={() => setPanel(panel === 'more' ? 'none' : 'more')}
            >
              <span className="loan-dock__ico" aria-hidden>
                <AppIcon name="more" size={22} />
              </span>
              <span className="loan-dock__lab">Thêm</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="loan-dock__btn"
              onClick={() => goBack()}
            >
              <span className="loan-dock__ico" aria-hidden>
                <AppIcon name="arrow-left" size={22} />
              </span>
              <span className="loan-dock__lab">Quay lại</span>
            </button>
            <button
              type="button"
              className="loan-dock__btn loan-dock__btn--danger"
              onClick={() => {
                if (confirm('Cho vào thùng rác?')) {
                  softDeleteLoan(l.id)
                  showToast('Đã đưa vào thùng rác')
                  goBack()
                }
              }}
            >
              <span className="loan-dock__ico" aria-hidden>
                <AppIcon name="warning" size={22} />
              </span>
              <span className="loan-dock__lab">Thùng rác</span>
            </button>
          </>
        )}
      </nav>
    </div>
  )
}

export function LoansTrash({ privacy }: { privacy: boolean }) {
  const loans = useStore((s) => s.loans)
  const goBack = useStore((s) => s.goBack)
  const restoreLoan = useStore((s) => s.restoreLoan)
  const hardDeleteLoan = useStore((s) => s.hardDeleteLoan)
  const showToast = useStore((s) => s.showToast)
  const trash = loans
    .filter((l) => l.deletedAt)
    .slice()
    .sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''))

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => goBack()}>
          <AppIcon name="arrow-left" size={18} />
          Cho vay
        </button>
        <div className="mid">Thùng rác</div>
        <div className="nav-spacer" />
      </div>
      <p
        className="sheet-meta"
      >
        Khoản xóa nhầm có thể <b>Khôi phục</b>. Xóa vĩnh viễn thì mất hẳn.
      </p>
      {trash.length === 0 ? (
        <div className="empty">
          <h3>Thùng rác trống</h3>
        </div>
      ) : (
        <div className="loan-list">
          {trash.map((l) => (
            <div key={l.id} className="loan-card">
              <div className="loan-card-top">
                <div className="loan-avatar">
                  {l.borrower.slice(0, 1).toUpperCase()}
                </div>
                <div className="loan-card-mid">
                  <div className="loan-card-name">{l.borrower}</div>
                  <div className="loan-card-meta">
                    Xóa {l.deletedAt
                      ? new Date(l.deletedAt).toLocaleString('vi-VN')
                      : ''}
                  </div>
                </div>
                <div className="loan-card-amt">
                  <div className="num">
                    {mask(privacy, fmtVnd(l.remaining))}
                  </div>
                  <div className="unit">còn thu</div>
                </div>
              </div>
              <div className="btn-row mt-sm mb-0">
                <button
                  className="btn-primary btn-compact"
                  type="button"
                  onClick={() => {
                    restoreLoan(l.id)
                    showToast('Đã khôi phục')
                  }}
                >
                  Khôi phục
                </button>
                <button
                  className="btn-secondary btn-compact btn-danger"
                  type="button"
                  onClick={() => {
                    if (confirm('Xóa vĩnh viễn? Không hoàn tác được.')) {
                      hardDeleteLoan(l.id)
                      showToast('Đã xóa vĩnh viễn')
                    }
                  }}
                >
                  Xóa hẳn
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

