import type {
  AppSettings,
  Asset,
  ExpenseBudget,
  ExpenseCategory,
  ExpenseEntry,
  Loan,
  PriceQuote,
  SavingsAccount,
  Transaction,
} from '../types'
import { getSupabase, isCloudConfigured } from './supabase'

/** Payload lưu trên cloud (cùng format export JSON) */
export type CloudSnapshot = {
  version: number
  assets: Asset[]
  transactions: Transaction[]
  quotes: Record<string, PriceQuote>
  settings: AppSettings
  savings: SavingsAccount[]
  loans: Loan[]
  expenseCategories?: ExpenseCategory[]
  expenses?: ExpenseEntry[]
  expenseBudgets?: ExpenseBudget[]
  savedAt: string
}

export type CloudUser = {
  id: string
  email: string | null
}

export type RemoteRow = {
  data: CloudSnapshot
  updated_at: string
}

export function cloudReady(): boolean {
  return isCloudConfigured()
}

export function onCloudSignedIn(
  cb: (user: CloudUser) => void,
): () => void {
  const sb = getSupabase()
  if (!sb) return () => {}
  const {
    data: { subscription },
  } = sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      cb({ id: session.user.id, email: session.user.email ?? null })
    }
  })
  return () => subscription.unsubscribe()
}

export async function getCloudUser(): Promise<CloudUser | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data, error } = await sb.auth.getUser()
  if (error || !data.user) return null
  return { id: data.user.id, email: data.user.email ?? null }
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ ok: true; user: CloudUser } | { ok: false; error: string }> {
  const sb = getSupabase()
  if (!sb) return { ok: false, error: 'Chưa cấu hình cloud (thiếu env Supabase)' }
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error: mapAuthError(error.message) }
  if (!data.user) return { ok: false, error: 'Đăng nhập thất bại' }
  return {
    ok: true,
    user: { id: data.user.id, email: data.user.email ?? null },
  }
}

export async function signUp(
  email: string,
  password: string,
): Promise<{ ok: true; user: CloudUser; needsConfirm?: boolean } | { ok: false; error: string }> {
  const sb = getSupabase()
  if (!sb) return { ok: false, error: 'Chưa cấu hình cloud (thiếu env Supabase)' }
  if (password.length < 6)
    return { ok: false, error: 'Mật khẩu tối thiểu 6 ký tự' }
  const { data, error } = await sb.auth.signUp({ email, password })
  if (error) return { ok: false, error: mapAuthError(error.message) }
  if (!data.user) return { ok: false, error: 'Đăng ký thất bại' }
  // session null = cần confirm email
  const needsConfirm = !data.session
  return {
    ok: true,
    user: { id: data.user.id, email: data.user.email ?? null },
    needsConfirm,
  }
}

export async function signOut(): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  await sb.auth.signOut()
}

/** URL app hiện tại — dùng cho email reset MK (cần whitelist trên Supabase) */
export function appOriginUrl(): string {
  if (typeof window === 'undefined') return 'https://so-tai-san.vercel.app'
  // bỏ hash/query; giữ path base nếu deploy subpath
  const { origin, pathname } = window.location
  // Vite base /so-tai-san/ trên GH Pages
  if (pathname.startsWith('/so-tai-san')) {
    return `${origin}/so-tai-san/`
  }
  return `${origin}/`
}

/** Gửi email đặt lại mật khẩu */
export async function requestPasswordReset(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase()
  if (!sb) return { ok: false, error: 'Chưa cấu hình cloud' }
  const e = email.trim()
  if (!e || !e.includes('@')) return { ok: false, error: 'Nhập email đã đăng ký' }
  const { error } = await sb.auth.resetPasswordForEmail(e, {
    redirectTo: appOriginUrl(),
  })
  if (error) return { ok: false, error: mapAuthError(error.message) }
  return { ok: true }
}

/** Đặt mật khẩu mới (sau khi mở link trong email, hoặc khi đã login) */
export async function updatePassword(
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase()
  if (!sb) return { ok: false, error: 'Chưa cấu hình cloud' }
  if (newPassword.length < 6)
    return { ok: false, error: 'Mật khẩu tối thiểu 6 ký tự' }
  const { error } = await sb.auth.updateUser({ password: newPassword })
  if (error) return { ok: false, error: mapAuthError(error.message) }
  return { ok: true }
}

