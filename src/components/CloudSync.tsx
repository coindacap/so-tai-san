import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import {
  cloudReady,
  getCloudUser,
  markCloudDirty,
  onPasswordRecovery,
  pullSnapshot,
  pushSnapshot,
  readCloudMeta,
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
  updatePassword,
  writeCloudMeta,
  notifyCloudAuthChanged,
  type CloudUser,
} from '../lib/cloudSync'

function hasLocalData(): boolean {
  const s = useStore.getState()
  return (
    s.settings.hasOnboarded ||
    s.transactions.length > 0 ||
    s.savings.length > 0 ||
    s.loans.length > 0
  )
}

function ts(iso: string | null | undefined): number {
  if (!iso) return 0
  const n = Date.parse(iso)
  return Number.isFinite(n) ? n : 0
}

/**
 * Đồng bộ local ↔ Supabase.
 * - Local-first: luôn giữ localStorage
 * - Last-write-wins theo updated_at
 */
export function useCloudAutoSync(enabled: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pushing = useRef(false)

  const doPush = useCallback(async () => {
    if (!enabled || !cloudReady() || pushing.current) return
    const user = await getCloudUser()
    if (!user) return
    const meta = readCloudMeta()
    if (!meta.dirty && meta.lastSyncedAt) return

    pushing.current = true
    try {
      const snap = useStore.getState().getCloudSnapshot()
      const res = await pushSnapshot(snap)
      if (res.ok) {
        writeCloudMeta({
          dirty: false,
          lastSyncedAt: res.updatedAt,
          lastRemoteUpdatedAt: res.updatedAt,
        })
      }
    } finally {
      pushing.current = false
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    // Đánh dirty khi store đổi (persist data)
    const unsub = useStore.subscribe((state, prev) => {
      if (
        state.assets !== prev.assets ||
        state.transactions !== prev.transactions ||
        state.quotes !== prev.quotes ||
        state.settings !== prev.settings ||
        state.savings !== prev.savings ||
        state.loans !== prev.loans
      ) {
        markCloudDirty()
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => {
          void doPush()
        }, 2500)
      }
    })
    return () => {
      unsub()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [enabled, doPush])

  // Push khi app quay lại foreground
  useEffect(() => {
    if (!enabled) return
    const onVis = () => {
      if (document.visibilityState === 'visible') void doPush()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [enabled, doPush])
}

/** Màn đặt MK mới khi mở link từ email quên mật khẩu */
export function PasswordRecoveryGate() {
  const showToast = useStore((s) => s.showToast)
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    return onPasswordRecovery(() => setOpen(true))
  }, [])

  if (!open) return null

  return (
    <div
      className="sheet-bg"
      style={{ zIndex: 80 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="sheet"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grab" />
        <h3>Đặt mật khẩu mới</h3>
        <p
          style={{
            fontSize: 13,
            color: 'var(--muted)',
            margin: '0 0 12px',
            lineHeight: 1.4,
          }}
        >
          Bạn vừa mở link đặt lại mật khẩu từ email. Nhập mật khẩu cloud mới
          (tối thiểu 6 ký tự).
        </p>
        <div className="field">
          <label>Mật khẩu mới</label>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
            style={{ fontSize: 17, fontWeight: 600 }}
          />
        </div>
        <div className="field">
          <label>Nhập lại</label>
          <input
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            autoComplete="new-password"
            style={{ fontSize: 17, fontWeight: 600 }}
          />
        </div>
        {err && <div className="error">{err}</div>}
        <button
          className="btn-primary"
          type="button"
          disabled={busy}
          onClick={() => {
            void (async () => {
              if (pw !== pw2) {
                setErr('Hai mật khẩu không khớp')
                return
              }
              setBusy(true)
              setErr('')
              try {
                const res = await updatePassword(pw)
                if (!res.ok) {
                  setErr(res.error)
                  return
                }
                // Xóa hash recovery trên URL
                if (window.location.hash) {
                  history.replaceState(
                    null,
                    '',
                    window.location.pathname + window.location.search,
                  )
                }
                showToast('Đã đổi mật khẩu — đăng nhập bằng MK mới')
                notifyCloudAuthChanged()
                setOpen(false)
                setPw('')
                setPw2('')
              } finally {
                setBusy(false)
              }
            })()
          }}
        >
          {busy ? 'Đang lưu…' : 'Lưu mật khẩu mới'}
        </button>
        <button
          className="sheet-cancel"
          type="button"
          onClick={() => setOpen(false)}
        >
          Đóng
        </button>
      </div>
    </div>
  )
}

export function CloudSyncPanel() {
  const showToast = useStore((s) => s.showToast)
  const applyCloudSnapshot = useStore((s) => s.applyCloudSnapshot)
  const getCloudSnapshot = useStore((s) => s.getCloudSnapshot)

  const ready = cloudReady()
  const [user, setUser] = useState<CloudUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [changePwOpen, setChangePwOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [metaTick, setMetaTick] = useState(0)

  const refreshUser = useCallback(async () => {
    if (!ready) {
      setUser(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const u = await getCloudUser()
      setUser(u)
    } finally {
      setLoading(false)
    }
  }, [ready])

  useEffect(() => {
    void refreshUser()
  }, [refreshUser])

  const meta = readCloudMeta()
  // re-read when metaTick changes
  void metaTick

  async function afterAuth(u: CloudUser) {
    setUser(u)
    notifyCloudAuthChanged()
    // Đồng bộ ngay sau đăng nhập
    setBusy(true)
    try {
      const pull = await pullSnapshot()
      if (!pull.ok) {
        showToast(pull.error)
        return
      }
      const local = hasLocalData()
      const remote = pull.remote

      if (!remote) {
        // Cloud trống → đẩy local
        if (local) {
          const res = await pushSnapshot(getCloudSnapshot())
          if (res.ok) {
            writeCloudMeta({
              dirty: false,
              lastSyncedAt: res.updatedAt,
              lastRemoteUpdatedAt: res.updatedAt,
            })
            showToast('Đã tải sổ lên cloud lần đầu')
          } else showToast(res.error)
        } else {
          showToast('Đăng nhập OK · cloud trống — ghi sổ rồi sẽ tự đồng bộ')
        }
        return
      }

      if (!local) {
        applyCloudSnapshot(remote.data)
        writeCloudMeta({
          dirty: false,
          lastSyncedAt: remote.updated_at,
          lastRemoteUpdatedAt: remote.updated_at,
        })
        showToast('Đã tải sổ từ cloud')
        return
      }

      // Cả hai có data: last-write-wins
      const remoteT = ts(remote.updated_at)
      const localT = ts(meta.lastSyncedAt) || ts(remote.data.savedAt)
      // Nếu remote mới hơn lần sync gần nhất → lấy remote
      // Nếu local dirty hoặc local mới hơn → push
      const dirty = readCloudMeta().dirty
      if (remoteT > localT && !dirty) {
        applyCloudSnapshot(remote.data)
        writeCloudMeta({
          dirty: false,
          lastSyncedAt: remote.updated_at,
          lastRemoteUpdatedAt: remote.updated_at,
        })
        showToast('Đã cập nhật sổ từ cloud (máy khác mới hơn)')
      } else {
        const res = await pushSnapshot(getCloudSnapshot())
        if (res.ok) {
          writeCloudMeta({
            dirty: false,
            lastSyncedAt: res.updatedAt,
            lastRemoteUpdatedAt: res.updatedAt,
          })
          showToast(
            remoteT > localT
              ? 'Đã ghi đè cloud bằng sổ trên máy này'
              : 'Đã đồng bộ sổ lên cloud',
          )
        } else showToast(res.error)
      }
    } finally {
      setBusy(false)
      setMetaTick((n) => n + 1)
    }
  }

  async function onAuth() {
    const e = email.trim()
    if (mode === 'forgot') {
      if (!e) {
        setStatus('Nhập email đã đăng ký cloud')
        return
      }
      setBusy(true)
      setStatus('')
      try {
        const res = await requestPasswordReset(e)
        if (!res.ok) {
          setStatus(res.error)
          return
        }
        setStatus(
          'Đã gửi email đặt lại MK. Kiểm tra hộp thư (và Spam) → bấm link → nhập MK mới. Link dùng được vài phút.',
        )
      } finally {
        setBusy(false)
      }
      return
    }
    if (!e || !password) {
      setStatus('Nhập email và mật khẩu')
      return
    }
    // Huong90@ = 8 ký tự — nếu thấy "6 ký tự" trước đây là map lỗi sai, đã sửa
    if (password.length < 6) {
      setStatus(`Mật khẩu đang ${password.length} ký tự — cần tối thiểu 6`)
      return
    }
    setBusy(true)
    setStatus('')
    try {
      if (mode === 'login') {
        const res = await signIn(e, password)
        if (!res.ok) {
          setStatus(res.error)
          return
        }
        await afterAuth(res.user)
      } else {
        const res = await signUp(e, password)
        if (!res.ok) {
          setStatus(res.error)
          return
        }
        if (res.needsConfirm) {
          setStatus(
            'Đã tạo tài khoản. Nếu không đăng nhập được: Supabase → Auth → Email → tắt Confirm email, rồi đăng nhập lại.',
          )
          setMode('login')
          return
        }
        await afterAuth(res.user)
      }
    } finally {
      setBusy(false)
    }
  }

  async function onChangePassword() {
    if (newPw !== newPw2) {
      showToast('Hai mật khẩu không khớp')
      return
    }
    setBusy(true)
    try {
      const res = await updatePassword(newPw)
      if (!res.ok) {
        showToast(res.error)
        return
      }
      showToast('Đã đổi mật khẩu cloud')
      setNewPw('')
      setNewPw2('')
      setChangePwOpen(false)
    } finally {
      setBusy(false)
    }
  }

  async function onPull() {
    setBusy(true)
    try {
      const pull = await pullSnapshot()
      if (!pull.ok) {
        showToast(pull.error)
        return
      }
      if (!pull.remote) {
        showToast('Cloud chưa có dữ liệu — bấm Đẩy lên cloud')
        return
      }
      if (
        hasLocalData() &&
        !window.confirm(
          'Tải từ cloud sẽ ghi đè sổ trên máy này. Tiếp tục?',
        )
      ) {
        return
      }
      applyCloudSnapshot(pull.remote.data)
      writeCloudMeta({
        dirty: false,
        lastSyncedAt: pull.remote.updated_at,
        lastRemoteUpdatedAt: pull.remote.updated_at,
      })
      setMetaTick((n) => n + 1)
      showToast('Đã tải sổ từ cloud')
    } finally {
      setBusy(false)
    }
  }

  async function onPush() {
    setBusy(true)
    try {
      const res = await pushSnapshot(getCloudSnapshot())
      if (!res.ok) {
        showToast(res.error)
        return
      }
      writeCloudMeta({
        dirty: false,
        lastSyncedAt: res.updatedAt,
        lastRemoteUpdatedAt: res.updatedAt,
      })
      setMetaTick((n) => n + 1)
      showToast('Đã đẩy sổ lên cloud')
    } finally {
      setBusy(false)
    }
  }

  async function onLogout() {
    setBusy(true)
    try {
      await signOut()
      setUser(null)
      notifyCloudAuthChanged()
      showToast('Đã đăng xuất cloud (sổ trên máy vẫn giữ)')
    } finally {
      setBusy(false)
    }
  }

  if (!ready) {
    return (
      <div className="card">
        <div style={{ padding: 14, fontSize: 14, lineHeight: 1.45 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Cloud chưa cấu hình</div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            Cần tạo project Supabase (miễn phí) và thêm biến môi trường:
            <br />
            <code style={{ fontSize: 12 }}>VITE_SUPABASE_URL</code>
            <br />
            <code style={{ fontSize: 12 }}>VITE_SUPABASE_ANON_KEY</code>
            <br />
            Rồi chạy SQL trong <code>supabase/schema.sql</code>. Xem README.
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="card">
        <div style={{ padding: 14, color: 'var(--muted)', fontWeight: 600 }}>
          Đang kiểm tra cloud…
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="card">
        <div
          className="seg"
          style={{ margin: '12px 12px 0', gridTemplateColumns: '1fr 1fr 1fr' }}
        >
          <button
            type="button"
            className={mode === 'login' ? 'on' : ''}
            onClick={() => {
              setMode('login')
              setStatus('')
            }}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'on' : ''}
            onClick={() => {
              setMode('register')
              setStatus('')
            }}
          >
            Tạo TK
          </button>
          <button
            type="button"
            className={mode === 'forgot' ? 'on' : ''}
            onClick={() => {
              setMode('forgot')
              setStatus('')
            }}
          >
            Quên MK
          </button>
        </div>
        <div className="field" style={{ padding: '0 14px' }}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ban@email.com"
            autoComplete="email"
            style={{ fontSize: 17, fontWeight: 600 }}
          />
        </div>
        {mode !== 'forgot' && (
          <div className="field" style={{ padding: '0 14px' }}>
            <label>Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              style={{ fontSize: 17, fontWeight: 600 }}
            />
            <div className="hint">
              Dùng 1 email cho mọi máy (iPhone + Mac) → cùng một sổ.
            </div>
          </div>
        )}
        {mode === 'forgot' && (
          <div className="field" style={{ padding: '0 14px' }}>
            <div className="hint">
              Nhập email cloud → nhận link đặt MK mới. Kiểm tra cả mục Spam.
              Sổ trên máy/local không bị xóa.
            </div>
          </div>
        )}
        {status && (
          <div
            className={status.startsWith('Đã gửi') ? 'hint' : 'error'}
            style={{
              margin: '0 14px 8px',
              padding: status.startsWith('Đã gửi') ? '10px 12px' : undefined,
              background: status.startsWith('Đã gửi')
                ? 'rgba(52, 199, 89, 0.12)'
                : undefined,
              borderRadius: 10,
              color: status.startsWith('Đã gửi')
                ? 'var(--green-ink)'
                : undefined,
              fontWeight: 600,
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            {status}
          </div>
        )}
        <div style={{ padding: '0 14px 14px' }}>
          <button
            className="btn-primary"
            type="button"
            disabled={busy}
            onClick={() => void onAuth()}
          >
            {busy
              ? 'Đang xử lý…'
              : mode === 'login'
                ? 'Đăng nhập cloud'
                : mode === 'register'
                  ? 'Tạo tài khoản cloud'
                  : 'Gửi email đặt lại MK'}
          </button>
        </div>
      </div>
    )
  }

  const last = meta.lastSyncedAt
    ? new Date(meta.lastSyncedAt).toLocaleString('vi-VN')
    : 'Chưa đồng bộ'

  return (
    <div className="card">
      <div className="switch-row">
        <div>
          <div style={{ fontWeight: 650 }}>Đã đăng nhập</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {user.email || user.id.slice(0, 8)}
          </div>
        </div>
        <span
          style={{
            fontWeight: 700,
            color: meta.dirty ? 'var(--orange, #c60)' : 'var(--green-ink)',
            fontSize: 13,
          }}
        >
          {meta.dirty ? 'Chờ đẩy…' : 'Đã sync'}
        </span>
      </div>
      <div className="switch-row">
        <div>
          <div style={{ fontWeight: 650 }}>Lần sync gần nhất</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{last}</div>
        </div>
      </div>
      <div style={{ padding: '8px 14px 14px', display: 'grid', gap: 8 }}>
        <button
          className="btn-primary"
          type="button"
          disabled={busy}
          onClick={() => void onPush()}
        >
          {busy ? 'Đang…' : 'Đẩy lên cloud ngay'}
        </button>
        <button
          className="btn-secondary"
          type="button"
          style={{ margin: 0 }}
          disabled={busy}
          onClick={() => void onPull()}
        >
          Tải từ cloud (ghi đè máy này)
        </button>
        <button
          className="btn-secondary"
          type="button"
          style={{ margin: 0 }}
          disabled={busy}
          onClick={() => setChangePwOpen((v) => !v)}
        >
          {changePwOpen ? 'Huỷ đổi MK' : 'Đổi mật khẩu cloud'}
        </button>
        {changePwOpen && (
          <div
            style={{
              display: 'grid',
              gap: 8,
              padding: 12,
              background: 'var(--bg, #f2f2f7)',
              borderRadius: 12,
            }}
          >
            <div className="field" style={{ margin: 0 }}>
              <label>Mật khẩu mới</label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                autoComplete="new-password"
                style={{ fontSize: 16, fontWeight: 600 }}
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Nhập lại MK mới</label>
              <input
                type="password"
                value={newPw2}
                onChange={(e) => setNewPw2(e.target.value)}
                autoComplete="new-password"
                style={{ fontSize: 16, fontWeight: 600 }}
              />
            </div>
            <button
              className="btn-primary"
              type="button"
              disabled={busy || !newPw}
              onClick={() => void onChangePassword()}
            >
              Lưu mật khẩu mới
            </button>
          </div>
        )}
        <button
          className="btn-secondary"
          type="button"
          style={{ margin: 0 }}
          disabled={busy}
          onClick={() => void onLogout()}
        >
          Đăng xuất cloud
        </button>
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
          Sửa sổ trên máy → tự đẩy cloud sau ~2,5 giây. Đăng xuất không xóa
          sổ local. Quên MK khi đã logout: tab <b>Quên MK</b> → email.
        </div>
      </div>
    </div>
  )
}
