/** Shared display helpers for pages */
export function pctClass(n: number | null | undefined) {
  if (n == null || n === 0) return 'flat'
  return n > 0 ? 'up' : 'down'
}

export function mask(privacy: boolean, text: string) {
  return privacy ? '••••' : text
}
