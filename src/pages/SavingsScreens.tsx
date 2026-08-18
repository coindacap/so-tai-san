import { useState } from 'react'
import { useStore } from '../store/useStore'
import {
  daysUntil,
  estimateInterest,
  estimateMaturityInterest,
  fmtNum,
  fmtVnd,
  nowIso,
  toDateInput,
  formatMoneyInput,
  moneyNum,
  parseRatePercent,
} from '../lib/format'
import type { SavingsAccount, SavingsEvent } from '../types'
import { MoneyInput } from '../components/MoneyInput'
import { AppIcon } from '../components/AppIcon'
import { mask } from '../lib/ui'

function savingsEventLabel(e: SavingsEvent): string {
  if (e.type === 'open') return 'Mở sổ'
  if (e.type === 'topup') return 'Gửi thêm'
  if (e.type === 'edit') return 'Sửa khoản'
  if (e.type === 'close') return 'Tất toán'
  return 'Sự kiện'
}

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
  const closed = savings
    .filter((s) => s.status === 'closed')
    .slice()
    .sort(
      (a, b) =>
        new Date(b.closedAt || b.updatedAt).getTime() -
        new Date(a.closedAt || a.updatedAt).getTime(),
    )
  const total = active.reduce((a, s) => a + s.principal, 0)
  const totalAccrued = active.reduce(
    (a, s) => a + estimateInterest(s.principal, s.rateAnnual, s.startDate),
    0,
  )
  const totalMaturity = active.reduce(
    (a, s) =>
      a +
      estimateMaturityInterest(
        s.principal,
        s.rateAnnual,
        s.startDate,
        s.maturityDate,
        s.termMonths,
      ),
    0,
  )
  const soon = active.filter((s) => {
    const d = daysUntil(s.maturityDate)
    return d != null && d >= 0 && d <= 30
  }).length

  return (
    <div className="scroll wb-page savings-page">
      <div className="large-title">
        <h1>Tiết kiệm</h1>
        <div className="sub">Sổ gửi ngân hàng đang mở</div>
      </div>

      <section className="wb-hero" aria-label="Tổng gốc đang gửi">
        <p className="wb-hero__label">Tổng gốc đang gửi</p>
        <p className="wb-hero__amount num">
          {mask(privacy, fmtVnd(total))}
        </p>
        <div className="wb-hero__stats">
          <div className="wb-hero__stat">
            <span className="wb-hero__stat-k">Số khoản</span>
            <span className="wb-hero__stat-v num">{active.length}</span>
          </div>
          <div className="wb-hero__stat">
            <span className="wb-hero__stat-k">Lãi tạm tính</span>
            <span className="wb-hero__stat-v num up">
              +{mask(privacy, fmtVnd(Math.round(totalAccrued)))}
            </span>
          </div>
          <div className="wb-hero__stat">
            <span className="wb-hero__stat-k">Lãi cuối kỳ</span>
            <span className="wb-hero__stat-v num up">
              +{mask(privacy, fmtVnd(Math.round(totalMaturity)))}
            </span>
          </div>
          <div className="wb-hero__stat">
            <span className="wb-hero__stat-k">Sắp đáo hạn</span>
            <span className="wb-hero__stat-v num">
              {soon > 0 ? `${soon} khoản` : 'Chưa có'}
            </span>
          </div>
        </div>
      </section>

      <button
        type="button"
        className="btn-primary"
        onClick={() => setScreen('savings-form')}
      >
        <AppIcon name="plus" size={18} />
        Gửi tiết kiệm mới
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

      {closed.length > 0 ? (
        <>
          <div className="sec">
            <h2>Đã tất toán</h2>
            <span className="sec-hint">{closed.length} khoản</span>
          </div>
          <div className="sav-list">
            {closed.map((s) => (
              <ClosedSavingsRow key={s.id} s={s} privacy={privacy} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

function ClosedSavingsRow({
  s,
  privacy,
}: {
  s: SavingsAccount
  privacy: boolean
}) {
  const setScreen = useStore((st) => st.setScreen)
  const closedAt = s.closedAt || s.updatedAt
  const got = s.closedAmountBack ?? 0
  const principal = s.closedPrincipal ?? 0
  return (
    <button
      type="button"
      className="sav-card sav-card-closed"
      onClick={() => setScreen('savings-detail', s.id)}
    >
      <div className="sav-card-top">
        <div className="sav-bank-badge">{s.bank.slice(0, 2).toUpperCase()}</div>
        <div className="sav-card-mid">
          <div className="sav-card-name">{s.name}</div>
          <div className="sav-card-meta">
            {s.bank}
            {' · '}
            Tất toán {new Date(closedAt).toLocaleDateString('vi-VN')}
          </div>
        </div>
        <div className="sav-card-amt">
          <div className="num">{mask(privacy, fmtVnd(got))}</div>
          <div className="unit">nhận về</div>
        </div>
      </div>
      <div className="sav-card-bottom">
        <div className="sav-interest">
          Gốc {mask(privacy, fmtVnd(principal))}
          {got > principal
            ? ` · lãi ~${mask(privacy, fmtVnd(got - principal))}`
            : ''}
        </div>
        <div className="sav-due">Xem lịch sử</div>
      </div>
    </button>
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
  const accrued = Math.round(
    estimateInterest(s.principal, s.rateAnnual, s.startDate),
  )
  const maturityInterest = Math.round(
    estimateMaturityInterest(
      s.principal,
      s.rateAnnual,
      s.startDate,
      s.maturityDate,
      s.termMonths,
    ),
  )
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
        </div>
      </div>

      <div className="sav-card-facts">
        <div className="sav-fact">
          <span className="sav-fact-k">Lãi tạm</span>
          <span className="sav-fact-v num up">
            +{mask(privacy, fmtVnd(accrued))}
          </span>
        </div>
        <div className="sav-fact">
          <span className="sav-fact-k">Cuối kỳ</span>
          <span className="sav-fact-v num up">
            {maturityInterest > 0
              ? `+${mask(privacy, fmtVnd(maturityInterest))}`
              : '—'}
          </span>
        </div>
        <div
          className={`sav-due ${overdue ? 'over' : urgent ? 'warn' : ''}`}
        >
          {due == null
            ? 'KKH'
            : overdue
              ? `Quá ${-due}n`
              : due === 0
                ? 'Hôm nay'
                : `Còn ${due}n`}
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

export function SavingsForm({ mode = 'create' }: { mode?: 'create' | 'edit' }) {
  const addSavings = useStore((s) => s.addSavings)
  const updateSavings = useStore((s) => s.updateSavings)
  const goBack = useStore((s) => s.goBack)
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const detailId = useStore((s) => s.detailAssetId)
  const existing = useStore((s) =>
    mode === 'edit' ? s.savings.find((x) => x.id === detailId) : undefined,
  )

  const [name, setName] = useState(
    existing?.name || 'Sổ tiết kiệm',
  )
  const [bank, setBank] = useState(existing?.bank || '')
  const [principal, setPrincipal] = useState(
    String(existing?.principal ?? 50_000_000),
  )
  const [rate, setRate] = useState(
    existing?.rateAnnual != null ? String(existing.rateAnnual) : '5.5',
  )
  const [start, setStart] = useState(
    toDateInput(existing?.startDate || nowIso()),
  )
  const [term, setTerm] = useState(
    existing?.termMonths != null ? String(existing.termMonths) : '6',
  )
  const [noTerm, setNoTerm] = useState(
    mode === 'edit'
      ? !existing?.maturityDate && !existing?.termMonths
      : false,
  )
  const [linkedCash, setLinkedCash] = useState(mode === 'create')
  const [note, setNote] = useState(existing?.note || '')
  const [err, setErr] = useState('')

  if (mode === 'edit' && !existing) {
    return (
      <div className="scroll plain">
        <button type="button" className="back" onClick={() => goBack()}>
          <AppIcon name="arrow-left" size={18} />
          Huỷ
        </button>
        <div className="empty">
          <h3>Không tìm thấy khoản</h3>
        </div>
      </div>
    )
  }

  const maturity = (() => {
    if (noTerm || !term) return null
    const d = new Date(start + 'T12:00:00')
    d.setMonth(d.getMonth() + (Number(term) || 0))
    return d.toISOString()
  })()

  const pNum = moneyNum(principal)
  const rateNum = parseRatePercent(rate)
  const startIso = start
    ? new Date(start + 'T12:00:00').toISOString()
    : nowIso()
  const termM = noTerm ? null : Number(term) || null
  const accruedPreview = Math.round(
    estimateInterest(pNum, rateNum, startIso),
  )
  const maturityPreview = Math.round(
    estimateMaturityInterest(
      pNum,
      rateNum,
      startIso,
      noTerm ? null : maturity,
      termM,
    ),
  )
  const endTotal = pNum + maturityPreview

  return (
    <div className="scroll plain">
      <div className="nav">
        <button
          type="button"
          className="back"
          onClick={() =>
            mode === 'edit' && existing
              ? setScreen('savings-detail', existing.id, { replace: true })
              : goBack()
          }
        >
          <AppIcon name="arrow-left" size={18} />
          Huỷ
        </button>
        <div className="mid">
          {mode === 'edit' ? 'Sửa tiết kiệm' : 'Gửi tiết kiệm'}
        </div>
        <div className="nav-spacer" />
      </div>

      <div className="card">
        <div className="field">
          <label>Tên khoản</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field-control"
          />
        </div>
        <div className="field">
          <label>Ngân hàng</label>
          <input
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            placeholder="VCB, ACB, MB…"
            className="field-control"
          />
        </div>
        <div className="field">
          <label>{mode === 'edit' ? 'Gốc hiện tại' : 'Số tiền gửi'}</label>
          <MoneyInput value={principal} onChange={setPrincipal} />
          {mode === 'edit' ? (
            <div className="hint">
              Sửa gốc chỉ cập nhật sổ — không tự trừ/cộng tiền mặt. Gửi thêm
              bằng tất toán / ghi tay nếu cần khớp cash.
            </div>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="sav-rate">Lãi suất %/năm</label>
          <MoneyInput
            inputId="sav-rate"
            value={rate}
            onChange={setRate}
            unit="%"
            decimal
            maxFraction={3}
            ariaLabel="Lãi suất phần trăm trên năm"
            placeholder="9,5"
            helperText="Gõ 9,5 hoặc 9.5 — bàn phím iPhone dùng dấu phẩy"
          />
          {rateNum > 25 ? (
            <div className="hint warn-hint">
              Lãi {fmtNum(rateNum, 2)}%/năm khá cao — kiểm tra lại (vd muốn 9,5
              chứ không phải 95).
            </div>
          ) : null}
        </div>
        <div className="field">
          <label>Ngày gửi</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="field-control-sm"
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
        {mode === 'create' ? (
          <label className="check-row">
            <input
              type="checkbox"
              checked={linkedCash}
              onChange={(e) => setLinkedCash(e.target.checked)}
            />
            <span>
              Trừ từ <b>tiền mặt VND</b> trong sổ (cần nạp VND trước). Bật rồi thì{' '}
              <b>không</b> rút tay thêm ở Nạp/Rút.
            </span>
          </label>
        ) : null}
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
          <span>Số tiền gửi</span>
          <span className="num">{fmtVnd(pNum)}</span>
        </div>
        <div className="r">
          <span>Lãi suất</span>
          <span className="num">{fmtNum(rateNum, 2)}%/năm</span>
        </div>
        <div className="r">
          <span>Lãi tạm tính (đến hôm nay)</span>
          <span className="num up">+{fmtVnd(accruedPreview)}</span>
        </div>
        <div className="r">
          <span>Lợi nhuận cuối kỳ</span>
          <span className="num up">
            {maturityPreview > 0 ? `+${fmtVnd(maturityPreview)}` : '—'}
          </span>
        </div>
        <div className="total">
          <span className="k">Nhận về cuối kỳ (gốc + lãi)</span>
          <span className="v num">
            {maturityPreview > 0 ? fmtVnd(endTotal) : fmtVnd(pNum)}
          </span>
        </div>
      </div>

      {err && <div className="error">{err}</div>}
      <button
        className="btn-primary"
        type="button"
        onClick={() => {
          if (!(pNum > 0)) {
            setErr('Số tiền gửi phải > 0')
            return
          }
          if (!(rateNum > 0)) {
            setErr('Nhập lãi suất %/năm (vd 9,5)')
            return
          }
          if (mode === 'edit' && existing) {
            const res = updateSavings(existing.id, {
              name,
              bank,
              principal: pNum,
              rateAnnual: rateNum,
              startDate: startIso,
              maturityDate: noTerm ? null : maturity,
              termMonths: termM,
              note: note || undefined,
            })
            if (!res.ok) {
              setErr(res.error)
              return
            }
            showToast('Đã cập nhật khoản tiết kiệm')
            setScreen('savings-detail', existing.id, { replace: true })
            return
          }
          const res = addSavings({
            name,
            bank,
            principal: pNum,
            rateAnnual: rateNum,
            startDate: startIso,
            maturityDate: noTerm ? null : maturity,
            termMonths: termM,
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
        {mode === 'edit' ? 'Lưu thay đổi' : 'Lưu khoản tiết kiệm'}
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
          <AppIcon name="arrow-left" size={18} />
          Tiết kiệm
        </button>
        <div className="empty">
          <h3>Không tìm thấy</h3>
        </div>
      </div>
    )
  }

  const history = Array.isArray(s.history) ? s.history : []
  const displayPrincipal =
    s.status === 'closed'
      ? s.closedPrincipal ?? s.principal
      : s.principal
  const accrued = Math.round(
    estimateInterest(
      s.status === 'closed' ? displayPrincipal : s.principal,
      s.rateAnnual,
      s.startDate,
      s.status === 'closed' ? s.closedAt || s.updatedAt : undefined,
    ),
  )
  const maturityInterest = Math.round(
    estimateMaturityInterest(
      s.status === 'closed' ? displayPrincipal : s.principal,
      s.rateAnnual,
      s.startDate,
      s.maturityDate,
      s.termMonths,
    ),
  )
  // Gợi ý tất toán: ưu tiên lãi tạm; nếu 0 ngày thì gợi ý cuối kỳ
  const interestForClose =
    accrued > 0 ? accrued : maturityInterest > 0 ? maturityInterest : 0
  const suggestClose = Math.round(s.principal + interestForClose)
  const closeDisplay = closeTouched ? closeAmt : String(suggestClose)
  const due = daysUntil(s.maturityDate)

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => setScreen('savings')}>
          <AppIcon name="arrow-left" size={18} />
          Tiết kiệm
        </button>
        <div className="mid">{s.name}</div>
        {s.status === 'active' ? (
          <button
            type="button"
            className="link-btn"
            onClick={() => setScreen('savings-edit', s.id)}
          >
            Sửa
          </button>
        ) : (
          <div className="nav-spacer" />
        )}
      </div>

      <div className="sav-detail-hero">
        <div className="pill sav-status-pill">
          {s.status === 'active' ? 'Đang gửi' : 'Đã tất toán'} · {s.bank}
        </div>
        <div className="k">
          {s.status === 'closed' ? 'Gốc (lúc tất toán)' : 'Gốc'}
        </div>
        <div className="big num">
          {mask(privacy, fmtVnd(displayPrincipal))}
        </div>
        {s.status === 'closed' && s.closedAmountBack != null ? (
          <p className="sav-maturity-hint">
            Nhận về:{' '}
            <b className="num">
              {mask(privacy, fmtVnd(s.closedAmountBack))}
            </b>
            {s.closedAt
              ? ` · ${new Date(s.closedAt).toLocaleString('vi-VN')}`
              : ''}
          </p>
        ) : null}
        <div className="sav-detail-row sav-detail-row--4">
          <div>
            <div className="k">Lãi suất</div>
            <div className="v num">{fmtNum(s.rateAnnual, 2)}%/năm</div>
          </div>
          <div>
            <div className="k">Lãi tạm tính</div>
            <div className="v num up">+{mask(privacy, fmtVnd(accrued))}</div>
          </div>
          <div>
            <div className="k">Lợi nhuận cuối kỳ</div>
            <div className="v num up">
              {maturityInterest > 0
                ? `+${mask(privacy, fmtVnd(maturityInterest))}`
                : '—'}
            </div>
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
        {maturityInterest > 0 ? (
          <p className="sav-maturity-hint">
            Cuối kỳ ≈ gốc + lãi:{' '}
            <b className="num">
              {mask(privacy, fmtVnd(s.principal + maturityInterest))}
            </b>
            {' · '}
            công thức lãi đơn: gốc × %/năm × số ngày / 365
          </p>
        ) : null}
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
            <div className="text-sm">{s.note}</div>
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
                <b>{fmtVnd(suggestClose)}</b>
              </div>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={linkCash}
                onChange={(e) => setLinkCash(e.target.checked)}
              />
              <span>
                Cộng vào tiền mặt VND trong sổ · không nạp tay thêm nếu đã bật
              </span>
            </label>
          </div>

          <div className="summary">
            <div className="r">
              <span>Gốc</span>
              <span className="num">{fmtVnd(s.principal)}</span>
            </div>
            <div className="r">
              <span>Lãi tạm tính (đến hôm nay)</span>
              <span className="num up">+{fmtVnd(accrued)}</span>
            </div>
            <div className="r">
              <span>Lợi nhuận cuối kỳ</span>
              <span className="num up">
                {maturityInterest > 0 ? `+${fmtVnd(maturityInterest)}` : '—'}
              </span>
            </div>
            <div className="total">
              <span className="k">Nhận về (nhập tay)</span>
              <span className="v num">
                {formatMoneyInput(closeDisplay) || '0'}
              </span>
            </div>
          </div>

          <button
            className="btn-primary"
            type="button"
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
              // Ở lại chi tiết để xem lịch sử tất toán
              setCloseTouched(false)
              setCloseAmt('')
            }}
          >
            Tất toán khoản này
          </button>
        </>
      )}

      <div className="sec">
        <h2>Lịch sử</h2>
      </div>
      <div className="group sav-history">
        {history.length === 0 ? (
          <div className="row row-muted cursor-default">
            Chưa có lịch sử. Mở sổ / sửa / tất toán sẽ hiện ở đây.
          </div>
        ) : (
          [...history].reverse().map((e) => (
            <div className="row cursor-default" key={e.id}>
              <div className="body">
                <div className="t">
                  {savingsEventLabel(e)}
                  {e.amount != null && e.amount > 0
                    ? ` · ${fmtVnd(e.amount)}`
                    : ''}
                </div>
                <div className="d">
                  {new Date(e.at).toLocaleString('vi-VN')}
                  {e.note ? ` · ${e.note}` : ''}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {err && <div className="error">{err}</div>}
      <button
        className="btn-secondary btn-danger"
        type="button"
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

