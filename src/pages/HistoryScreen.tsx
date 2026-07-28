import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { fmtNum, fmtVnd } from '../lib/format'

export function History() {
  const transactions = useStore((s) => s.transactions)
  const assets = useStore((s) => s.assets)
  const deleteTransaction = useStore((s) => s.deleteTransaction)
  const updateTransactionNote = useStore((s) => s.updateTransactionNote)
  const findPairIds = useStore((s) => s.findPairIds)
  const showToast = useStore((s) => s.showToast)
  const byId = Object.fromEntries(assets.map((a) => [a.id, a]))

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [filter, setFilter] = useState<'all' | 'buy' | 'sell' | 'convert' | 'adjust'>(
    'all',
  )

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
        // chọn leg "chính" trong cặp
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
    if (filter === 'all') return out
    return out.filter((t) => t.kind === filter)
  }, [transactions, filter])

  const selected = selectedId
    ? transactions.find((t) => t.id === selectedId)
    : null
  const pairCount = selectedId ? findPairIds(selectedId).length : 0

  useEffect(() => {
    if (selected) setNoteDraft(selected.note || '')
  }, [selected])

  function kindLabel(t: (typeof transactions)[0]) {
    if (t.kind === 'adjust') return 'Điều chỉnh'
    if (t.kind === 'convert') return t.side === 'in' ? 'Đổi · nhận' : 'Đổi · chi'
    if (t.kind === 'buy') return t.side === 'in' ? 'Mua' : 'Chi (mua)'
    if (t.kind === 'sell') return t.side === 'out' ? 'Bán' : 'Nhận (bán)'
    return t.side === 'in' ? 'Nhận' : 'Chi'
  }

  return (
    <div className="scroll">
      <div className="large-title" style={{ paddingTop: 8 }}>
        <h1>Lịch sử</h1>
        <div className="sub">Bấm dòng để sửa ghi chú / xóa an toàn</div>
      </div>

      <div
        className="seg"
        style={{
          margin: '0 0 12px',
          gridTemplateColumns: 'repeat(5, 1fr)',
        }}
      >
        {(
          [
            ['all', 'Tất cả'],
            ['buy', 'Mua'],
            ['sell', 'Bán'],
            ['convert', 'Đổi'],
            ['adjust', 'Điều chỉnh'],
          ] as const
        ).map(([k, lab]) => (
          <button
            key={k}
            type="button"
            className={filter === k ? 'on' : ''}
            onClick={() => setFilter(k)}
            style={{ fontSize: 11, padding: '8px 4px' }}
          >
            {lab}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <h3>Chưa có giao dịch</h3>
          <p>Mọi lần mua nhẫn, đổi USDT, mua coin sẽ hiện ở đây.</p>
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
                    {kindLabel(t)} · {a?.symbol || '?'} · {fmtNum(t.qty, 6)}
                  </div>
                  <div className="d">
                    {new Date(t.tradedAt).toLocaleString('vi-VN')}
                    {t.venue ? ` · ${t.venue}` : ''}
                    {t.note ? ` · ${t.note}` : ''}
                  </div>
                </div>
                <div className="end">
                  <div className={`amt num ${t.side === 'out' ? 'down' : ''}`}>
                    {t.priceCurrency === 'VND'
                      ? fmtVnd(t.qty * t.pricePerUnit, true)
                      : `${fmtNum(t.counterQty || t.qty * t.pricePerUnit, 2)} U`}
                  </div>
                </div>
                <span className="chev">›</span>
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
              {kindLabel(selected)} · {byId[selected.assetId]?.symbol || '?'}
            </h3>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              {new Date(selected.tradedAt).toLocaleString('vi-VN')}
              {selected.venue ? ` · ${selected.venue}` : ''}
              {pairCount > 1 ? ` · ${pairCount} leg (xóa cả cặp)` : ''}
            </div>
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="switch-row">
                <span>Số lượng</span>
                <span className="num" style={{ fontWeight: 700 }}>
                  {fmtNum(selected.qty, 6)} {byId[selected.assetId]?.unit}
                </span>
              </div>
              <div className="switch-row">
                <span>Giá / đơn vị</span>
                <span className="num" style={{ fontWeight: 700 }}>
                  {selected.priceCurrency === 'VND'
                    ? `${fmtVnd(selected.pricePerUnit)} đ`
                    : `${fmtNum(selected.pricePerUnit, 4)} USDT`}
                </span>
              </div>
              {selected.counterQty > 0 && (
                <div className="switch-row">
                  <span>Đối ứng</span>
                  <span className="num" style={{ fontWeight: 700 }}>
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
                style={{ fontSize: 16, fontWeight: 600 }}
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
              className="btn-secondary"
              type="button"
              style={{
                marginTop: 8,
                color: 'var(--down)',
                borderColor: 'rgba(255,59,48,0.35)',
              }}
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
    </div>
  )
}


