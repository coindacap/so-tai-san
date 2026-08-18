import { describe, expect, it } from 'vitest'
import type { Asset, PriceQuote, Transaction } from '../types'
import {
  computePosition,
  getBySymbol,
  portfolioSummary,
  qtyHoldAt,
  sortedTxs,
  usdtAvgCost,
  usdtRate,
  type CalcState,
} from './calc'

const t = '2026-01-01T00:00:00.000Z'

const vnd: Asset = {
  id: 'asset-vnd',
  assetClass: 'cash',
  symbol: 'VND',
  name: 'Tiền mặt VND',
  unit: 'VND',
  quoteCurrency: 'VND',
  isBridge: false,
  isSeed: true,
  isArchived: false,
  createdAt: t,
  updatedAt: t,
}

const usdt: Asset = {
  id: 'asset-usdt',
  assetClass: 'stable',
  symbol: 'USDT',
  name: 'USDT',
  unit: 'USDT',
  quoteCurrency: 'VND',
  isBridge: true,
  isSeed: true,
  isArchived: false,
  createdAt: t,
  updatedAt: t,
}

const gold: Asset = {
  id: 'asset-gold',
  assetClass: 'gold',
  symbol: 'NHAN9999',
  name: 'Vàng nhẫn 9999',
  unit: 'chỉ',
  quoteCurrency: 'VND',
  isBridge: false,
  isSeed: true,
  isArchived: false,
  createdAt: t,
  updatedAt: t,
}

const btc: Asset = {
  id: 'asset-btc',
  assetClass: 'crypto',
  symbol: 'BTC',
  name: 'Bitcoin',
  unit: 'BTC',
  quoteCurrency: 'USDT',
  isBridge: false,
  isSeed: false,
  isArchived: false,
  createdAt: t,
  updatedAt: t,
}

function baseState(overrides: Partial<CalcState> = {}): CalcState {
  const quotes: Record<string, PriceQuote> = {
    'asset-usdt': {
      assetId: 'asset-usdt',
      price: 25_000,
      currency: 'VND',
      quotedAt: t,
    },
    'asset-gold': {
      assetId: 'asset-gold',
      price: 7_800_000,
      priceBid: 7_800_000,
      priceAsk: 7_900_000,
      currency: 'VND',
      quotedAt: t,
    },
    'asset-btc': {
      assetId: 'asset-btc',
      price: 95_000,
      currency: 'USDT',
      quotedAt: t,
    },
    ...overrides.quotes,
  }
  return {
    assets: [vnd, usdt, gold, btc],
    transactions: [],
    quotes,
    settings: {
      displayCurrency: 'VND',
      enforceUsdtForCrypto: true,
      privacyMode: false,
      defaultUsdtVnd: 25_000,
      hasOnboarded: true,
      autoGoldPrice: false,
      expenseLinkCashDefault: false,
    },
    ...overrides,
  }
}

function tx(partial: Partial<Transaction> & Pick<Transaction, 'assetId' | 'side' | 'qty'>): Transaction {
  return {
    id: partial.id ?? `tx-${Math.random()}`,
    kind: partial.kind ?? 'buy',
    pricePerUnit: partial.pricePerUnit ?? 0,
    priceCurrency: partial.priceCurrency ?? 'VND',
    fee: partial.fee ?? 0,
    counterAssetId: partial.counterAssetId ?? '',
    counterQty: partial.counterQty ?? 0,
    tradedAt: partial.tradedAt ?? t,
    createdAt: partial.createdAt ?? t,
    updatedAt: partial.updatedAt ?? t,
    ...partial,
  }
}

