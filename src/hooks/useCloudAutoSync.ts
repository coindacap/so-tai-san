import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import {
  cloudReady,
  getCloudUser,
  markCloudDirty,
  reconcileCloud,
} from '../lib/cloudSync'

/**
 * Đồng bộ 2 chiều Mac ↔ iPhone.
 * - Mở app / quay lại app: kéo cloud nếu máy kia mới hơn
 * - Sửa sổ: đẩy lên (không đẩy sổ trống đè sổ đầy)
 */
export function useCloudAutoSync(enabled: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busy = useRef(false)

  const runReconcile = useCallback(
    async (mode: 'auto' | 'login' = 'auto') => {
      if (!enabled || !cloudReady() || busy.current) return
      const user = await getCloudUser()
      if (!user) return
      busy.current = true
      try {
        await reconcileCloud({
          mode,
          getLocal: () => useStore.getState().getCloudSnapshot(),
          applyRemote: (data) => useStore.getState().applyCloudSnapshot(data),
        })
      } finally {
        busy.current = false
      }
    },
    [enabled],
  )

  // Lần đầu bật sync + mỗi 45s poll nhẹ (kéo nếu máy kia sửa)
  useEffect(() => {
    if (!enabled) return
    void runReconcile('auto')
    const id = setInterval(() => void runReconcile('auto'), 45_000)
    return () => clearInterval(id)
  }, [enabled, runReconcile])

  useEffect(() => {
    if (!enabled) return
    const unsub = useStore.subscribe((state, prev) => {
      if (
        state.assets !== prev.assets ||
        state.transactions !== prev.transactions ||
        state.quotes !== prev.quotes ||
        state.settings !== prev.settings ||
        state.savings !== prev.savings ||
        state.loans !== prev.loans ||
        state.expenses !== prev.expenses ||
        state.expenseCategories !== prev.expenseCategories ||
        state.expenseBudgets !== prev.expenseBudgets
      ) {
        markCloudDirty()
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => {
          void runReconcile('auto')
        }, 2500)
      }
    })
    return () => {
      unsub()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [enabled, runReconcile])

  // Quay lại app (iPhone mở lại) → kéo + đẩy
  useEffect(() => {
    if (!enabled) return
    const onVis = () => {
      if (document.visibilityState === 'visible') void runReconcile('auto')
    }
    const onFocus = () => void runReconcile('auto')
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled, runReconcile])
}
