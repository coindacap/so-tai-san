import { useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { CloudSyncPanel } from '../components/CloudSync'

export function Settings() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const exportJson = useStore((s) => s.exportJson)
  const importJson = useStore((s) => s.importJson)
  const resetAll = useStore((s) => s.resetAll)
  const listSafetyBackups = useStore((s) => s.listSafetyBackups)
  const restoreSafetyBackup = useStore((s) => s.restoreSafetyBackup)
  const saveSafetyBackup = useStore((s) => s.saveSafetyBackup)
  const showToast = useStore((s) => s.showToast)
  const setScreen = useStore((s) => s.setScreen)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [importing, setImporting] = useState(false)
  const [safetyOpen, setSafetyOpen] = useState(false)
  const [safetyTick, setSafetyTick] = useState(0)
  const safetyList = useMemo(() => {
    void safetyTick
    return listSafetyBackups()
  }, [listSafetyBackups, safetyTick])

  function applyImport(text: string): boolean {
    const trimmed = text.trim()
    if (!trimmed) {
      showToast('Chưa có nội dung JSON')
      return false
    }
    // Debug nhẹ: độ dài text dán (iOS hay cắt dở)
    if (trimmed.length < 20) {
      showToast('Nội dung quá ngắn — copy lại TOÀN BỘ file JSON')
      return false
    }
    try {
      const res = importJson(trimmed)
      if (!res.ok) {
        showToast(res.error)
        return false
      }
      const s = useStore.getState()
      showToast(
        res.message ||
          `Import OK · TK ${s.savings.length} · Vay ${s.loans.length}`,
      )
      setPasteText('')
      setPasteOpen(false)
      // Nhảy thẳng dashboard
      useStore.setState({ screen: 'home' })
      return true
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Import lỗi')
      return false
    }
  }

  async function onPickFile(file: File | null | undefined) {
    if (!file) {
      showToast('Không chọn được file — thử Dán JSON')
      return
    }
    showToast(`Đang đọc: ${file.name}`)
    setImporting(true)
    try {
      let text = ''
      try {
        text = await file.text()
      } catch {
        text = await new Promise<string>((resolve, reject) => {
          const r = new FileReader()
          r.onload = () => resolve(String(r.result || ''))
          r.onerror = () => reject(new Error('Đọc file thất bại'))
          r.readAsText(file)
        })
      }
      applyImport(text)
    } catch {
      showToast('Không đọc được file. Mở Dán JSON bên dưới.')
      setPasteOpen(true)
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function doExport() {
    const raw = exportJson()
    const name = `so-tai-san-${new Date().toISOString().slice(0, 10)}.json`
    const blob = new Blob([raw], { type: 'application/json' })
    const file = new File([blob], name, { type: 'application/json' })

    // iOS Safari / PWA: Web Share API (file) là cách ổn nhất
    try {
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean
        share?: (data: ShareData) => Promise<void>
      }
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: 'Sổ Tài Sản backup' })
        showToast('Đã mở chia sẻ backup')
        return
      }
      if (nav.share) {
        await nav.share({ title: 'Sổ Tài Sản backup', text: raw })
        showToast('Đã mở chia sẻ (text)')
        return
      }
    } catch {
      // user cancel share — ignore
    }

    try {
      await navigator.clipboard.writeText(raw)
      showToast('Đã copy JSON vào clipboard')
      return
    } catch {
      /* fallthrough */
    }

    // Desktop fallback
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    showToast('Đã tải / mở file backup')
  }

  return (
    <div className="scroll">
      <div className="large-title" style={{ paddingTop: 8 }}>
        <h1>Cài đặt</h1>
        <div className="sub">Tùy chọn & dữ liệu</div>
      </div>

      <div className="sec" style={{ marginTop: 4 }}>
        <h2>Hiển thị</h2>
      </div>
      <div className="card">
        <div className="switch-row">
          <div>
            <div style={{ fontWeight: 650 }}>Ẩn số</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Che số trên dashboard
            </div>
          </div>
          <button
            className="btn-secondary"
            style={{ width: 'auto', margin: 0, padding: '8px 14px', fontSize: 14 }}
            onClick={() =>
              updateSettings({ privacyMode: !settings.privacyMode })
            }
          >
            {settings.privacyMode ? 'Đang bật' : 'Tắt'}
          </button>
        </div>
        <div className="switch-row">
          <div>
            <div style={{ fontWeight: 650 }}>Giá vốn</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Phương pháp tính
            </div>
          </div>
          <span style={{ fontWeight: 700 }}>AVG</span>
        </div>
        <div className="switch-row">
          <div>
            <div style={{ fontWeight: 650 }}>Coin mua bằng USDT</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              VND → USDT → Coin
            </div>
          </div>
          <span style={{ fontWeight: 700, color: 'var(--green-ink)' }}>Bật</span>
        </div>
        <div className="switch-row">
          <div>
            <div style={{ fontWeight: 650 }}>Auto giá vàng</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Ước XAU → đ/chỉ (mặc định tắt, giữ giá tiệm)
            </div>
          </div>
          <button
            className="btn-secondary"
            style={{ width: 'auto', margin: 0, padding: '8px 14px', fontSize: 14 }}
            onClick={() =>
              updateSettings({ autoGoldPrice: !settings.autoGoldPrice })
            }
          >
            {settings.autoGoldPrice ? 'Đang bật' : 'Tắt'}
          </button>
        </div>
      </div>

      <div className="sec">
        <h2>Cloud · đồng bộ máy</h2>
      </div>
      <CloudSyncPanel />

      <div className="sec">
        <h2>Sao lưu & khôi phục</h2>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json,text/plain,text/*,*/*"
        className="file-input-hidden"
        onChange={(e) => {
          void onPickFile(e.target.files?.[0])
        }}
      />
      <div className="card">
        <button className="row" type="button" onClick={() => void doExport()}>
          <div className="body">
            <div className="t">Export backup</div>
            <div className="d">Chia sẻ / copy file JSON</div>
          </div>
          <span className="chev">›</span>
        </button>
        <label className="row file-label-row">
          <div className="body">
            <div className="t">
              {importing ? 'Đang import…' : 'Import từ file'}
            </div>
            <div className="d">Sổ Tài Sản hoặc QuanLyTaiChinh</div>
          </div>
          <span className="chev">›</span>
          <input
            type="file"
            accept=".json,application/json,text/plain,text/*,*/*"
            className="file-input-overlay"
            disabled={importing}
            onChange={(e) => {
              void onPickFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        <button
          className="row"
          type="button"
          onClick={() => setPasteOpen((v) => !v)}
        >
          <div className="body">
            <div className="t">Dán JSON</div>
            <div className="d">Copy file → dán vào đây</div>
          </div>
          <span className="chev">{pasteOpen ? '˄' : '›'}</span>
        </button>
        <button
          className="row"
          type="button"
          onClick={() => {
            const id = saveSafetyBackup('manual')
            setSafetyTick((n) => n + 1)
            showToast(
              id
                ? 'Đã chụp bản an toàn trên máy'
                : 'Sổ trống — không cần chụp',
            )
          }}
        >
          <div className="body">
            <div className="t">Chụp bản an toàn ngay</div>
            <div className="d">Giữ trên máy (tối đa 5 bản)</div>
          </div>
          <span className="chev">›</span>
        </button>
        <button
          className="row"
          type="button"
          onClick={() => {
            setSafetyOpen((v) => !v)
            setSafetyTick((n) => n + 1)
          }}
        >
          <div className="body">
            <div className="t">Sao lưu an toàn ({safetyList.length})</div>
            <div className="d">
              Tự chụp trước import / kéo cloud / xóa sổ
            </div>
          </div>
          <span className="chev">{safetyOpen ? '˄' : '›'}</span>
        </button>
      </div>

      {safetyOpen && (
        <div className="card" style={{ marginTop: 10 }}>
          {safetyList.length === 0 ? (
            <div style={{ padding: 14, color: 'var(--muted)', fontSize: 13 }}>
              Chưa có bản an toàn. Sẽ tự tạo khi import, kéo cloud hoặc xóa sổ.
            </div>
          ) : (
            safetyList.map((b) => (
              <div key={b.id} className="switch-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 650, fontSize: 14 }}>{b.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {new Date(b.createdAt).toLocaleString('vi-VN')}
                    {' · '}
                    {b.tx} GD · {b.savings} TK · {b.loans} vay
                  </div>
                </div>
                <button
                  className="btn-secondary"
                  type="button"
                  style={{
                    width: 'auto',
                    margin: 0,
                    padding: '8px 12px',
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                  onClick={() => {
                    if (
                      !confirm(
                        `Khôi phục bản ${b.label}?\nSổ hiện tại sẽ được chụp lại trước khi ghi đè.`,
                      )
                    ) {
                      return
                    }
                    const res = restoreSafetyBackup(b.id)
                    setSafetyTick((n) => n + 1)
                    if (!res.ok) {
                      showToast(res.error)
                      return
                    }
                    showToast(res.message)
                    setScreen('home')
                  }}
                >
                  Khôi phục
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {pasteOpen && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="field">
            <label>Nội dung JSON</label>
            <textarea
              className="paste-area"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Dán toàn bộ JSON backup…"
              rows={7}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <div style={{ padding: '0 14px 14px', display: 'grid', gap: 8 }}>
            <button
              className="btn-primary"
              type="button"
              disabled={importing || !pasteText.trim()}
              onClick={() => {
                setImporting(true)
                try {
                  applyImport(pasteText)
                } finally {
                  setImporting(false)
                }
              }}
            >
              {importing ? 'Đang import…' : 'Import'}
            </button>
            <button
              className="btn-secondary"
              type="button"
              style={{ margin: 0 }}
              onClick={async () => {
                try {
                  const t = await navigator.clipboard.readText()
                  if (!t) {
                    showToast('Clipboard trống')
                    return
                  }
                  setPasteText(t)
                  showToast('Đã dán từ clipboard')
                } catch {
                  showToast('Giữ để dán thủ công')
                }
              }}
            >
              Dán từ clipboard
            </button>
          </div>
        </div>
      )}

      <div className="sec">
        <h2>Điều hướng</h2>
      </div>
      <div className="card">
        <button className="row" type="button" onClick={() => setScreen('assets')}>
          <div className="body">
            <div className="t">Danh mục vàng / coin</div>
          </div>
          <span className="chev">›</span>
        </button>
        <button className="row" type="button" onClick={() => setScreen('history')}>
          <div className="body">
            <div className="t">Lịch sử giao dịch</div>
          </div>
          <span className="chev">›</span>
        </button>
        <button
          className="row"
          type="button"
          onClick={() => setScreen('prices')}
        >
          <div className="body">
            <div className="t">Cập nhật giá thị trường</div>
          </div>
          <span className="chev">›</span>
        </button>
      </div>

      <div className="sec">
        <h2>Nguy hiểm</h2>
      </div>
      <div className="card">
        <button
          className="row"
          type="button"
          onClick={() => {
            if (
              confirm(
                'Xoá toàn bộ dữ liệu trên máy này?\nSổ hiện tại sẽ được chụp vào Sao lưu an toàn (nếu còn data).',
              )
            ) {
              resetAll()
              setSafetyTick((n) => n + 1)
              showToast('Đã reset · xem Sao lưu an toàn để khôi phục')
            }
          }}
        >
          <div className="body">
            <div className="t" style={{ color: 'var(--down)' }}>
              Xoá toàn bộ dữ liệu
            </div>
            <div className="d">Có bản an toàn trên máy trước khi xóa</div>
          </div>
        </button>
      </div>
    </div>
  )
}

/* ========== TIẾT KIỆM ========== */


