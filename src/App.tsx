import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useStore } from './store/useStore'
import { portfolioSummary } from './lib/calc'
import { PasswordRecoveryGate } from './components/CloudSync'
import { Tab } from './components/Tab'
import { Action } from './components/Action'
import { cloudReady, getCloudUser } from './lib/cloudSync'
import { useAutoPrices } from './hooks/useAutoPrices'
import { useCloudAutoSync } from './hooks/useCloudAutoSync'
import { bindBrowserBack } from './lib/appHistory'

const Onboarding = lazy(() =>
  import('./pages/Onboarding').then((m) => ({ default: m.Onboarding })),
)
const Home = lazy(() =>
  import('./pages/HomeScreens').then((m) => ({ default: m.Home })),
)
const Assets = lazy(() =>
  import('./pages/HomeScreens').then((m) => ({ default: m.Assets })),
)
const GoldDetail = lazy(() =>
  import('./pages/GoldScreens').then((m) => ({ default: m.GoldDetail })),
)
const BuyGold = lazy(() =>
  import('./pages/GoldScreens').then((m) => ({ default: m.BuyGold })),
)
const SellGold = lazy(() =>
  import('./pages/GoldScreens').then((m) => ({ default: m.SellGold })),
)
const AssetDetail = lazy(() =>
  import('./pages/TradeScreens').then((m) => ({ default: m.AssetDetail })),
)
const CashAdjust = lazy(() =>
  import('./pages/TradeScreens').then((m) => ({ default: m.CashAdjust })),
)
const UsdtConvert = lazy(() =>
  import('./pages/TradeScreens').then((m) => ({ default: m.UsdtConvert })),
)
const BuyCoin = lazy(() =>
  import('./pages/TradeScreens').then((m) => ({ default: m.BuyCoin })),
)
const AdjustUsdt = lazy(() =>
  import('./pages/TradeScreens').then((m) => ({ default: m.AdjustUsdt })),
)
const SellCoin = lazy(() =>
  import('./pages/TradeScreens').then((m) => ({ default: m.SellCoin })),
)
const Prices = lazy(() =>
  import('./pages/PricesScreen').then((m) => ({ default: m.Prices })),
)
const History = lazy(() =>
  import('./pages/HistoryScreen').then((m) => ({ default: m.History })),
)
const Settings = lazy(() =>
  import('./pages/SettingsScreen').then((m) => ({ default: m.Settings })),
)
const SavingsList = lazy(() =>
  import('./pages/SavingsScreens').then((m) => ({ default: m.SavingsList })),
)
const SavingsForm = lazy(() =>
  import('./pages/SavingsScreens').then((m) => ({ default: m.SavingsForm })),
)
const SavingsDetail = lazy(() =>
  import('./pages/SavingsScreens').then((m) => ({ default: m.SavingsDetail })),
)
const LoansList = lazy(() =>
  import('./pages/LoansScreens').then((m) => ({ default: m.LoansList })),
)
const LoanForm = lazy(() =>
  import('./pages/LoansScreens').then((m) => ({ default: m.LoanForm })),
)
const LoanDetail = lazy(() =>
  import('./pages/LoansScreens').then((m) => ({ default: m.LoanDetail })),
)
const LoansTrash = lazy(() =>
  import('./pages/LoansScreens').then((m) => ({ default: m.LoansTrash })),
)
const SpendHome = lazy(() =>
  import('./pages/ExpenseScreens').then((m) => ({ default: m.SpendHome })),
)
const SpendForm = lazy(() =>
  import('./pages/ExpenseScreens').then((m) => ({ default: m.SpendForm })),
)
const SpendDetail = lazy(() =>
  import('./pages/ExpenseScreens').then((m) => ({ default: m.SpendDetail })),
)
const SpendCategories = lazy(() =>
  import('./pages/ExpenseScreens').then((m) => ({
    default: m.SpendCategories,
  })),
)
const SpendBudget = lazy(() =>
  import('./pages/ExpenseScreens').then((m) => ({ default: m.SpendBudget })),
)

function ScreenFallback() {
  return (
    <div className="scroll plain" style={{ textAlign: 'center', paddingTop: 80 }}>
      <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--muted)' }}>
        Đang tải…
      </div>
    </div>
  )
}

