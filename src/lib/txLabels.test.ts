import { describe, expect, it } from 'vitest'
import {
  classifyAdjust,
  kindLabel,
  matchesHistoryFilter,
} from './txLabels'
import type { Asset, ExpenseEntry, Transaction } from '../types'

const assets: Asset[] = [
  {
    id: 'asset-vnd',
    assetClass: 'cash',
    symbol: 'VND',
    name: 'Tiền mặt',
    unit: 'VND',
    quoteCurrency: 'VND',
    isBridge: false,
    isSeed: true,
    isArchived: false,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'asset-usdt',
    assetClass: 'stable',
    symbol: 'USDT',
    name: 'USDT',
    unit: 'USDT',
    quoteCurrency: 'VND',
    isBridge: true,
    isSeed: true,
    isArchived: false,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'asset-btc',
    assetClass: 'crypto',
    symbol: 'BTC',
    name: 'Bitcoin',
    unit: 'BTC',
    quoteCurrency: 'USDT',
    isBridge: false,
    isSeed: false,
    isArchived: false,
    createdAt: '',
    updatedAt: '',
  },
]

function tx(p: Partial<Transaction> & Pick<Transaction, 'id' | 'assetId'>): Transaction {
  return {
    kind: 'adjust',
    side: 'out',
    qty: 1000,
    pricePerUnit: 1,
    priceCurrency: 'VND',
    fee: 0,
    counterAssetId: 'asset-vnd',
    counterQty: 0,
    tradedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...p,
  }
}

describe('txLabels', () => {
  it('labels expense-linked cash adjust via cashTxId', () => {
    const expenses: ExpenseEntry[] = [
      {
        id: 'e1',
        kind: 'expense',
        categoryId: 'c1',
        amount: 50000,
        spentAt: '2026-01-01T00:00:00.000Z',
        note: 'Cafe',
        linkCash: true,
        cashTxId: 'tx-exp',
        createdAt: '',
        updatedAt: '',
      },
    ]
    const t = tx({ id: 'tx-exp', assetId: 'asset-vnd', note: 'Chi tiêu · Ăn uống' })
    expect(classifyAdjust(t, { assets, expenses })).toBe('expense_cash')
    expect(kindLabel(t, { assets, expenses })).toContain('Chi tiêu')
  })

  it('labels nạp / rút tiền mặt', () => {
    const dep = tx({
      id: 'd1',
      assetId: 'asset-vnd',
      side: 'in',
      note: 'Nạp tiền mặt vào sổ',
    })
    const w = tx({
      id: 'w1',
      assetId: 'asset-vnd',
      side: 'out',
      note: 'Rút tiền mặt khỏi sổ',
    })
    expect(classifyAdjust(dep, { assets })).toBe('cash_deposit')
    expect(classifyAdjust(w, { assets })).toBe('cash_withdraw')
    expect(kindLabel(dep, { assets })).toBe('Nạp tiền mặt')
    expect(kindLabel(w, { assets })).toBe('Rút tiền mặt')
  })

  it('labels savings and loan notes', () => {
    const s = tx({
      id: 's1',
      assetId: 'asset-vnd',
      note: 'Gửi tiết kiệm: TK Agri',
    })
    const l = tx({
      id: 'l1',
      assetId: 'asset-vnd',
      note: 'Cho vay: Minh',
    })
    expect(classifyAdjust(s, { assets })).toBe('savings')
    expect(classifyAdjust(l, { assets })).toBe('loan')
  })

  it('labels coin old hold and cost basis', () => {
    const coin = tx({
      id: 'c1',
      assetId: 'asset-btc',
      side: 'in',
      kind: 'adjust',
      venue: 'Hold cũ',
      note: 'Hold sẵn / mua từ trước — không trừ USDT hiện tại',
      priceCurrency: 'USDT',
      counterAssetId: 'asset-usdt',
      counterQty: 100,
    })
    const cost = tx({
      id: 'cb1',
      assetId: 'asset-btc',
      costBasisDeltaNative: 10,
      qty: 0,
    })
    expect(classifyAdjust(coin, { assets })).toBe('coin_old_hold')
    expect(kindLabel(coin, { assets })).toBe('Hold coin cũ')
    expect(kindLabel(cost, { assets })).toBe('Sửa giá vốn')
  })

  it('filters cash_flow vs plain kinds', () => {
    const buy = tx({
      id: 'b1',
      assetId: 'asset-btc',
      kind: 'buy',
      side: 'in',
    })
    const cash = tx({
      id: 'x1',
      assetId: 'asset-vnd',
      note: 'Nạp tiền mặt vào sổ',
      side: 'in',
    })
    expect(matchesHistoryFilter(buy, 'buy', { assets })).toBe(true)
    expect(matchesHistoryFilter(buy, 'cash_flow', { assets })).toBe(false)
    expect(matchesHistoryFilter(cash, 'cash_flow', { assets })).toBe(true)
    expect(matchesHistoryFilter(cash, 'adjust', { assets })).toBe(true)
  })
})
