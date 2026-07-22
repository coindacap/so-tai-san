import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import {
  cloudReady,
  getCloudUser,
  markCloudDirty,
  onPasswordRecovery,
  readCloudMeta,
  reconcileCloud,
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
  updatePassword,
  notifyCloudAuthChanged,
  type CloudUser,
} from '../lib/cloudSync'

/**
 * Đồng bộ 2 chiều Mac ↔ iPhone.
 * - Mở app / quay lại app: kéo cloud nếu máy kia mới hơn
 * - Sửa sổ: đẩy lên (không đẩy sổ trống đè sổ đầy)
 */
export function useCloudAutoSync(enabled: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busy = useRef(false)

  const runReconcile = useCallback(
    async (mode: 'auto' | 'login' = 'auto') => {
      if (!enabled || !cloudReady() || busy.current) return
      const user = await getCloudUser()
      if (!user) return
      busy.current = true
      try {
        await reconcileCloud({
          mode,
          getLocal: () => useStore.getState().getCloudSnapshot(),
          applyRemote: (data) => useStore.getState().applyCloudSnapshot(data),
        })
      } finally {
        busy.current = false
      }
    },
    [enabled],
  )

  // Lần đầu bật sync + mỗi 45s poll nhẹ (kéo nếu máy kia sửa)
  useEffect(() => {
    if (!enabled) return
    void runReconcile('auto')
    const id = setInterval(() => void runReconcile('auto'), 45_000)
    return () => clearInterval(id)
  }, [enabled, runReconcile])

  useEffect(() => {
    if (!enabled) return
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
          void runReconcile('auto')
        }, 2500)
      }
    })
    return () => {
      unsub()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [enabled, runReconcile])

  // Quay lại app (iPhone mở lại) → kéo + đẩy
  useEffect(() => {
    if (!enabled) return
    const onVis = () => {
      if (document.visibilityState === 'visible') void runReconcile('auto')
    }
    const onFocus = () => void runReconcile('auto')
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled, runReconcile])
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
    setBusy(true)
    try {
      const res = await reconcileCloud({
        mode: 'login',
        getLocal: () => getCloudSnapshot(),
        applyRemote: (data) => applyCloudSnapshot(data),
      })
      showToast(res.message)
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
    if (
      !window.confirm(
        'Tải từ cloud sẽ ghi đè sổ trên máy này bằng bản cloud. Tiếp tục?',
      )
    ) {
      return
    }
    setBusy(true)
    try {
      const res = await reconcileCloud({
        mode: 'manual-pull',
        getLocal: () => getCloudSnapshot(),
        applyRemote: (data) => applyCloudSnapshot(data),
      })
      setMetaTick((n) => n + 1)
      showToast(res.message)
    } finally {
      setBusy(false)
    }
  }

  async function onPush() {
    setBusy(true)
    try {
      const res = await reconcileCloud({
        mode: 'manual-push',
        getLocal: () => getCloudSnapshot(),
        applyRemote: (data) => applyCloudSnapshot(data),
      })
      setMetaTick((n) => n + 1)
      showToast(res.message)
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
          <b>Mac + iPhone cùng email:</b> mở app / sửa sổ sẽ tự kéo·đẩy cloud.
          Máy trống không còn đè sổ đầy. Nút “Tải từ cloud” nếu cần kéo tay.
          Đăng xuất không xóa sổ local.
        </div>
      </div>
    </div>
  )
}