export default function App() {
  const store = useStore()
  const [sheet, setSheet] = useState(false)
  const [ready, setReady] = useState(() => useStore.persist.hasHydrated())
  const [cloudLoggedIn, setCloudLoggedIn] = useState(false)
  /** Menu dưới: hiện khi kéo lên / đầu trang; ẩn nhẹ khi kéo xuống list dài */
  const [chromeVisible, setChromeVisible] = useState(true)

  // Chờ localStorage load xong (tránh luôn rơi về onboarding trên iPhone)
  useEffect(() => {
    const done = () => {
      setReady(true)
      const s = useStore.getState()
      const has =
        s.settings.hasOnboarded ||
        s.transactions.length > 0 ||
        s.savings.length > 0 ||
        s.loans.length > 0
      if (has && s.screen === 'onboarding') {
        useStore.setState({ screen: 'home' })
      } else if (!has && s.screen === 'home' && !s.settings.hasOnboarded) {
        // lần đầu chưa có data
        useStore.setState({ screen: 'onboarding' })
      }
    }
    if (useStore.persist.hasHydrated()) done()
    const unsub = useStore.persist.onFinishHydration(done)
    return unsub
  }, [])

  // Auto-sync cloud khi đã đăng nhập
  useEffect(() => {
    if (!cloudReady()) return
    const refresh = () => {
      void getCloudUser().then((u) => setCloudLoggedIn(!!u))
    }
    refresh()
    window.addEventListener('so-cloud-auth', refresh)
    return () => window.removeEventListener('so-cloud-auth', refresh)
  }, [])
  useCloudAutoSync(cloudLoggedIn)
  // Giá coin/USDT Binance + vàng nhẫn ước lượng — tự refresh
  useAutoPrices(ready && store.screen !== 'onboarding')

  const summary = useMemo(
    () =>
      portfolioSummary({
        assets: store.assets,
        transactions: store.transactions,
        quotes: store.quotes,
        settings: store.settings,
        savings: store.savings,
        loans: store.loans,
        version: store.version,
      }),
    [
      store.assets,
      store.transactions,
      store.quotes,
      store.settings,
      store.savings,
      store.loans,
      store.version,
    ],
  )
  const privacy = store.settings.privacyMode
  const savingsTotal = store.savings
    .filter((s) => s.status === 'active')
    .reduce((a, s) => a + s.principal, 0)
  const loansTotal = store.loans
    .filter(
      (l) =>
        !l.deletedAt &&
        (l.status === 'open' || l.status === 'partial') &&
        l.remaining > 0,
    )
    .reduce((a, l) => a + l.remaining, 0)

  const showTabs = [
    'home',
    'assets',
    'history',
    'settings',
    'spend',
    'savings',
    'loans',
  ].includes(store.screen)

  // Chặn Safari “Back” ra trang web cũ; map popstate → goBack trong app
  useEffect(() => {
    return bindBrowserBack(() =>
      useStore.getState().goBack({ fromBrowser: true }),
    )
  }, [])

  // Menu đáy: kéo lên nhẹ → hiện ngay; kéo xuống → ẩn bớt để xem list
  useEffect(() => {
    let lastY = 0
    const onScroll = (e: Event) => {
      const t = e.target as HTMLElement | null
      if (!t?.classList?.contains('scroll')) return
      const y = t.scrollTop
      const dy = y - lastY
      if (y <= 20) {
        setChromeVisible(true)
      } else if (dy < -3) {
        // kéo lên dù nhẹ
        setChromeVisible(true)
      } else if (dy > 12) {
        setChromeVisible(false)
      }
      lastY = y
    }
    const app = document.querySelector('.app')
    app?.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () =>
      app?.removeEventListener('scroll', onScroll, {
        capture: true,
      } as EventListenerOptions)
  }, [])

  // Đổi màn → luôn hiện menu
  useEffect(() => {
    setChromeVisible(true)
  }, [store.screen])

  // Vuốt từ trái → phải = quay lại (nhạy hơn, không cần kéo mạnh)
  useEffect(() => {
    const MIN_DX = 28 // vuốt nhẹ cũng được
    const MAX_DY_RATIO = 1.2 // |dy| < dx * ratio

    let startX = 0
    let startY = 0
    let startT = 0
    let tracking = false
    let decided = false
    let isHoriz = false
    let edgePx = 64

    const el = document.querySelector('.app') as HTMLElement | null
    if (!el) return

    const edgeZone = () =>
      Math.max(56, Math.min(96, Math.round(window.innerWidth * 0.22)))

    const resetVisual = (animate = true) => {
      if (animate) {
        el.style.transition = 'transform 0.22s cubic-bezier(0.22,1,0.36,1)'
      } else {
        el.style.transition = 'none'
      }
      el.style.transform = ''
      el.style.boxShadow = ''
      if (animate) {
        window.setTimeout(() => {
          el.style.transition = ''
        }, 240)
      } else {
        el.style.transition = ''
      }
    }

    const onStart = (e: Event) => {
      const te = e as TouchEvent
      if (te.touches.length !== 1) return
      const t = te.touches[0]
      edgePx = edgeZone()
      startX = t.clientX
      startY = t.clientY
      startT = Date.now()
      // Bắt từ mép trái rộng (dễ chạm iPhone + PWA)
      tracking = startX <= edgePx
      decided = false
      isHoriz = false
      if (tracking) el.style.transition = 'none'
    }

    const onMove = (e: Event) => {
      if (!tracking) return
      const te = e as TouchEvent
      const t = te.touches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY

      if (!decided) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
        decided = true
        // Ưu tiên ngang khi kéo sang phải rõ
        isHoriz = dx > 4 && Math.abs(dx) >= Math.abs(dy) * 0.85
        if (!isHoriz) {
          tracking = false
          resetVisual(false)
          return
        }
      }

      if (!isHoriz) return

      // Chặn scroll dọc khi đang vuốt back
      if (dx > 0) {
        te.preventDefault()
        const pull = Math.min(dx * 0.72, Math.min(160, window.innerWidth * 0.4))
        el.style.transform = `translate3d(${pull}px,0,0)`
        el.style.boxShadow =
          pull > 6 ? '-6px 0 20px rgba(0,0,0,0.1)' : ''
      }
    }

    const finishBack = () => {
      el.style.transition = 'transform 0.16s ease-out'
      el.style.transform = `translate3d(${Math.min(window.innerWidth, 420)}px,0,0)`
      window.setTimeout(() => {
        const went = useStore.getState().goBack()
        el.style.transition = 'none'
        el.style.transform = ''
        el.style.boxShadow = ''
        if (!went) resetVisual(true)
      }, 140)
    }

    const onEnd = (e: Event) => {
      if (!tracking) return
      tracking = false
      const te = e as TouchEvent
      const t = te.changedTouches[0]
      const dx = t.clientX - startX
      const dy = Math.abs(t.clientY - startY)
      const dt = Math.max(1, Date.now() - startT)
      const velocity = dx / dt // px/ms

      // Vuốt nhẹ OK nếu: đủ xa HOẶC đủ nhanh (flick)
      const farEnough = dx >= MIN_DX && dy < dx * MAX_DY_RATIO + 40
      const flick = velocity > 0.35 && dx > 16 && dy < 80
      const ok = isHoriz && startX <= edgePx && (farEnough || flick)

      if (ok) {
        finishBack()
      } else {
        resetVisual(true)
      }
      isHoriz = false
      decided = false
    }

    const onCancel = () => {
      tracking = false
      isHoriz = false
      decided = false
      resetVisual(true)
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    // passive:false để preventDefault khi vuốt ngang
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onCancel)
      el.style.transform = ''
      el.style.transition = ''
      el.style.boxShadow = ''
    }
  }, [])

  if (!ready) {
    return (
      <div className="app">
        <div className="scroll plain" style={{ textAlign: 'center', paddingTop: 80 }}>
          <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--muted)' }}>
            Đang tải sổ…
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app" data-chrome={chromeVisible ? 'on' : 'off'}>
      <PasswordRecoveryGate />
      <Suspense fallback={<ScreenFallback />}>
        {store.screen === 'onboarding' && <Onboarding />}
        {store.screen === 'home' && (
          <Home
            summary={summary}
            privacy={privacy}
            onSheet={() => setSheet(true)}
            savingsTotal={savingsTotal}
            loansTotal={loansTotal}
          />
        )}
        {store.screen === 'assets' && (
          <Assets summary={summary} privacy={privacy} />
        )}
        {store.screen === 'history' && <History />}
        {store.screen === 'settings' && <Settings />}
        {store.screen === 'gold' && <GoldDetail privacy={privacy} />}
        {store.screen === 'asset-detail' && <AssetDetail privacy={privacy} />}
        {store.screen === 'buy-gold' && <BuyGold />}
        {store.screen === 'sell-gold' && <SellGold />}
        {store.screen === 'usdt' && <UsdtConvert />}
        {store.screen === 'buy-coin' && <BuyCoin />}
        {store.screen === 'sell-coin' && <SellCoin />}
        {store.screen === 'adjust-usdt' && <AdjustUsdt />}
        {store.screen === 'prices' && <Prices />}
        {store.screen === 'cash' && <CashAdjust />}
        {store.screen === 'savings' && <SavingsList privacy={privacy} />}
        {store.screen === 'savings-form' && <SavingsForm />}
        {store.screen === 'savings-detail' && (
          <SavingsDetail privacy={privacy} />
        )}
        {store.screen === 'loans' && <LoansList privacy={privacy} />}
        {store.screen === 'loan-form' && (
          <LoanForm mode="create" key="loan-create" />
        )}
        {store.screen === 'loan-edit' && (
          <LoanForm mode="edit" key={store.detailAssetId || 'loan-edit'} />
        )}
        {store.screen === 'loan-detail' && <LoanDetail privacy={privacy} />}
        {store.screen === 'loans-trash' && <LoansTrash privacy={privacy} />}
        {store.screen === 'spend' && <SpendHome privacy={privacy} />}
        {store.screen === 'spend-form' && <SpendForm />}
        {store.screen === 'spend-detail' && (
          <SpendDetail privacy={privacy} />
        )}
        {store.screen === 'spend-categories' && <SpendCategories />}
        {store.screen === 'spend-budget' && <SpendBudget />}
      </Suspense>

      {showTabs && (
        <nav
          className={`tabbar${chromeVisible ? '' : ' is-away'}`}
          aria-hidden={!chromeVisible}
        >
          <Tab id="home" label="Tài sản" ico="◆" />
          <Tab id="spend" label="Chi tiêu" ico="◈" />
          <button className="fab" onClick={() => setSheet(true)} aria-label="Thêm">
            +
          </button>
          <Tab id="loans" label="Cho vay" ico="◎" />
          <Tab id="settings" label="Cài đặt" ico="⚙" />
        </nav>
      )}

      {sheet && (
        <div className="sheet-bg" onClick={() => setSheet(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            <h3>Thêm giao dịch</h3>
            <div className="group" style={{ marginBottom: 0 }}>
              <Action
                mark="₫"
                cls="cash"
                title="Nạp / rút tiền mặt VND"
                desc="Đưa tiền thật vào sổ trước khi mua USDT / vàng"
                onClick={() => {
                  setSheet(false)
                  store.setScreen('cash')
                }}
              />
              <Action
                mark="U"
                cls="usdt"
                title="Đổi VND ↔ USDT"
                desc="Trừ từ tiền mặt VND trong sổ"
                onClick={() => {
                  setSheet(false)
                  store.setScreen('usdt')
                }}
              />
              <Action
                mark="C"
                cls="coin"
                title="Mua coin bằng USDT"
                desc="Trừ USDT trong sổ · hoặc ghi hold cũ"
                onClick={() => {
                  setSheet(false)
                  store.setScreen('buy-coin')
                }}
              />
              <Action
                mark="N"
                cls="gold"
                title="Mua nhẫn 9999"
                desc="Preset 1 · 2 · 5 chỉ · giá bán ra"
                onClick={() => {
                  setSheet(false)
                  store.setScreen('buy-gold')
                }}
              />
              <Action
                mark="−"
                cls="gold"
                title="Bán nhẫn 9999"
                desc="Theo giá mua vào tiệm"
                onClick={() => {
                  setSheet(false)
                  store.setScreen('sell-gold')
                }}
              />
              <Action
                mark="C"
                cls="coin"
                title="Bán coin lấy USDT"
                desc="Coin → USDT"
                onClick={() => {
                  setSheet(false)
                  store.setScreen('sell-coin')
                }}
              />
              <Action
                mark="U"
                cls="usdt"
                title="Điều chỉnh USDT"
                desc="Cộng / trừ hold USDT (không qua coin)"
                onClick={() => {
                  setSheet(false)
                  store.setScreen('adjust-usdt')
                }}
              />
              <Action
                mark="✎"
                cls="cash"
                title="Cập nhật giá"
                desc="Nhẫn 2 chiều · USDT · Coin"
                onClick={() => {
                  setSheet(false)
                  store.setScreen('prices')
                }}
              />
              <Action
                mark="−"
                cls="cash"
                title="Ghi chi tiêu"
                desc="Ăn uống, hóa đơn, mua sắm…"
                onClick={() => {
                  setSheet(false)
                  store.setScreen('spend-form', 'expense')
                }}
              />
              <Action
                mark="+"
                cls="cash"
                title="Ghi thu nhập"
                desc="Lương, thưởng, thu khác"
                onClick={() => {
                  setSheet(false)
                  store.setScreen('spend-form', 'income')
                }}
              />
              <Action
                mark="S"
                cls="savings"
                title="Gửi tiết kiệm mới"
                desc="Ngân hàng / kỳ hạn"
                onClick={() => {
                  setSheet(false)
                  store.setScreen('savings-form')
                }}
              />
              <Action
                mark="V"
                cls="loan"
                title="Cho vay mới"
                desc="Ghi khoản cho người khác vay"
                onClick={() => {
                  setSheet(false)
                  store.setScreen('loan-form')
                }}
              />
            </div>
            <button className="sheet-cancel" onClick={() => setSheet(false)}>
              Huỷ
            </button>
          </div>
        </div>
      )}

      {store.toast && <div className="toast">{store.toast}</div>}
    </div>
  )
}