/** Lắng nghe sự kiện PASSWORD_RECOVERY từ Supabase (mở link email) */
export function onPasswordRecovery(cb: () => void): () => void {
  const sb = getSupabase()
  if (!sb) return () => {}

  // Hash từ email: #access_token=...&type=recovery
  const hash = typeof window !== 'undefined' ? window.location.hash : ''
  if (hash.includes('type=recovery')) {
    // getSession sẽ parse hash
    void sb.auth.getSession().then(({ data }) => {
      if (data.session) cb()
    })
  }

  const {
    data: { subscription },
  } = sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') cb()
  })
  return () => subscription.unsubscribe()
}

export async function pullSnapshot(): Promise<
  | { ok: true; remote: RemoteRow | null }
  | { ok: false; error: string }
> {
  const sb = getSupabase()
  if (!sb) return { ok: false, error: 'Chưa cấu hình cloud' }
  const user = await getCloudUser()
  if (!user) return { ok: false, error: 'Chưa đăng nhập' }

  const { data, error } = await sb
    .from('snapshots')
    .select('data, updated_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: true, remote: null }
  return {
    ok: true,
    remote: {
      data: data.data as CloudSnapshot,
      updated_at: data.updated_at as string,
    },
  }
}

export async function pushSnapshot(
  snapshot: CloudSnapshot,
): Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }> {
  const sb = getSupabase()
  if (!sb) return { ok: false, error: 'Chưa cấu hình cloud' }
  const user = await getCloudUser()
  if (!user) return { ok: false, error: 'Chưa đăng nhập' }

  const updatedAt = new Date().toISOString()
  const payload = { ...snapshot, savedAt: updatedAt }

  const { error } = await sb.from('snapshots').upsert(
    {
      user_id: user.id,
      data: payload,
      updated_at: updatedAt,
    },
    { onConflict: 'user_id' },
  )

  if (error) return { ok: false, error: error.message }
  return { ok: true, updatedAt }
}

function mapAuthError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login') || m.includes('invalid credentials'))
    return 'Sai email hoặc mật khẩu'
  if (m.includes('expired') || m.includes('token'))
    return 'Link đặt lại mật khẩu hết hạn — gửi lại từ tab Quên MK'
  if (m.includes('email not confirmed'))
    return 'Email chưa xác nhận — kiểm tra hộp thư hoặc thử Quên MK'
  if (m.includes('user already registered') || m.includes('already been registered'))
    return 'Email đã đăng ký — hãy đăng nhập (tab Đăng nhập)'
  if (m.includes('same password') || m.includes('different from the old'))
    return 'Mật khẩu mới phải khác mật khẩu cũ'
  // Chỉ báo "tối thiểu 6" khi lỗi thật sự về độ dài — KHÔNG gộp mọi lỗi có chữ password
  if (
    (m.includes('password') || m.includes('mật khẩu')) &&
    (m.includes('at least') ||
      m.includes('minimum') ||
      m.includes('too short') ||
      m.includes('6 character') ||
      m.includes('least 6'))
  ) {
    return 'Mật khẩu tối thiểu 6 ký tự'
  }
  if (m.includes('weak') || m.includes('easy to guess') || m.includes('pwned'))
    return 'Mật khẩu quá yếu / dễ đoán — thử thêm ký tự hoặc số'
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes'))
    return 'Thử quá nhiều lần — đợi khoảng 1 phút rồi thử lại'
  if (m.includes('redirect') || m.includes('url not allowed'))
    return 'Link reset chưa được phép — thêm domain app vào Supabase Auth → URL Configuration'
  if (m.includes('network') || m.includes('fetch'))
    return 'Lỗi mạng — kiểm tra Wi‑Fi / 4G rồi thử lại'
  // Giữ nguyên message gốc (dễ debug) thay vì map sai thành "6 ký tự"
  return msg
}

/** Meta đồng bộ local (không đẩy lên cloud) */
const META_KEY = 'so-tai-san-cloud-meta'

