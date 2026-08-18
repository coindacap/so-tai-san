import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudSnapshot } from './cloudSync'
import {
  readCloudMeta,
  reconcileCloud,
  snapshotRichness,
  writeCloudMeta,
} from './cloudSync'

const META_KEY = 'so-tai-san-cloud-meta'

const mockMaybeSingle = vi.fn()
const mockUpsert = vi.fn()

vi.mock('./supabase', () => ({
  isCloudConfigured: () => true,
  getSupabase: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1', email: 'test@example.com' } },
        error: null,
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mockMaybeSingle,
        }),
      }),
      upsert: mockUpsert,
    }),
  }),
}))

function emptySnapshot(): CloudSnapshot {
  return {
    version: 1,
    assets: [
      { id: 'a1', symbol: 'VND' } as CloudSnapshot['assets'][0],
      { id: 'a2', symbol: 'USDT' } as CloudSnapshot['assets'][0],
      { id: 'a3', symbol: 'NHAN9999' } as CloudSnapshot['assets'][0],
    ],
    transactions: [],
    quotes: {},
    settings: {} as CloudSnapshot['settings'],
    savings: [],
    loans: [],
    savedAt: '2026-01-01T00:00:00.000Z',
  }
}

function richSnapshot(): CloudSnapshot {
  return {
    ...emptySnapshot(),
    transactions: [{ id: 'tx1' } as CloudSnapshot['transactions'][0]],
    savings: [{ id: 's1' } as CloudSnapshot['savings'][0]],
    loans: [{ id: 'l1' } as CloudSnapshot['loans'][0]],
    expenses: [{ id: 'e1' } as NonNullable<CloudSnapshot['expenses']>[0]],
  }
}

describe('snapshotRichness', () => {
  it('scores empty seed-only snapshot as 0', () => {
    expect(snapshotRichness(emptySnapshot())).toBe(0)
  })

  it('weights transactions, savings, loans, expenses', () => {
    expect(snapshotRichness(richSnapshot())).toBe(32)
  })

  it('counts extra assets beyond seed trio', () => {
    const s = {
      ...emptySnapshot(),
      assets: [...emptySnapshot().assets, { id: 'btc' } as CloudSnapshot['assets'][0]],
    }
    expect(snapshotRichness(s)).toBe(2)
  })
})

describe('readCloudMeta / writeCloudMeta', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns defaults when empty', () => {
    expect(readCloudMeta()).toEqual({
      lastSyncedAt: null,
      lastRemoteUpdatedAt: null,
      dirty: false,
    })
  })

  it('persists partial updates', () => {
    writeCloudMeta({ dirty: true, lastSyncedAt: '2026-01-02T00:00:00.000Z' })
    expect(readCloudMeta().dirty).toBe(true)
    expect(readCloudMeta().lastSyncedAt).toBe('2026-01-02T00:00:00.000Z')
    expect(localStorage.getItem(META_KEY)).toContain('dirty')
  })
})

describe('reconcileCloud', () => {
  beforeEach(() => {
    localStorage.clear()
    mockMaybeSingle.mockReset()
    mockUpsert.mockReset()
    mockUpsert.mockResolvedValue({ error: null })
  })

  it('pushes when cloud is empty and local has data', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })

    const applyRemote = vi.fn()
    const result = await reconcileCloud({
      mode: 'auto',
      getLocal: () => richSnapshot(),
      applyRemote,
    })

    expect(result.action).toBe('pushed')
    expect(mockUpsert).toHaveBeenCalledOnce()
    expect(applyRemote).not.toHaveBeenCalled()
    expect(readCloudMeta().dirty).toBe(false)
  })

  it('noops when both cloud and local are empty', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })

    const result = await reconcileCloud({
      mode: 'auto',
      getLocal: () => emptySnapshot(),
      applyRemote: vi.fn(),
    })

    expect(result.action).toBe('noop')
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('pulls when remote is richer than local', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        data: richSnapshot(),
        updated_at: '2026-03-01T00:00:00.000Z',
      },
      error: null,
    })

    const applyRemote = vi.fn()
    const result = await reconcileCloud({
      mode: 'auto',
      getLocal: () => emptySnapshot(),
      applyRemote,
    })

    expect(result.action).toBe('pulled')
    expect(applyRemote).toHaveBeenCalledOnce()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('pushes when local is richer than remote', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        data: emptySnapshot(),
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    })

    const result = await reconcileCloud({
      mode: 'auto',
      getLocal: () => richSnapshot(),
      applyRemote: vi.fn(),
    })

    expect(result.action).toBe('pushed')
    expect(mockUpsert).toHaveBeenCalledOnce()
  })

  it('pushes dirty local after delete even when remote is richer (no restore)', async () => {
    // Cloud còn expense; local vừa xóa → richness thấp hơn nhưng dirty
    const afterDelete = {
      ...richSnapshot(),
      expenses: [] as NonNullable<CloudSnapshot['expenses']>,
    }
    mockMaybeSingle.mockResolvedValue({
      data: {
        data: richSnapshot(),
        updated_at: '2026-03-01T00:00:00.000Z',
      },
      error: null,
    })
    writeCloudMeta({
      dirty: true,
      lastSyncedAt: '2026-02-01T00:00:00.000Z',
      lastRemoteUpdatedAt: '2026-02-01T00:00:00.000Z',
    })

    const applyRemote = vi.fn()
    const result = await reconcileCloud({
      mode: 'auto',
      getLocal: () => afterDelete,
      applyRemote,
    })

    expect(result.action).toBe('pushed')
    expect(mockUpsert).toHaveBeenCalledOnce()
    expect(applyRemote).not.toHaveBeenCalled()
    expect(readCloudMeta().dirty).toBe(false)
  })

  it('still pulls richer remote when local is clean (not dirty)', async () => {
    const poorer = {
      ...richSnapshot(),
      expenses: [] as NonNullable<CloudSnapshot['expenses']>,
    }
    mockMaybeSingle.mockResolvedValue({
      data: {
        data: richSnapshot(),
        updated_at: '2026-03-01T00:00:00.000Z',
      },
      error: null,
    })
    writeCloudMeta({
      dirty: false,
      lastSyncedAt: '2026-02-01T00:00:00.000Z',
      lastRemoteUpdatedAt: '2026-02-01T00:00:00.000Z',
    })

    const applyRemote = vi.fn()
    const result = await reconcileCloud({
      mode: 'auto',
      getLocal: () => poorer,
      applyRemote,
    })

    expect(result.action).toBe('pulled')
    expect(applyRemote).toHaveBeenCalledOnce()
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})
