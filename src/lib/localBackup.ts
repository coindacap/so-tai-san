/**
 * Bản lưu an toàn trên máy (localStorage).
 * Tự chụp trước import / kéo cloud / reset để khôi phục nếu ghi đè nhầm.
 */

const KEY = 'so-tai-san-safety-backups'
const MAX = 5

export type SafetyReason = 'import' | 'cloud-pull' | 'reset' | 'manual'

export type SafetyBackupMeta = {
  id: string
  reason: SafetyReason
  createdAt: string
  label: string
  tx: number
  savings: number
  loans: number
  bytes: number
}

export type SafetyBackup = SafetyBackupMeta & {
  /** JSON full sổ (cùng format export) */
  payload: string
}

function reasonLabel(r: SafetyReason): string {
  switch (r) {
    case 'import':
      return 'Trước import'
    case 'cloud-pull':
      return 'Trước kéo cloud'
    case 'reset':
      return 'Trước xóa sổ'
    case 'manual':
      return 'Sao lưu tay'
    default:
      return 'Backup'
  }
}

function loadAll(): SafetyBackup[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as SafetyBackup[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function saveAll(list: SafetyBackup[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch (e) {
    // Quota: bỏ bản cũ nhất rồi thử lại
    try {
      const trimmed = list.slice(0, Math.max(1, MAX - 2))
      localStorage.setItem(KEY, JSON.stringify(trimmed))
    } catch {
      console.warn('localBackup: không ghi được (quota)', e)
    }
  }
}

export function listSafetyBackups(): SafetyBackupMeta[] {
  return loadAll().map(({ payload: _p, ...meta }) => meta)
}

export function getSafetyBackup(id: string): SafetyBackup | null {
  return loadAll().find((b) => b.id === id) ?? null
}

/**
 * Chụp snapshot hiện tại. Bỏ qua nếu sổ trống.
 * @returns id bản mới hoặc null
 */
export function pushSafetyBackup(
  reason: SafetyReason,
  exportJson: string,
  counts?: { tx?: number; savings?: number; loans?: number },
): string | null {
  let parsed: {
    transactions?: unknown[]
    savings?: unknown[]
    loans?: unknown[]
    settings?: { hasOnboarded?: boolean }
  }
  try {
    parsed = JSON.parse(exportJson)
  } catch {
    return null
  }

  const tx = counts?.tx ?? parsed.transactions?.length ?? 0
  const savings = counts?.savings ?? parsed.savings?.length ?? 0
  const loans = counts?.loans ?? parsed.loans?.length ?? 0
  const has =
    tx > 0 ||
    savings > 0 ||
    loans > 0 ||
    !!parsed.settings?.hasOnboarded

  if (!has && reason !== 'manual') return null

  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `bk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const entry: SafetyBackup = {
    id,
    reason,
    createdAt: new Date().toISOString(),
    label: reasonLabel(reason),
    tx,
    savings,
    loans,
    bytes: exportJson.length,
    payload: exportJson,
  }

  const next = [entry, ...loadAll().filter((b) => b.id !== id)].slice(0, MAX)
  saveAll(next)
  return id
}

export function deleteSafetyBackup(id: string): void {
  saveAll(loadAll().filter((b) => b.id !== id))
}

export function clearSafetyBackups(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
