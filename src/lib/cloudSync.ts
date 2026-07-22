import type {
  AppSettings,
  Asset,
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
