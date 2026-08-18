import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useStore } from '../store/useStore'
import {
  cloudReady,
  getCloudUser,
  onPasswordRecovery,
  onCloudSignedIn,
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
import { AppIcon } from './AppIcon'
import { StatePanel } from './StatePanel'

type CloudStatus = {
  tone: 'loading' | 'error' | 'success'
  message: string
}

/** Màn đặt MK mới khi mở link từ email quên mật khẩu */
export function PasswordRecoveryGate() {
  const showToast = useStore((s) => s.showToast)
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    return onPasswordRecovery(() => setOpen(true))
  }, [])

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (!dialog) return
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal()
    } else {
      dialog.setAttribute('open', '')
    }
    dialog.querySelector<HTMLElement>('input, button')?.focus()
  }, [open])

  if (!open) return null

  const close = () => {
    dialogRef.current?.close?.()
    setOpen(false)
    setErr('')
  }

  const keepFocusInside = (event: ReactKeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        'input:not(:disabled), button:not(:disabled)',
      ),
    ]
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="sheet recovery-sheet"
      aria-modal="true"
      aria-labelledby="recovery-title"
      aria-describedby="recovery-description"
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      onKeyDown={keepFocusInside}
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div className="recovery-sheet__content">
        <div className="grab" />
        <h3 id="recovery-title">Đặt mật khẩu mới</h3>
        <p className="sheet-intro" id="recovery-description">
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
            autoFocus
            aria-invalid={!!err}
            aria-describedby={err ? 'recovery-error' : undefined}
          />
        </div>
        <div className="field">
          <label>Nhập lại</label>
          <input
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            autoComplete="new-password"
            aria-invalid={!!err}
            aria-describedby={err ? 'recovery-error' : undefined}
          />
        </div>
        {err && (
          <div className="error" id="recovery-error" role="alert">
            {err}
          </div>
        )}
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
                showToast('Đã đổi mật khẩu, đăng nhập bằng MK mới')
                notifyCloudAuthChanged()
                close()
                setPw('')
                setPw2('')
              } finally {
                setBusy(false)
              }
            })()
          }}
        >
          {busy ? (
            <>
              <AppIcon name="loader" size={18} className="spin" />
              Đang lưu…
            </>
          ) : (
            'Lưu mật khẩu mới'
          )}
        </button>
        <button
          className="sheet-cancel"
          type="button"
          onClick={close}
        >
          Đóng
        </button>
      </div>
    </dialog>
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
  const [status, setStatus] = useState<CloudStatus | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string
    password?: string
  }>({})
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

  useEffect(() => {
    if (user) return
    return onCloudSignedIn((u) => {
      void afterAuth(u)
    })
    // afterAuth đọc store mới nhất; chỉ gắn khi chưa login
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

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
    setFieldErrors({})
    if (mode === 'forgot') {
      if (!e) {
        const message = 'Nhập email đã đăng ký cloud'
        setFieldErrors({ email: message })
        setStatus({ tone: 'error', message })
        return
      }
      setBusy(true)
      setStatus({ tone: 'loading', message: 'Đang gửi email đặt lại mật khẩu…' })
      try {
        const res = await requestPasswordReset(e)
        if (!res.ok) {
          setStatus({ tone: 'error', message: res.error })
          return
        }
        setStatus({
          tone: 'success',
          message:
            'Đã gửi email đặt lại MK. Kiểm tra hộp thư và Spam để mở link đặt mật khẩu mới.',
        })
      } finally {
        setBusy(false)
      }
      return
    }
    if (!e || !password) {
      const message = 'Nhập email và mật khẩu'
      setFieldErrors({
        email: !e ? message : undefined,
        password: !password ? message : undefined,
      })
      setStatus({ tone: 'error', message })
      return
    }
    // Huong90@ = 8 ký tự — nếu thấy "6 ký tự" trước đây là map lỗi sai, đã sửa
    if (password.length < 6) {
      const message = `Mật khẩu đang ${password.length} ký tự, cần tối thiểu 6`
      setFieldErrors({ password: message })
      setStatus({ tone: 'error', message })
      return
    }
    setBusy(true)
    setStatus({ tone: 'loading', message: 'Đang xử lý tài khoản cloud…' })
    try {
      if (mode === 'login') {
        const res = await signIn(e, password)
        if (!res.ok) {
          setStatus({ tone: 'error', message: res.error })
          return
        }
        await afterAuth(res.user)
      } else {
        const res = await signUp(e, password)
        if (!res.ok) {
          setStatus({ tone: 'error', message: res.error })
          return
        }
        if (res.needsConfirm) {
          setStatus({
            tone: 'success',
            message:
              'Đã tạo tài khoản. Kiểm tra email để xác nhận, rồi đăng nhập.',
          })
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
      <div className="card cloud-panel" aria-busy="false">
        <StatePanel
          tone="empty"
          title="Cloud chưa cấu hình"
          message={
            <>
            Cần tạo project Supabase (miễn phí) và thêm biến môi trường:
            <br />
            <code>VITE_SUPABASE_URL</code>
            <br />
            <code>VITE_SUPABASE_ANON_KEY</code>
            <br />
            Rồi chạy SQL trong <code>supabase/schema.sql</code>. Xem README.
            </>
          }
          compact
        />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="card cloud-panel" aria-busy="true">
        <StatePanel tone="loading" title="Đang kiểm tra cloud…" compact />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="card cloud-panel" aria-busy={busy}>
            <div
              className="seg cloud-panel__tabs"
              role="group"
              aria-label="Chế độ mật khẩu"
            >
              <button
                type="button"
                className={mode === 'login' ? 'on' : ''}
                aria-pressed={mode === 'login'}
                onClick={() => {
                  setMode('login')
                  setStatus(null)
                  setFieldErrors({})
                }}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                className={mode === 'register' ? 'on' : ''}
                aria-pressed={mode === 'register'}
                onClick={() => {
                  setMode('register')
                  setStatus(null)
                  setFieldErrors({})
                }}
              >
                Tạo TK
              </button>
              <button
                type="button"
                className={mode === 'forgot' ? 'on' : ''}
                aria-pressed={mode === 'forgot'}
                onClick={() => {
                  setMode('forgot')
                  setStatus(null)
                  setFieldErrors({})
                }}
              >
                Quên MK
              </button>
            </div>
            <div className="field cloud-panel__field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ban@email.com"
                autoComplete="email"
                aria-invalid={!!fieldErrors.email}
                aria-describedby={
                  fieldErrors.email ? 'cloud-auth-status' : undefined
                }
              />
            </div>
            {mode !== 'forgot' && (
              <div className="field cloud-panel__field">
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
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={
                    fieldErrors.password ? 'cloud-auth-status' : undefined
                  }
                />
              </div>
            )}
            {status && (
              <div
                id="cloud-auth-status"
                className={`form-status form-status--${status.tone}`}
                role={status.tone === 'error' ? 'alert' : 'status'}
                aria-live={status.tone === 'error' ? 'assertive' : 'polite'}
                aria-busy={status.tone === 'loading'}
              >
                <AppIcon
                  name={
                    status.tone === 'success'
                      ? 'check'
                      : status.tone === 'loading'
                        ? 'loader'
                        : 'warning'
                  }
                  size={17}
                  className={status.tone === 'loading' ? 'spin' : undefined}
                />
                {status.message}
              </div>
            )}
            <div className="cloud-panel__submit">
              <button
                className="btn-primary"
                type="button"
                disabled={busy}
                aria-busy={busy}
                onClick={() => void onAuth()}
              >
                {busy ? (
                  <>
                    <AppIcon name="loader" size={18} className="spin" />
                    Đang xử lý…
                  </>
                ) : mode === 'login'
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
    <div className="card cloud-panel" aria-busy={busy}>
      <div className="switch-row">
        <div>
          <div className="cloud-panel__title">Đã đăng nhập</div>
          <div className="cloud-panel__meta">
            {user.email || user.id.slice(0, 8)}
          </div>
        </div>
        <span
          className={`status-badge status-badge--${meta.dirty ? 'warning' : 'success'}`}
        >
          {meta.dirty ? 'Chờ đẩy…' : 'Đã sync'}
        </span>
      </div>
      <div className="switch-row">
        <div>
          <div className="cloud-panel__title">Lần sync gần nhất</div>
          <div className="cloud-panel__meta">{last}</div>
        </div>
      </div>
      <div className="cloud-panel__actions">
        <button
          className="btn-primary"
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void onPush()}
        >
          {busy ? (
            <>
              <AppIcon name="loader" size={18} className="spin" />
              Đang…
            </>
          ) : (
            'Đẩy lên cloud ngay'
          )}
        </button>
        <button
          className="btn-secondary"
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void onPull()}
        >
          Tải từ cloud (ghi đè máy này)
        </button>
        <button
          className="btn-secondary"
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={() => setChangePwOpen((v) => !v)}
        >
          {changePwOpen ? 'Huỷ đổi MK' : 'Đổi mật khẩu cloud'}
        </button>
        {changePwOpen && (
          <div
            className="cloud-panel__password"
          >
            <div className="field">
              <label>Mật khẩu mới</label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="field">
              <label>Nhập lại MK mới</label>
              <input
                type="password"
                value={newPw2}
                onChange={(e) => setNewPw2(e.target.value)}
                autoComplete="new-password"
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
          disabled={busy}
          aria-busy={busy}
          onClick={() => void onLogout()}
        >
          Đăng xuất cloud
        </button>
        <div className="cloud-panel__note">
          <b>Mac + iPhone cùng email:</b> mở app / sửa sổ sẽ tự kéo·đẩy cloud.
          Máy trống không còn đè sổ đầy. Nút “Tải từ cloud” nếu cần kéo tay.
          Đăng xuất không xóa sổ local.
        </div>
      </div>
    </div>
  )
}