export type CloudMeta = {
  lastSyncedAt: string | null
  lastRemoteUpdatedAt: string | null
  dirty: boolean
}

export function readCloudMeta(): CloudMeta {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (!raw) return { lastSyncedAt: null, lastRemoteUpdatedAt: null, dirty: false }
    return { lastSyncedAt: null, lastRemoteUpdatedAt: null, dirty: false, ...JSON.parse(raw) }
  } catch {
    return { lastSyncedAt: null, lastRemoteUpdatedAt: null, dirty: false }
  }
}

export function writeCloudMeta(p: Partial<CloudMeta>) {
  const next = { ...readCloudMeta(), ...p }
  localStorage.setItem(META_KEY, JSON.stringify(next))
}

export function markCloudDirty() {
  writeCloudMeta({ dirty: true })
}

/** Báo App bật/tắt auto-sync sau login/logout */
export function notifyCloudAuthChanged() {
  window.dispatchEvent(new Event('so-cloud-auth'))
}

function ts(iso: string | null | undefined): number {
  if (!iso) return 0
  const n = Date.parse(iso)
  return Number.isFinite(n) ? n : 0
}

/**
 * “Độ giàu” sổ — tránh máy trống / mới onboard đè máy có TK+vay+coin.
 * Seed assets (~3) gần như 0 điểm.
 */
export function snapshotRichness(s: {
  transactions?: unknown[]
  savings?: unknown[]
  loans?: unknown[] | { payments?: unknown[] }[]
  assets?: unknown[]
  expenses?: unknown[]
}): number {
  const tx = s.transactions?.length ?? 0
  const sav = s.savings?.length ?? 0
  const loan = s.loans?.length ?? 0
  const assets = s.assets?.length ?? 0
  const exp = s.expenses?.length ?? 0
  // Lịch sử thu/sửa trên từng khoản vay cũng tính “giàu” — tránh cloud
  // bản cũ (0 payments) đè local vừa thu gốc / đóng lãi.
  const loanPays = (s.loans || []).reduce((n: number, l) => {
    const pays = (l as { payments?: unknown[] })?.payments
    return n + (Array.isArray(pays) ? pays.length : 0)
  }, 0)
  return (
    tx * 10 +
    sav * 8 +
    loan * 8 +
    exp * 6 +
    loanPays * 3 +
    Math.max(0, assets - 3) * 2
  )
}

export type ReconcileMode = 'login' | 'auto' | 'manual-push' | 'manual-pull'

export type ReconcileResult = {
  action: 'pulled' | 'pushed' | 'noop' | 'error'
  message: string
}

/**
 * Đồng bộ 2 chiều Mac ↔ iPhone cùng 1 email.
 *
 * Ưu tiên:
 * 1. Manual pull → luôn lấy cloud
 * 2. Local dirty / push tay / login (có data) → đẩy local
 *    (kể cả khi xóa làm sổ “nghèo” hơn — tránh cloud kéo hoàn giao dịch đã xóa)
 * 3. Máy trống vs cloud đầy → kéo cloud (chặn đè rỗng)
 * 4. Remote giàu hơn / mới hơn (local sạch) → kéo
 * 5. Local giàu hơn → đẩy
 */
