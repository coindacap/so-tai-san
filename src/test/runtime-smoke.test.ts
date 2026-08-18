import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/cloudSync', () => ({
  cloudReady: () => false,
  getCloudUser: vi.fn().mockResolvedValue(null),
  notifyCloudAuthChanged: vi.fn(),
  onPasswordRecovery: () => () => {},
  onCloudSignedIn: () => () => {},
  readCloudMeta: () => ({ dirty: false, lastSyncedAt: null }),
  reconcileCloud: vi.fn(),
  requestPasswordReset: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
  updatePassword: vi.fn(),
}))
vi.mock('../hooks/useAutoPrices', () => ({ useAutoPrices: () => ({ refresh: async () => null, status: 'idle' }) }))
vi.mock('../hooks/useCloudAutoSync', () => ({ useCloudAutoSync: () => {} }))

import App from '../App'
import { useStore } from '../store/useStore'

let container: HTMLDivElement
let root: Root
const errors: unknown[] = []

beforeEach(async () => {
  errors.length = 0
  window.addEventListener('error', (e) => errors.push(e.error || e.message))
  window.addEventListener('unhandledrejection', (e) => errors.push(e.reason))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    await useStore.persist.rehydrate()
    useStore.setState((s) => ({
      ...s,
      screen: 'spend',
      settings: { ...s.settings, hasOnboarded: true },
    }))
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

const screens = [
  'spend',
  'loans',
  'savings',
  'home',
  'settings',
  'spend-form',
  'loan-form',
  'savings-form',
  'history',
  'prices',
  'onboarding',
] as const

describe('runtime smoke', () => {
  for (const screen of screens) {
    it(`renders ${screen} without throw`, async () => {
      await act(async () => {
        useStore.setState((s) => ({
          ...s,
          screen: screen as typeof s.screen,
          settings: {
            ...s.settings,
            hasOnboarded: screen !== 'onboarding',
          },
        }))
        root.render(createElement(App))
        await Promise.resolve()
        await Promise.resolve()
        await new Promise((r) => setTimeout(r, 50))
      })
      expect(container.innerHTML.length).toBeGreaterThan(20)
      expect(errors).toEqual([])
      const text = container.textContent || ''
      expect(text).not.toMatch(/Cannot |undefined is not|is not a function|Minified React error/i)
    })
  }
})
