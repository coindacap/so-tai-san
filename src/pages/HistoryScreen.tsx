import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { AppIcon } from '../components/AppIcon'
import { fmtNum, fmtSignedUsdt, fmtVnd } from '../lib/format'
import {
  kindLabel,
  matchesHistoryFilter,
  type HistoryFilter,
} from '../lib/txLabels'

export function History() {
  const transactions = useStore((s) => s.transactions)
  const assets = useStore((s) => s.assets)
  const expenses = useStore((s) => s.expenses)
  const deleteTransaction = useStore((s) => s.deleteTransaction)
  const updateTransactionNote = useStore((s) => s.updateTransactionNote)
  const findPairIds = useStore((s) => s.findPairIds)
  const showToast = useStore((s) => s.showToast)
  const goBack = useStore((s) => s.goBack)
  const byId = Object.fromEntries(assets.map((a) => [a.id, a]))
  const labelCtx = useMemo(
    () => ({ assets, expenses }),
    [assets, expenses],
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [filter, setFilter] = useState<HistoryFilter>('all')

  // de-dupe pair: 1 dòng / cặp — ưu tiên leg không phải VND
  const shown = useMemo(() => {
    const sorted = [...transactions].sort((a, b) => {
      const t = b.tradedAt.localeCompare(a.tradedAt)
      if (t !== 0) return t
      return b.createdAt.localeCompare(a.createdAt)
    })
    const seenPair = new Set<string>()
    const out: typeof sorted = []
    for (const t of sorted) {
      if (t.pairId) {
        if (seenPair.has(t.pairId)) continue
        const mates = sorted.filter((x) => x.pairId === t.pairId)
        const primary =
          mates.find((x) => x.assetId !== 'asset-vnd') ||
          mates.find((x) => x.side === 'in') ||
          mates[0]!
        seenPair.add(t.pairId)
        out.push(primary)
        continue
      }
      // cũ: ẩn leg VND của pair không có pairId
      if (t.assetId === 'asset-vnd' && t.kind !== 'adjust') {
        const hasMate = sorted.some(
          (x) =>
            x.id !== t.id &&
            x.tradedAt === t.tradedAt &&
            x.kind === t.kind &&
            x.assetId === t.counterAssetId,
        )
        if (hasMate) continue
      }
      out.push(t)
    }
    return out.filter((t) => matchesHistoryFilter(t, filter, labelCtx))
  }, [transactions, filter, labelCtx])

  const selected = selectedId
    ? transactions.find((t) => t.id === selectedId)
    : null
  const pairCount = selectedId ? findPairIds(selectedId).length : 0

  useEffect(() => {
    if (selected) setNoteDraft(selected.note || '')
  }, [selected])

  return (
    <div className="scroll">
      <div className="nav">
        <button type="button" className="back" onClick={() => goBack()}>
          <AppIcon name="arrow-left" size={18} />
          Tài sản
        </button>
        <div className="mid">Lịch sử</div>
        <div className="nav-spacer" />
      </div>
      <div className="large-title large-title-compact">
        <h1>Lịch sử tài sản</h1>
        <div className="sub">
          Mua · bán · đổi · nạp/rút · gắn tiền mặt. Chi tiêu chi tiết xem tab
          Chi tiêu.
        </div>
      </div>

      <div className="seg seg-wrap">
        {(
          [
            ['all', 'Tất cả'],
            ['buy', 'Mua'],
            ['sell', 'Bán'],
            ['convert', 'Đổi'],
            ['cash_flow', 'Tiền mặt'],
            ['adjust', 'Khác'],
          ] as const
        ).map(([k, lab]) => (
          <button
            key={k}
            type="button"
            className={filter === k ? 'on' : ''}
            onClick={() => setFilter(k)}
          >
            {lab}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <h3>Chưa có giao dịch</h3>
          <p>Mọi lần mua nhẫn, đổi USDT, mua coin, nạp/rút sẽ hiện ở đây.</p>
        </div>
      ) : (
        <div className="group">
          {shown.map((t) => {
            const a = byId[t.assetId]
            return (
              <button
                key={t.id}
                type="button"
                className="row"
                onClick={() => setSelectedId(t.id)}
              >
                <div className="body">
                  <div className="t">
                    {kindLabel(t, labelCtx)} · {a?.symbol || '?'} ·{' '}
                    {t.costBasisDeltaNative != null
                      ? fmtSignedUsdt(t.costBasisDeltaNative, 4)
                      : fmtNum(t.qty, 6)}
                  </div>
                  <div className="d">
                    {new Date(t.tradedAt).toLocaleString('vi-VN')}
                    {t.venue ? ` · ${t.venue}` : ''}
                    {t.note ? ` · ${t.note}` : ''}
                  </div>
                </div>
                <div className="end">
                  <div className={`amt num ${t.side === 'out' ? 'down' : ''}`}>
                    {t.costBasisDeltaNative != null
                      ? fmtSignedUsdt(t.costBasisDeltaNative, 4)
                      : t.priceCurrency === 'VND'
                        ? fmtVnd(t.qty * t.pricePerUnit, true)
                        : `${fmtNum(t.counterQty || t.qty * t.pricePerUnit, 2)} U`}
                  </div>
                </div>
                <span className="chev">
                  <AppIcon name="chevron-right" size={18} />
                </span>
              </button>
            )
          })}
        </div>
      )}

      {selected && (
        <div className="sheet-bg" onClick={() => setSelectedId(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            <h3>
              {kindLabel(selected, labelCtx)} ·{' '}
              {byId[selected.assetId]?.symbol || '?'}
            </h3>
            <div className="sheet-meta">
              {new Date(selected.tradedAt).toLocaleString('vi-VN')}
              {selected.venue ? ` · ${selected.venue}` : ''}
              {pairCount > 1 ? ` · ${pairCount} leg (xóa cả cặp)` : ''}
            </div>
            <div className="card mb-sm">
              {selected.costBasisDeltaNative != null ? (
                <div className="switch-row">
                  <span>Điều chỉnh tổng giá vốn</span>
                  <span className="num switch-value">
                    {fmtSignedUsdt(selected.costBasisDeltaNative, 4)}
                  </span>
                </div>
              ) : (
                <>
                  <div className="switch-row">
                    <span>Số lượng</span>
                    <span className="num switch-value">
                      {fmtNum(selected.qty, 6)}
                      {(() => {
                        const u = byId[selected.assetId]?.unit
                        return u && u !== 'VND' && u !== 'đ' ? ` ${u}` : ''
                      })()}
                    </span>
                  </div>
                  <div className="switch-row">
                    <span>Giá / đơn vị</span>
                    <span className="num switch-value">
                      {selected.priceCurrency === 'VND'
                        ? `${fmtVnd(selected.pricePerUnit)}`
                        : `${fmtNum(selected.pricePerUnit, 4)} USDT`}
                    </span>
                  </div>
                </>
              )}
              {selected.costBasisDeltaNative == null &&
                selected.counterQty > 0 && (
                  <div className="switch-row">
                    <span>Đối ứng</span>
                    <span className="num switch-value">
                      {fmtNum(selected.counterQty, 4)}{' '}
                      {byId[selected.counterAssetId]?.symbol || ''}
                    </span>
                  </div>
                )}
            </div>
            <div className="field">
              <label>Ghi chú</label>
              <input
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Tuỳ chọn"
                className="field-control-sm"
              />
            </div>
            <button
              className="btn-primary"
              type="button"
              onClick={() => {
                const res = updateTransactionNote(selected.id, noteDraft)
                if (!res.ok) {
                  showToast(res.error)
                  return
                }
                showToast('Đã lưu ghi chú')
                setSelectedId(null)
              }}
            >
              Lưu ghi chú
            </button>
            <button
              className="btn-secondary btn-danger mt-xs"
              type="button"
              onClick={() => {
                if (
                  !confirm(
                    pairCount > 1
                      ? `Xóa giao dịch này và ${pairCount - 1} leg cặp?\nHold/P/L sẽ tính lại. Bản an toàn sẽ được chụp.`
                      : 'Xóa giao dịch này? Hold/P/L sẽ tính lại. Bản an toàn sẽ được chụp.',
                  )
                ) {
                  return
                }
                const res = deleteTransaction(selected.id)
                if (!res.ok) {
                  showToast(res.error)
                  return
                }
                showToast(
                  res.removed > 1
                    ? `Đã xóa ${res.removed} leg (cặp an toàn)`
                    : 'Đã xóa giao dịch',
                )
                setSelectedId(null)
              }}
            >
              Xóa giao dịch{pairCount > 1 ? ` (${pairCount} leg)` : ''}
            </button>
            <button
              className="sheet-cancel"
              type="button"
              onClick={() => setSelectedId(null)}
            >
              Đóng
            </button>
          </div>
        </div>
      )}
      <div className="scroll-end-spacer" aria-hidden />
    </div>
  )
}