export async function reconcileCloud(opts: {
  getLocal: () => CloudSnapshot
  applyRemote: (data: CloudSnapshot) => void
  mode: ReconcileMode
}): Promise<ReconcileResult> {
  const pull = await pullSnapshot()
  if (!pull.ok) return { action: 'error', message: pull.error }

  const local = opts.getLocal()
  const localR = snapshotRichness(local)
  const meta = readCloudMeta()
  const remote = pull.remote

  // --- Cloud trống ---
  if (!remote) {
    if (localR > 0 || opts.mode === 'manual-push') {
      const res = await pushSnapshot(local)
      if (!res.ok) return { action: 'error', message: res.error }
      writeCloudMeta({
        dirty: false,
        lastSyncedAt: res.updatedAt,
        lastRemoteUpdatedAt: res.updatedAt,
      })
      return {
        action: 'pushed',
        message: 'Đã đẩy sổ lên cloud (lần đầu)',
      }
    }
    return {
      action: 'noop',
      message: 'Cloud trống — ghi sổ trên máy rồi sẽ tự đồng bộ',
    }
  }

  const remoteR = snapshotRichness(remote.data)
  const remoteT = ts(remote.updated_at)
  const lastRemoteKnown = ts(meta.lastRemoteUpdatedAt)
  const lastSync = ts(meta.lastSyncedAt)

  // --- Kéo bắt buộc (manual-pull) ---
  if (opts.mode === 'manual-pull') {
    opts.applyRemote(remote.data)
    writeCloudMeta({
      dirty: false,
      lastSyncedAt: remote.updated_at,
      lastRemoteUpdatedAt: remote.updated_at,
    })
    return {
      action: 'pulled',
      message: `Đã tải từ cloud · ${remoteR} điểm dữ liệu`,
    }
  }

  // Không đẩy sổ trống đè cloud đầy (auto / login)
  const emptyLocalGuard =
    localR === 0 && remoteR > 0 && opts.mode !== 'manual-push'

  // --- Local dirty / đẩy tay / login: ưu tiên sổ máy này ---
  // Trước: remoteR > localR luôn kéo → xóa chi tiêu/giao dịch bị cloud “hoàn lại”.
  if (
    (meta.dirty || opts.mode === 'manual-push' || opts.mode === 'login') &&
    !emptyLocalGuard
  ) {
    const res = await pushSnapshot(local)
    if (!res.ok) return { action: 'error', message: res.error }
    writeCloudMeta({
      dirty: false,
      lastSyncedAt: res.updatedAt,
      lastRemoteUpdatedAt: res.updatedAt,
    })
    return {
      action: 'pushed',
      message:
        opts.mode === 'login'
          ? 'Đã đồng bộ sổ lên cloud'
          : localR < remoteR
            ? 'Đã đẩy thay đổi (kể cả xóa) lên cloud'
            : 'Đã đẩy thay đổi lên cloud',
    }
  }

  // --- Máy trống + cloud có data → kéo ---
  if (emptyLocalGuard) {
    opts.applyRemote(remote.data)
    writeCloudMeta({
      dirty: false,
      lastSyncedAt: remote.updated_at,
      lastRemoteUpdatedAt: remote.updated_at,
    })
    return {
      action: 'pulled',
      message:
        meta.dirty
          ? 'Chặn đẩy sổ trống — đã tải lại từ cloud'
          : 'Đã tải sổ đầy từ cloud về máy này',
    }
  }

  // --- Remote giàu hơn + local sạch → kéo ---
  if (remoteR > localR) {
    opts.applyRemote(remote.data)
    writeCloudMeta({
      dirty: false,
      lastSyncedAt: remote.updated_at,
      lastRemoteUpdatedAt: remote.updated_at,
    })
    return {
      action: 'pulled',
      message: 'Máy khác có sổ đầy hơn — đã cập nhật từ cloud',
    }
  }

  // --- Local giàu hơn remote → đẩy ---
  if (localR > remoteR) {
    const res = await pushSnapshot(local)
    if (!res.ok) return { action: 'error', message: res.error }
    writeCloudMeta({
      dirty: false,
      lastSyncedAt: res.updatedAt,
      lastRemoteUpdatedAt: res.updatedAt,
    })
    return {
      action: 'pushed',
      message: 'Đã đẩy sổ (máy này đầy hơn cloud) lên cloud',
    }
  }

  // --- Cùng độ giàu: cloud mới hơn (máy khác vừa sửa) → kéo ---
  if (remoteT > lastRemoteKnown && remoteT > lastSync) {
    opts.applyRemote(remote.data)
    writeCloudMeta({
      dirty: false,
      lastSyncedAt: remote.updated_at,
      lastRemoteUpdatedAt: remote.updated_at,
    })
    return {
      action: 'pulled',
      message: 'Đã cập nhật từ cloud (máy khác vừa sửa)',
    }
  }

  // Đánh dấu đã biết remote hiện tại
  writeCloudMeta({ lastRemoteUpdatedAt: remote.updated_at })
  return { action: 'noop', message: 'Hai máy đã khớp cloud' }
}