describe('sortedTxs', () => {
  it('sorts by tradedAt then createdAt', () => {
    const txs = [
      tx({ assetId: 'a', side: 'in', qty: 1, tradedAt: '2026-02-01', createdAt: '2026-02-01T02:00:00Z' }),
      tx({ assetId: 'a', side: 'in', qty: 2, tradedAt: '2026-01-01', createdAt: '2026-01-01T01:00:00Z' }),
      tx({ assetId: 'a', side: 'in', qty: 3, tradedAt: '2026-01-01', createdAt: '2026-01-01T00:00:00Z' }),
    ]
    const sorted = sortedTxs(txs)
    expect(sorted.map((x) => x.qty)).toEqual([3, 2, 1])
  })
})

describe('usdtRate', () => {
  it('uses quote price when available', () => {
    expect(usdtRate(baseState())).toBe(25_000)
  })

  it('falls back to defaultUsdtVnd', () => {
    const state = baseState({ quotes: {} })
    expect(usdtRate(state)).toBe(25_000)
  })
})

describe('computePosition — VND cash', () => {
  it('tracks cash in/out and realized PnL on spend', () => {
    const state = baseState({
      transactions: [
        tx({ assetId: 'asset-vnd', side: 'in', qty: 10_000_000, kind: 'adjust' }),
        tx({
          assetId: 'asset-vnd',
          side: 'out',
          qty: 2_000_000,
          kind: 'convert',
          tradedAt: '2026-02-01',
        }),
      ],
    })
    const pos = computePosition(state, 'asset-vnd')
    expect(pos.qtyHold).toBe(8_000_000)
    expect(pos.marketValueVnd).toBe(8_000_000)
    expect(pos.unrealizedPnLVnd).toBe(0)
  })

  it('matches qtyHoldAt when out happens before in (timestamp order)', () => {
    // Chi tiêu / link cash có thể ghi out trước mốc bootstrap in
    const state = baseState({
      transactions: [
        tx({
          assetId: 'asset-vnd',
          side: 'out',
          qty: 5_000_000,
          kind: 'adjust',
          tradedAt: '2026-01-01T00:00:00.000Z',
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
        tx({
          assetId: 'asset-vnd',
          side: 'in',
          qty: 10_000_000,
          kind: 'adjust',
          tradedAt: '2026-02-01T00:00:00.000Z',
          createdAt: '2026-02-01T00:00:00.000Z',
        }),
        tx({
          assetId: 'asset-vnd',
          side: 'out',
          qty: 3_000_000,
          kind: 'adjust',
          tradedAt: '2026-03-01T00:00:00.000Z',
          createdAt: '2026-03-01T00:00:00.000Z',
        }),
      ],
    })
    const pos = computePosition(state, 'asset-vnd')
    const hold = qtyHoldAt(state, 'asset-vnd')
    // 10tr in - 5tr out - 3tr out = 2tr
    expect(pos.qtyHold).toBe(2_000_000)
    expect(hold).toBe(2_000_000)
    expect(pos.marketValueVnd).toBe(hold)
  })

  it('matches qtyHoldAt when net cash is zero after many legs', () => {
    const state = baseState({
      transactions: [
        tx({ assetId: 'asset-vnd', side: 'in', qty: 72_390_000, kind: 'adjust' }),
        tx({
          assetId: 'asset-vnd',
          side: 'out',
          qty: 72_390_000,
          kind: 'adjust',
          tradedAt: '2026-01-15',
        }),
      ],
    })
    expect(computePosition(state, 'asset-vnd').qtyHold).toBe(0)
    expect(qtyHoldAt(state, 'asset-vnd')).toBe(0)
  })
})

describe('computePosition — gold (VND quoted)', () => {
  it('computes avg cost and unrealized PnL from bid price', () => {
    const state = baseState({
      transactions: [
        tx({
          assetId: 'asset-gold',
          side: 'in',
          qty: 2,
          pricePerUnit: 7_900_000,
          priceCurrency: 'VND',
          kind: 'buy',
        }),
      ],
    })
    const pos = computePosition(state, 'asset-gold')
    expect(pos.qtyHold).toBe(2)
    expect(pos.avgCost).toBe(7_900_000)
    expect(pos.costOpenVnd).toBe(15_800_000)
    expect(pos.marketValueVnd).toBe(15_600_000) // 2 * bid 7_800_000
    expect(pos.unrealizedPnLVnd).toBe(-200_000)
  })

  it('realizes PnL on partial sell', () => {
    const state = baseState({
      transactions: [
        tx({
          assetId: 'asset-gold',
          side: 'in',
          qty: 2,
          pricePerUnit: 7_900_000,
          priceCurrency: 'VND',
          kind: 'buy',
          tradedAt: '2026-01-01',
        }),
        tx({
          assetId: 'asset-gold',
          side: 'out',
          qty: 1,
          pricePerUnit: 8_000_000,
          priceCurrency: 'VND',
          kind: 'sell',
          tradedAt: '2026-02-01',
        }),
      ],
    })
    const pos = computePosition(state, 'asset-gold')
    expect(pos.qtyHold).toBe(1)
    expect(pos.realizedPnLVnd).toBe(100_000) // sell 8M - cost 7.9M
    expect(pos.costOpenVnd).toBe(7_900_000)
  })
})

describe('computePosition — USDT', () => {
  it('values USDT holdings at VND rate', () => {
    const state = baseState({
      transactions: [
        tx({
          assetId: 'asset-usdt',
          side: 'in',
          qty: 100,
          pricePerUnit: 25_500,
          priceCurrency: 'VND',
          kind: 'convert',
        }),
      ],
    })
    const pos = computePosition(state, 'asset-usdt')
    expect(pos.qtyHold).toBe(100)
    expect(pos.marketValueVnd).toBe(2_500_000) // 100 * 25_000 quote
  })
})

describe('computePosition — crypto (USDT quoted)', () => {
  it('converts cost and market value via USDT rate', () => {
    const state = baseState({
      transactions: [
        tx({
          assetId: 'asset-btc',
          side: 'in',
          qty: 0.1,
          pricePerUnit: 90_000,
          priceCurrency: 'USDT',
          counterQty: 9_000,
          counterCostVnd: 225_000_000,
          kind: 'buy',
        }),
      ],
    })
    const pos = computePosition(state, 'asset-btc')
    expect(pos.qtyHold).toBe(0.1)
    expect(pos.costOpenVnd).toBe(225_000_000)
    expect(pos.marketValueNative).toBe(9_500) // 0.1 * 95_000
    expect(pos.marketValueVnd).toBe(237_500_000) // 9500 * 25000
    expect(pos.lastPrice).toBe(95_000)
    expect(pos.unrealizedPnLNative).toBe(500) // (95k - 90k) * 0.1 USDT
    expect(pos.unrealizedPnLVnd).toBe(12_500_000) // 500 USDT × 25_000
  })

  it('values crypto P/L in USDT; VND is only current-rate conversion', () => {
    // Mua 1000 coin = 1000 USDT (giá vốn 1). Giá sàn vẫn 1 USDT.
    // USDT lúc đổi 26.547₫ vs P2P hiện tại 26.134₫ — không được kéo P/L coin.
    const xrp: Asset = {
      ...btc,
      id: 'asset-xrp',
      symbol: 'XRP',
      name: 'XRP',
      unit: 'XRP',
    }
    const state = baseState({
      assets: [vnd, usdt, gold, xrp],
      quotes: {
        'asset-usdt': {
          assetId: 'asset-usdt',
          price: 26_134,
          currency: 'VND',
          quotedAt: t,
        },
        'asset-xrp': {
          assetId: 'asset-xrp',
          price: 1,
          currency: 'USDT',
          quotedAt: t,
        },
      },
      transactions: [
        tx({
          assetId: 'asset-xrp',
          side: 'in',
          qty: 1_000,
          pricePerUnit: 1,
          priceCurrency: 'USDT',
          counterQty: 1_000,
          counterCostVnd: 1_000 * 26_547,
          kind: 'buy',
        }),
      ],
    })
    const pos = computePosition(state, 'asset-xrp')
    expect(pos.avgCost).toBe(1)
    expect(pos.lastPrice).toBe(1)
    expect(pos.unrealizedPnLNative).toBe(0)
    expect(pos.costOpenVnd).toBe(1_000 * 26_134)
    expect(pos.marketValueVnd).toBe(26_134_000)
    expect(pos.unrealizedPnLVnd).toBe(0)
  })

  it('adjusts crypto cost basis without changing hold', () => {
    const state = baseState({
      transactions: [
        tx({
          assetId: 'asset-btc',
          side: 'in',
          qty: 1,
          pricePerUnit: 800,
          priceCurrency: 'USDT',
          counterQty: 800,
          kind: 'buy',
        }),
        tx({
          assetId: 'asset-btc',
          side: 'out',
          qty: 0,
          pricePerUnit: 600,
          priceCurrency: 'USDT',
          counterQty: 200,
          costBasisDeltaNative: -200,
          kind: 'adjust',
        }),
      ],
    })

    const pos = computePosition(state, 'asset-btc')
    expect(pos.qtyHold).toBe(1)
    expect(pos.avgCost).toBe(600)
    expect(pos.totalCostOpen).toBe(600)
    expect(pos.unrealizedPnLNative).toBe(94_400)
  })
})

describe('qtyHoldAt', () => {
  it('returns balance before a given timestamp', () => {
    const state = baseState({
      transactions: [
        tx({ assetId: 'asset-usdt', side: 'in', qty: 50, tradedAt: '2026-01-01' }),
        tx({ assetId: 'asset-usdt', side: 'out', qty: 10, tradedAt: '2026-02-01' }),
        tx({ assetId: 'asset-usdt', side: 'in', qty: 5, tradedAt: '2026-03-01' }),
      ],
    })
    expect(qtyHoldAt(state, 'asset-usdt')).toBe(45)
    expect(qtyHoldAt(state, 'asset-usdt', '2026-01-15')).toBe(50)
    expect(qtyHoldAt(state, 'asset-usdt', '2026-02-15')).toBe(40)
  })
})

describe('usdtAvgCost', () => {
  it('returns average VND cost per USDT', () => {
    const state = baseState({
      transactions: [
        tx({
          assetId: 'asset-usdt',
          side: 'in',
          qty: 100,
          pricePerUnit: 25_600,
          priceCurrency: 'VND',
        }),
      ],
    })
    expect(usdtAvgCost(state)).toBe(25_600)
  })
})

describe('portfolioSummary', () => {
  it('aggregates buckets and totals', () => {
    const state = baseState({
      transactions: [
        tx({ assetId: 'asset-vnd', side: 'in', qty: 5_000_000 }),
        tx({
          assetId: 'asset-usdt',
          side: 'in',
          qty: 200,
          pricePerUnit: 25_000,
          priceCurrency: 'VND',
        }),
      ],
    })
    const summary = portfolioSummary(state)
    expect(summary.buckets.cash.value).toBe(5_000_000)
    expect(summary.buckets.usdt.qty).toBe(200)
    expect(summary.totalValue).toBeGreaterThan(5_000_000)
    expect(getBySymbol(state, 'USDT')?.id).toBe('asset-usdt')
  })

  it('excludes archived assets', () => {
    const archived: Asset = { ...btc, id: 'asset-old', isArchived: true }
    const state = baseState({
      assets: [vnd, usdt, gold, archived],
      transactions: [
        tx({ assetId: 'asset-old', side: 'in', qty: 1, pricePerUnit: 1, priceCurrency: 'USDT' }),
      ],
    })
    const summary = portfolioSummary(state)
    expect(summary.positions.some((p) => p.asset.id === 'asset-old')).toBe(false)
  })
})
