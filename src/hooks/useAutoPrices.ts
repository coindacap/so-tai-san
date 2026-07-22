import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLivePrices, type LivePricesResult } from '../lib/prices'
import { useStore } from '../store/useStore'
import { nowIso } from '../lib/format'

const INTERVAL_MS = 3 * 60 * 1000 // 3 phút

export function useAutoPrices(enabled = true) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>(
    'idle',
  )
  const [last, setLast] = useState<LivePricesResult | null>(null)
  const [lastError, setLastError] = useState('')
  const busy = useRef(false)

  const applyLive = useCallback(async (silent = false) => {
    if (busy.current) return null
    busy.current = true
    if (!silent) setStatus('loading')
    try {
      const state = useStore.getState()
      const cryptos = state.assets.filter((a) => a.assetClass === 'crypto')
      const symbols = cryptos.map((c) => c.symbol)
      const live = await fetchLivePrices(symbols)
      const t = live.fetchedAt || nowIso()
      const gold = state.assets.find((a) => a.symbol === 'NHAN9999')
      const usdt = state.assets.find((a) => a.symbol === 'USDT')

      if (usdt && live.usdtVnd && live.usdtVnd > 0) {
        state.setQuote({
          assetId: usdt.id,
          price: live.usdtVnd,
          currency: 'VND',
          label: live.usdtLabel || 'Binance',
          quotedAt: t,
        })
        state.updateSettings({ defaultUsdtVnd: live.usdtVnd })
      }

      if (gold && live.goldBid && live.goldAsk) {
        state.setQuote({
          assetId: gold.id,
          price: live.goldBid,
          priceBid: live.goldBid,
          priceAsk: live.goldAsk,
          currency: 'VND',
          label: live.goldLabel || 'Auto',
          quotedAt: t,
        })
      }

      for (const c of cryptos) {
        const p = live.coins[c.symbol.toUpperCase()]
        if (p && p > 0) {
          state.setQuote({
            assetId: c.id,
            price: p,
            currency: 'USDT',
            label: 'Binance',
            quotedAt: t,
          })
        }
      }

      setLast(live)
      const ok =
        live.usdtVnd != null ||
        live.goldBid != null ||
        Object.keys(live.coins).length > 0
      setStatus(ok ? 'ok' : 'error')
      if (!ok && live.errors.length) setLastError(live.errors.join('; '))
      else setLastError('')
      return live
    } catch (e) {
      setStatus('error')
      setLastError(e instanceof Error ? e.message : 'Lỗi lấy giá')
      return null
    } finally {
      busy.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    // đợi hydrate localStorage xong một nhịp
    const boot = setTimeout(() => void applyLive(true), 800)
    const id = setInterval(() => void applyLive(true), INTERVAL_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') void applyLive(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearTimeout(boot)
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [enabled, applyLive])

  return { status, last, lastError, refresh: applyLive }
}
