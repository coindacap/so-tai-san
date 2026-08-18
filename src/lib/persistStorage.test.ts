import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  debouncedPersistStorage,
  flushDebouncedPersist,
} from './persistStorage'

describe('debouncedPersistStorage', () => {
  afterEach(() => {
    flushDebouncedPersist()
    localStorage.clear()
    vi.useRealTimers()
  })

  it('does not write immediately, then flushes', () => {
    vi.useFakeTimers()
    debouncedPersistStorage.setItem('k', 'v1')
    expect(localStorage.getItem('k')).toBeNull()
    vi.advanceTimersByTime(400)
    expect(localStorage.getItem('k')).toBe('v1')
  })

  it('flush writes the latest pending value', () => {
    debouncedPersistStorage.setItem('k', 'a')
    debouncedPersistStorage.setItem('k', 'b')
    flushDebouncedPersist()
    expect(localStorage.getItem('k')).toBe('b')
  })
})
