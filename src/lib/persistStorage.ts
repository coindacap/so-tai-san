/** Ghi localStorage trễ nhẹ — giá tick không block UI. Flush khi ẩn app. */

let timer: ReturnType<typeof setTimeout> | null = null
let pending: { name: string; value: string } | null = null
let bound = false

export function flushDebouncedPersist() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (!pending) return
  localStorage.setItem(pending.name, pending.value)
  pending = null
}

function bindFlush() {
  if (bound || typeof window === 'undefined' || typeof document === 'undefined')
    return
  bound = true
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushDebouncedPersist()
    })
    window.addEventListener('pagehide', flushDebouncedPersist)
  } catch {
    bound = true
  }
}

export const debouncedPersistStorage = {
  getItem: (name: string) => localStorage.getItem(name),
  setItem: (name: string, value: string) => {
    bindFlush()
    pending = { name, value }
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      flushDebouncedPersist()
    }, 400)
  },
  removeItem: (name: string) => {
    pending = null
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    localStorage.removeItem(name)
  },
}
