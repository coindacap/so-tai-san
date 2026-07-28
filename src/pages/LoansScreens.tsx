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
    <div className="scroll">
      <div className="large-title" style={{ paddingTop: 8 }}>
        <h1>Cho vay</h1>
        <div className="sub">Khoản còn phải thu</div>
      </div>

      <div className="loan-hero">
        <div className="loan-hero-label">Tổng còn thu</div>
        <div className="loan-hero-total num">
          {mask(privacy, fmtVnd(total))}
          <small>đ</small>
        </div>
        <div className="loan-hero-grid">
          <div>
            <div className="k">Số khoản</div>
            <div className="v num">{open.length}</div>
          </div>
          <div>
            <div className="k">Đã thu (gốc)</div>
            <div className="v num">
              {mask(privacy, fmtVnd(Math.max(0, collected), true))}
            </div>
          </div>
          <div>
            <div className="k">Lãi tạm tính</div>
            <div className="v num">
              {mask(privacy, fmtVnd(accrued, true))}
            </div>
          </div>
        </div>
        {overdueN > 0 && (
          <div className="loan-due-banner over" style={{ marginTop: 12 }}>
            {overdueN} khoản đang trễ hạn
          </div>
        )}
      </div>

      <div className="btn-row" style={{ marginBottom: 14 }}>
        <button
          className="btn-primary"
          style={{ margin: 0 }}
          onClick={() => setScreen('loan-form')}
        >
          + Cho vay mới
        </button>
        <button
          className="btn-secondary"
          style={{ margin: 0 }}
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
  const initials = l.borrower
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 2) || 'V'
  const overdue = due != null && due < 0
  const urgent = due != null && due >= 0 && due <= 7

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
            {l.status === 'partial' ? 'Thu một phần' : 'Đang vay'}
            {' · '}
            {loanInterestLabel({
              rateAnnual: l.rateAnnual,
              interestType: l.interestType,
              interestValue: l.interestValue,
            })}
            {l.phone ? ` · ${l.phone}` : ''}
          </div>
        </div>
        <div className="loan-card-amt">
          <div className="num">{mask(privacy, fmtVnd(l.remaining))}</div>
          <div className="unit">còn thu</div>
        </div>
      </div>
      <div className="loan-card-bottom">
        <div className="loan-orig">
          Gốc {mask(privacy, fmtVnd(l.principal, true))}
          {paidPct > 0 ? ` · đã thu ${paidPct}%` : ''}
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
  // 3 kiểu lãi chính: %/tháng | đ/1tr/ngày | cố định/tháng
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
          ‹ Huỷ
        </button>
        <div className="mid">
          {mode === 'edit' ? 'Sửa khoản vay' : 'Cho vay mới'}
        </div>
        <div style={{ minWidth: 64 }} />
      </div>

      <div className="card">
        <div className="field">
          <label>Người vay *</label>
          <input
            value={borrower}
            onChange={(e) => setBorrower(e.target.value)}
            placeholder="Tên / biệt danh"
            style={{ fontSize: 17, fontWeight: 600 }}
          />
        </div>
        <div className="field">
          <label>SĐT (tuỳ chọn)</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            style={{ fontSize: 17, fontWeight: 600 }}
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
          <strong>đ / 1tr / ngày</strong>
          <span>vd 1k/1tr/ngày</span>
        </button>
        <button
          type="button"
          className={interestType === 'flat_monthly' ? 'on' : ''}
          onClick={() => pickType('flat_monthly')}
        >
          <strong>Cố định / tháng</strong>
          <span>vd 1.300.000đ</span>
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
              Gốc {fmtVnd(remNum || pNum)}đ → lãi khoảng{' '}
              <b>{fmtVnd(Math.round(previewMonth))}đ/tháng</b>
            </div>
          </div>
        )}
        {interestType === 'per_million_daily' && (
          <div className="field">
            <label>Lãi (đ / 1 triệu / ngày)</label>
            <MoneyInput
              value={interestVal}
              onChange={setInterestVal}
              unit="đ"
            />
            <div className="hint">
              Ví dụ <b>1.000</b> = 1k/1tr/ngày. Gốc{' '}
              {fmtVnd(remNum || pNum)}đ →{' '}
              <b>{fmtVnd(Math.round(previewDay))}đ/ngày</b>
              {' · '}
              <b>{fmtVnd(Math.round(previewMonth))}đ/tháng</b> (ước 30 ngày)
            </div>
          </div>
        )}
        {interestType === 'flat_monthly' && (
          <div className="field">
            <label>Lãi cố định mỗi tháng</label>
            <MoneyInput
              value={interestVal}
              onChange={setInterestVal}
              unit="đ/th"
            />
            <div className="hint">
              Ví dụ <b>1.300.000</b>đ/tháng — không phụ thuộc gốc. ≈{' '}
              <b>{fmtVnd(Math.round(previewDay))}đ/ngày</b>
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
            style={{ fontSize: 16, fontWeight: 600 }}
          />
        </div>
        <div className="field">
          <label>Hẹn trả (tuỳ chọn)</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            style={{ fontSize: 16, fontWeight: 600 }}
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
              Trừ từ <b>tiền mặt VND</b> trong sổ
            </span>
          </label>
        )}
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
          <span>{fmtVnd(Math.round(previewDay))} đ</span>
        </div>
        <div className="total">
          <span className="k">Ước / tháng</span>
          <span className="v num">{fmtVnd(Math.round(previewMonth))}đ</span>
        </div>
      </div>

      {err && <div className="error">{err}</div>}
      <button
        className="btn-primary"
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
          ‹ Cho vay
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

  return (
    <div className="scroll plain has-bottom-actions">
      <div className="nav">
        <button className="back" onClick={() => goBack()}>
          ‹ Cho vay
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

      <div className="loan-detail-hero">
        <div className="pill loan-status-pill">
          {l.status === 'written_off'
            ? 'Đã xóa nợ'
            : l.status === 'paid'
              ? 'Đã thu đủ gốc'
              : l.status === 'partial'
                ? 'Thu một phần'
                : 'Đang vay'}
        </div>
        <div className="k">Còn phải thu (gốc)</div>
        <div className="big num">
          {mask(privacy, fmtVnd(l.remaining))}
          <small>đ</small>
        </div>
        <div className="loan-detail-row">
          <div>
            <div className="k">Gốc</div>
            <div className="v num">{mask(privacy, fmtVnd(l.principal, true))}</div>
          </div>
          <div>
            <div className="k">Đã thu gốc</div>
            <div className="v num">{mask(privacy, fmtVnd(paid, true))}</div>
          </div>
          <div>
            <div className="k">Đã thu lãi</div>
            <div className="v num">
              {mask(privacy, fmtVnd(interestPaid, true))}
            </div>
          </div>
        </div>

        <div className="loan-accrued-box">
          <div>
            <div className="k">Lãi tạm tính đến hôm nay</div>
            <div className="accrued num">
              {mask(privacy, fmtVnd(Math.round(accrued)))} đ
            </div>
          </div>
          <div className="accrued-hint">
            {loanInterestLabel({
              rateAnnual: l.rateAnnual,
              interestType: l.interestType,
              interestValue: l.interestValue,
            })}
            {' · '}
            ≈{' '}
            {fmtVnd(
              Math.round(
                calcLoanInterestPerDay({
                  remaining: l.remaining,
                  rateAnnual: l.rateAnnual,
                  interestType: l.interestType,
                  interestValue: l.interestValue,
                }),
              ),
            )}
            đ/ngày
            <br />
            {interestStartIsLend
              ? `Tính từ ngày vay ${fromLabel} → hôm nay (${interestInfo.days} ngày)`
              : `Sau lần đóng lãi ${fromLabel} → hôm nay (${interestInfo.days} ngày) · đã thu ${fmtVnd(interestPaid, true)}`}
          </div>
        </div>

        {l.principal > 0 && (
          <div className="loan-progress loan-progress-dark">
            <div
              className="loan-progress-bar"
              style={{ width: `${Math.min(100, paidPct)}%` }}
            />
          </div>
        )}
        <div className="loan-progress-label">Đã thu {paidPct}% gốc</div>
        {due != null && (
          <div
            className={`loan-due-banner ${due < 0 ? 'over' : due <= 7 ? 'warn' : ''}`}
          >
            {due < 0
              ? `Trễ hạn ${-due} ngày`
              : due === 0
                ? 'Hẹn trả hôm nay'
                : `Còn ${due} ngày đến hạn`}
          </div>
        )}
      </div>

      <div className="card">
        <div className="field">
          <label>Ngày cho vay</label>
          <div style={{ fontWeight: 650 }}>
            {new Date(l.lendDate).toLocaleDateString('vi-VN')}
          </div>
        </div>
        {l.dueDate && (
          <div className="field">
            <label>Hẹn trả</label>
            <div style={{ fontWeight: 650 }}>
              {new Date(l.dueDate).toLocaleDateString('vi-VN')}
            </div>
          </div>
        )}
        {l.phone && (
          <div className="field">
            <label>SĐT</label>
            <a
              href={`tel:${l.phone}`}
              style={{ color: 'var(--brand)', fontWeight: 650 }}
            >
              {l.phone}
            </a>
          </div>
        )}
        {l.note && (
          <div className="field">
            <label>Ghi chú</label>
            <div>{l.note}</div>
          </div>
        )}
      </div>

      {panel === 'principal' && active && (
        <div className="card action-panel">
          <div className="field">
            <label>Thu gốc (giảm còn thu)</label>
            <MoneyInput
              value={pay}
              onChange={setPay}
              placeholder={formatMoneyInput(l.remaining)}
            />
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={linkCash}
              onChange={(e) => setLinkCash(e.target.checked)}
            />
            <span>Cộng vào tiền mặt VND</span>
          </label>
          <div style={{ padding: '0 14px 14px', display: 'grid', gap: 8 }}>
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
              className="btn-secondary"
              type="button"
              style={{ margin: 0 }}
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
          </div>
        </div>
      )}

      {panel === 'interest' && (
        <div className="card action-panel">
          <div className="field">
            <label>Đóng lãi (không giảm gốc)</label>
            <MoneyInput
              value={pay}
              onChange={setPay}
              placeholder={formatMoneyInput(Math.round(accrued))}
            />
            <div className="hint">
              Gợi ý lãi tạm tính: <b>{fmtVnd(Math.round(accrued))} đ</b>
            </div>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={linkCash}
              onChange={(e) => setLinkCash(e.target.checked)}
            />
            <span>Cộng vào tiền mặt VND</span>
          </label>
          <div style={{ padding: '0 14px 14px', display: 'grid', gap: 8 }}>
            <button
              className="btn-primary"
              type="button"
              onClick={() => {
                const amt = moneyNum(pay) || Math.round(accrued)
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
              className="btn-secondary"
              type="button"
              style={{ margin: 0 }}
              onClick={() => {
                setPay(String(Math.round(accrued)))
              }}
            >
              Điền lãi tạm tính
            </button>
          </div>
        </div>
      )}

      {panel === 'more' && (
        <div className="card action-panel">
          <div className="field">
            <div className="hint" style={{ margin: 0, color: 'var(--ink-2)' }}>
              <b>Xóa nợ</b> = không thu được, giữ lịch sử, gốc còn = 0.
              <br />
              <b>Cho vào thùng rác</b> = ẩn khỏi list, có thể khôi phục.
            </div>
          </div>
          <div style={{ padding: '0 14px 14px', display: 'grid', gap: 8 }}>
            {active && (
              <button
                className="btn-secondary"
                type="button"
                style={{ margin: 0 }}
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
            )}
            <button
              className="btn-secondary"
              type="button"
              style={{ margin: 0, color: 'var(--down)' }}
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
              className="btn-secondary"
              type="button"
              style={{ margin: 0 }}
              onClick={() => setPanel('none')}
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {l.payments.length > 0 && (
        <>
          <div className="sec">
            <h2>Lịch sử thu</h2>
          </div>
          <div className="group">
            {[...l.payments].reverse().map((p) => (
              <div key={p.id} className="row" style={{ cursor: 'default' }}>
                <div className="body">
                  <div className="t">
                    {p.type === 'interest' ? 'Đóng lãi' : 'Thu gốc'}{' '}
                    {fmtVnd(p.amount)}đ
                  </div>
                  <div className="d">
                    {new Date(p.paidAt).toLocaleString('vi-VN')}
                    {p.note ? ` · ${p.note}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {err && <div className="error">{err}</div>}

      {/* Menu thao tác nhanh dưới đáy — fixed, kéo lên là hiện */}
      <div className="bottom-actions">
        {active ? (
          <>
            <button
              type="button"
              className={panel === 'principal' ? 'on' : ''}
              onClick={() => {
                setPanel(panel === 'principal' ? 'none' : 'principal')
                setPay('')
              }}
            >
              Thu gốc
            </button>
            <button
              type="button"
              className={panel === 'interest' ? 'on' : ''}
              onClick={() => {
                setPanel(panel === 'interest' ? 'none' : 'interest')
                setPay(String(Math.round(accrued) || ''))
              }}
            >
              Đóng lãi
            </button>
            <button
              type="button"
              onClick={() => setScreen('loan-edit', l.id)}
            >
              Sửa
            </button>
            <button
              type="button"
              className={panel === 'more' ? 'on' : ''}
              onClick={() => setPanel(panel === 'more' ? 'none' : 'more')}
            >
              Thêm
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => goBack()}>
              Quay lại
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm('Cho vào thùng rác?')) {
                  softDeleteLoan(l.id)
                  showToast('Đã đưa vào thùng rác')
                  goBack()
                }
              }}
            >
              Thùng rác
            </button>
          </>
        )}
      </div>
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
          ‹ Cho vay
        </button>
        <div className="mid">Thùng rác</div>
        <div style={{ minWidth: 64 }} />
      </div>
      <p
        style={{
          fontSize: 13,
          color: 'var(--muted)',
          marginBottom: 12,
          lineHeight: 1.45,
        }}
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
              <div className="btn-row" style={{ marginTop: 12, marginBottom: 0 }}>
                <button
                  className="btn-primary"
                  type="button"
                  style={{ margin: 0, padding: 12, fontSize: 14 }}
                  onClick={() => {
                    restoreLoan(l.id)
                    showToast('Đã khôi phục')
                  }}
                >
                  Khôi phục
                </button>
                <button
                  className="btn-secondary"
                  type="button"
                  style={{ margin: 0, padding: 12, fontSize: 14, color: 'var(--down)' }}
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

