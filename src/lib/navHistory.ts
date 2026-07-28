/**
 * Lưu chuỗi NAV (tổng tài sản) theo ngày trên máy — dùng sparkline Home.
 * Không đồng bộ cloud (chỉ UI local).
 */

const KEY = 'so-tai-san-nav-history'
const MAX_DAYS = 90

export type NavPoint = {
  /** YYYY-MM-DD (local) */
  date: string
  value: number
}

function todayKey(d = new Date()): string {
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function load(): NavPoint[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as NavPoint[]
    if (!Array.isArray(arr)) return []
    return arr
      .filter(
        (p) =>
          p &&
          typeof p.date === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(p.date) &&
          typeof p.value === 'number' &&
          Number.isFinite(p.value),
      )
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    return []
  }
}

function save(list: NavPoint[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_DAYS)))
  } catch {
    /* quota — ignore */
  }
}

/** Đọc toàn bộ điểm (đã sort). */
export function readNavHistory(): NavPoint[] {
  return load()
}

/**
 * Ghi / cập nhật NAV hôm nay.
 * @returns series sau khi ghi
 */
export function recordNavSample(value: number): NavPoint[] {
  if (!Number.isFinite(value) || value < 0) return load()
  const date = todayKey()
  const prev = load().filter((p) => p.date !== date)
  const next = [...prev, { date, value: Math.round(value) }].sort((a, b) =>
    a.date.localeCompare(b.date),
  )
  const trimmed = next.slice(-MAX_DAYS)
  save(trimmed)
  return trimmed
}

/** % đổi so với điểm gần nhất cách ≥ minDays (mặc định 7). */
export function navChangePct(
  points: NavPoint[],
  minDays = 7,
): { pct: number | null; from: number | null; to: number | null } {
  if (points.length < 2) return { pct: null, from: null, to: null }
  const to = points[points.length - 1]!
  const toT = Date.parse(to.date)
  let from = points[0]!
  for (let i = points.length - 2; i >= 0; i--) {
    const p = points[i]!
    const days = (toT - Date.parse(p.date)) / (1000 * 60 * 60 * 24)
    if (days >= minDays) {
      from = p
      break
    }
    from = p
  }
  if (from.value <= 0) return { pct: null, from: from.value, to: to.value }
  const pct = ((to.value - from.value) / from.value) * 100
  return { pct, from: from.value, to: to.value }
}
