import { act, createElement, type ComponentType, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cloud = vi.hoisted(() => ({
  recoveryCallback: null as null | (() => void),
  signUpResult: {
    ok: true as const,
    user: { id: 'user-1', email: 'test@example.com' },
    needsConfirm: true,
  },
}))

vi.mock('../lib/cloudSync', () => ({
  cloudReady: () => true,
  getCloudUser: vi.fn().mockResolvedValue(null),
  notifyCloudAuthChanged: vi.fn(),
  onPasswordRecovery: (callback: () => void) => {
    cloud.recoveryCallback = callback
    return () => {
      cloud.recoveryCallback = null
    }
  },
  onCloudSignedIn: () => () => {},
  readCloudMeta: () => ({ dirty: false, lastSyncedAt: null }),
  reconcileCloud: vi.fn(async () => ({ ok: true, message: 'Đã đồng bộ' })),
  requestPasswordReset: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(() => Promise.resolve(cloud.signUpResult)),
  updatePassword: vi.fn(),
}))

vi.mock('../hooks/useAutoPrices', () => ({ useAutoPrices: () => {} }))
vi.mock('../hooks/useCloudAutoSync', () => ({ useCloudAutoSync: () => {} }))

import App from '../App'
import { useStore } from '../store/useStore'
import { CloudSyncPanel, PasswordRecoveryGate } from './CloudSync'
import { ErrorBoundary } from './ErrorBoundary'
import { MoneyInput } from './MoneyInput'

let container: HTMLDivElement
let root: Root

async function render(element: ReactNode) {
  await act(async () => {
    root.render(element)
    await Promise.resolve()
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

describe('PasswordRecoveryGate', () => {
  it('opens a contained dialog, focuses the first field, and closes on Escape', async () => {
    await render(createElement(PasswordRecoveryGate))

    await act(async () => cloud.recoveryCallback?.())

    const dialog = container.querySelector('dialog')
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(
      dialog?.querySelector('input[type="password"]'),
    )

    await act(async () => {
      dialog?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
    })
    expect(container.querySelector('dialog')).toBeNull()
  })
})

describe('CloudSyncPanel', () => {
  it('defaults to password login and flags empty email', async () => {
    await render(createElement(CloudSyncPanel))
    const submit = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Đăng nhập cloud'),
    )
    const email = container.querySelector<HTMLInputElement>('input[type="email"]')!
    await act(async () => {
      submit?.click()
      await Promise.resolve()
    })
    const status = container.querySelector('[role="alert"]')
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(email.getAttribute('aria-describedby')).toBe(status?.id)
  })
})

describe('MoneyInput', () => {
  it('associates error and helper text without breaking the input API', async () => {
    const TestMoneyInput = MoneyInput as ComponentType<Record<string, unknown>>
    await render(
      createElement(TestMoneyInput, {
        value: '',
        onChange: () => {},
        state: 'error',
        errorMessage: 'Số tiền phải lớn hơn 0',
        helperText: 'Nhập số tiền bằng VND',
        inputId: 'amount',
      }),
    )

    const input = container.querySelector('input')!
    const error = container.querySelector('.money-input__message')
    expect(input.id).toBe('amount')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe(error?.id)
    expect(error?.textContent).toBe('Số tiền phải lớn hơn 0')
    expect(container.textContent).not.toContain('Nhập số tiền bằng VND')
  })
})

describe('ErrorBoundary', () => {
  it('keeps exception details in diagnostics and shows safe user copy', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Broken(): never {
      throw new Error('secret database detail')
    }

    await render(
      createElement(
        ErrorBoundary,
        null,
        createElement(Broken),
      ),
    )

    expect(container.textContent).toContain('Không thể hiển thị nội dung')
    expect(container.textContent).not.toContain('secret database detail')
    expect(consoleError).toHaveBeenCalled()
  })
})

describe('app tab bar', () => {
  it('becomes inert when scroll-hide chrome is hidden', async () => {
    await act(async () => {
      await useStore.persist.rehydrate()
      useStore.setState((state) => ({
        ...state,
        screen: 'spend',
        settings: { ...state.settings, hasOnboarded: true },
      }))
    })
    await render(createElement(App))

    const scroll = container.querySelector<HTMLElement>('.scroll')!
    Object.defineProperty(scroll, 'scrollTop', {
      configurable: true,
      value: 120,
    })
    await act(async () => {
      scroll.dispatchEvent(new Event('scroll', { bubbles: true }))
    })

    const tabbar = container.querySelector<HTMLElement>('.tabbar')!
    expect(tabbar.hasAttribute('inert')).toBe(true)
    expect(tabbar.getAttribute('aria-hidden')).toBe('true')
  })
})
