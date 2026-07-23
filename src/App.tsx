import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from './store/useStore'
import {
  computePosition,
  portfolioSummary,
  qtyHoldAt,
  sortedTxs,
} from './lib/calc'
import {
  calcLoanInterest,
  calcLoanInterestPerDay,
  calcLoanOutstandingInterest,
  daysUntil,
  estimateInterest,
  fmtNum,
  fmtPct,
  fmtSignedVnd,
  fmtVnd,
  fromLocalInput,
  loanInterestLabel,
  nowIso,
  toDateInput,
  toLocalInput,
  toRateAnnual,
} from './lib/format'
import type { Loan, LoanInterestType, SavingsAccount, Screen } from './types'
import { MoneyInput, moneyNum } from './components/MoneyInput'
import {
  CloudSyncPanel,
  PasswordRecoveryGate,
  useCloudAutoSync,
} from './components/CloudSync'
import { formatMoneyInput } from './lib/format'
import { cloudReady, getCloudUser } from './lib/cloudSync'
import { useAutoPrices } from './hooks/useAutoPrices'
import { bindBrowserBack } from './lib/appHistory'

function pctClass(n: number | null | undefined) {
  if (n == null || n === 0) return 'flat'
  return n > 0 ? 'up' : 'down'
}

function mask(privacy: boolean, text: string) {
  return privacy ? '••••' : text
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

  const state = {
    assets: store.assets,
    transactions: store.transactions,
    quotes: store.quotes,
    settings: store.settings,
    savings: store.savings,
    loans: store.loans,
    version: store.version,
  }
  const summary = useMemo(() => portfolioSummary(state), [state])
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
      {store.screen === 'assets' && <Assets summary={summary} privacy={privacy} />}
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
      {store.screen === 'savings-detail' && <SavingsDetail privacy={privacy} />}
      {store.screen === 'loans' && <LoansList privacy={privacy} />}
      {store.screen === 'loan-form' && (
        <LoanForm mode="create" key="loan-create" />
      )}
      {store.screen === 'loan-edit' && (
        <LoanForm mode="edit" key={store.detailAssetId || 'loan-edit'} />
      )}
      {store.screen === 'loan-detail' && <LoanDetail privacy={privacy} />}
      {store.screen === 'loans-trash' && <LoansTrash privacy={privacy} />}

      {showTabs && (
        <nav
          className={`tabbar${chromeVisible ? '' : ' is-away'}`}
          aria-hidden={!chromeVisible}
        >
          <Tab id="home" label="Tài sản" ico="◆" />
          <Tab id="savings" label="Tiết kiệm" ico="▣" />
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

function Tab({
  id,
  label,
  ico,
}: {
  id: Screen
  label: string
  ico: string
}) {
  const screen = useStore((s) => s.screen)
  const setScreen = useStore((s) => s.setScreen)
  return (
    <button
      className={`tab ${screen === id ? 'on' : ''}`}
      onClick={() => setScreen(id)}
    >
      <div className="ico">{ico}</div>
      <span>{label}</span>
    </button>
  )
}

function Action({
  mark,
  cls,
  title,
  desc,
  onClick,
}: {
  mark: string
  cls: string
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button className="action" onClick={onClick}>
      <div className={`aico mark ${cls}`}>{mark}</div>
      <div>
        <div className="t">{title}</div>
        <div className="d">{desc}</div>
      </div>
    </button>
  )
}

function Onboarding() {
  const bootstrap = useStore((s) => s.bootstrapHoldings)
  const setScreen = useStore((s) => s.setScreen)
  const [vnd, setVnd] = useState('50000000')
  const [usdt, setUsdt] = useState('0')
  const [usdtAvg, setUsdtAvg] = useState('25650')
  const [gold, setGold] = useState('0')
  const [goldAvg, setGoldAvg] = useState('7850000')

  return (
    <div className="scroll plain">
      <div className="large-title" style={{ paddingTop: 24 }}>
        <h1>Sổ Tài Sản</h1>
        <div className="sub">
          Nhẫn 9999 · USDT · Coin — dữ liệu lưu trên máy bạn
        </div>
      </div>

      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.45 }}>
        Nhập số dư hiện có (có thể để 0). Sau đó ghi từng lần mua/bán. App chạy
        offline trên iPhone khi thêm vào Màn hình chính.
      </p>

      <div className="card">
        <div className="field">
          <label>Tiền mặt VND</label>
          <MoneyInput value={vnd} onChange={setVnd} />
        </div>
        <div className="field">
          <label>USDT đang hold</label>
          <MoneyInput
            value={usdt}
            onChange={setUsdt}
            unit="USDT"
            decimal
            maxFraction={6}
          />
        </div>
        <div className="field">
          <label>Giá vốn USDT (đ/USDT)</label>
          <MoneyInput value={usdtAvg} onChange={setUsdtAvg} unit="đ" />
        </div>
        <div className="field">
          <label>Nhẫn 9999 đang hold</label>
          <MoneyInput
            value={gold}
            onChange={setGold}
            unit="chỉ"
            decimal
            maxFraction={2}
          />
        </div>
        <div className="field">
          <label>Giá vốn nhẫn (đ/chỉ)</label>
          <MoneyInput value={goldAvg} onChange={setGoldAvg} unit="đ/chỉ" />
          <div className="hint">Vàng nhẫn 9999 · ngoài tiệm · 1 loại</div>
        </div>
      </div>

      <button
        className="btn-primary"
        onClick={() =>
          bootstrap({
            vnd: moneyNum(vnd),
            usdt: moneyNum(usdt),
            usdtAvg: moneyNum(usdtAvg) || 25650,
            goldChi: moneyNum(gold),
            goldAvg: moneyNum(goldAvg) || 7850000,
          })
        }
      >
        Bắt đầu dùng
      </button>
      <button
        className="btn-secondary"
        onClick={() => {
          bootstrap({
            vnd: 0,
            usdt: 0,
            usdtAvg: 25650,
            goldChi: 0,
            goldAvg: 7850000,
          })
          setScreen('home')
        }}
      >
        Bỏ qua · sổ trống
      </button>
    </div>
  )
}

function Home({
  summary,
  privacy,
  onSheet,
  savingsTotal,
  loansTotal,
}: {
  summary: ReturnType<typeof portfolioSummary>
  privacy: boolean
  onSheet: () => void
  savingsTotal: number
  loansTotal: number
}) {
  const setScreen = useStore((s) => s.setScreen)
  const updateSettings = useStore((s) => s.updateSettings)
  const showToast = useStore((s) => s.showToast)
  const quotes = useStore((s) => s.quotes)
  const assets = useStore((s) => s.assets)
  const gold = assets.find((a) => a.symbol === 'NHAN9999')
  const goldQ = gold ? quotes[gold.id] : undefined
  const usdt = assets.find((a) => a.symbol === 'USDT')
  const usdtQ = usdt ? quotes[usdt.id] : undefined
  const { buckets, totalValue, totalPnl, totalPnlPct } = summary
  const grandTotal = totalValue + savingsTotal + loansTotal
  const { refresh: refreshPrices, status: priceStatus } = useAutoPrices(false)

  return (
    <div className="scroll">
      <div className="nav">
        <div style={{ minWidth: 64 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="icon-btn"
            disabled={priceStatus === 'loading'}
            onClick={() => {
              void refreshPrices(false).then((live) => {
                if (!live) {
                  showToast('Không lấy được giá')
                  return
                }
                showToast(
                  live.notes[0] ||
                    (live.errors[0] ? live.errors[0] : 'Đã cập nhật giá live'),
                )
              })
            }}
            aria-label="Làm mới giá"
            title="Lấy giá Binance / vàng"
          >
            {priceStatus === 'loading' ? '…' : '↻'}
          </button>
          <button
            className="icon-btn"
            onClick={() => updateSettings({ privacyMode: !privacy })}
            aria-label="Ẩn số"
          >
            {privacy ? '🙈' : '👁'}
          </button>
          <button
            className="icon-btn"
            onClick={() => setScreen('settings')}
            aria-label="Cài đặt"
          >
            ⚙
          </button>
        </div>
      </div>
      <div className="large-title">
        <h1>Tài sản</h1>
        <div className="sub">Tổng quan sổ của bạn</div>
      </div>

      <div className="hero">
        <div className="label">Tổng tài sản</div>
        <div className="total num">
          {mask(privacy, fmtVnd(grandTotal))}
          <small>đ</small>
        </div>
        <div className="hero-grid hero-grid-3">
          <div className="hero-pill">
            <div className="k">Thanh khoản</div>
            <div className="v num">{mask(privacy, fmtVnd(totalValue, true))}</div>
          </div>
          <div className="hero-pill">
            <div className="k">Tiết kiệm</div>
            <div className="v num">{mask(privacy, fmtVnd(savingsTotal, true))}</div>
          </div>
          <div className="hero-pill">
            <div className="k">Cho vay</div>
            <div className="v num">{mask(privacy, fmtVnd(loansTotal, true))}</div>
          </div>
        </div>
        <div className="hero-pnl">
          <span>P/L hold</span>
          <span className={`num ${pctClass(totalPnl)}`}>
            {mask(privacy, `${fmtSignedVnd(totalPnl)} · ${fmtPct(totalPnlPct)}`)}
          </span>
        </div>
      </div>

      <div className="sec">
        <h2>Nhanh</h2>
      </div>
      <div className="quick home-quick">
        <button type="button" onClick={() => setScreen('cash')}>
          <div className="qico" style={{ background: '#ECECEE', color: '#3A3A40' }}>₫</div>
          <span>Nạp VND</span>
        </button>
        <button type="button" onClick={() => setScreen('usdt')}>
          <div className="qico" style={{ background: '#D7F6F3', color: '#0B6E63' }}>↔</div>
          <span>USDT</span>
        </button>
        <button type="button" onClick={() => setScreen('buy-coin')}>
          <div className="qico" style={{ background: '#E5EEFF', color: '#1B4FD8' }}>₵</div>
          <span>Coin</span>
        </button>
        <button type="button" onClick={() => setScreen('buy-gold')}>
          <div className="qico" style={{ background: '#FFF1D6', color: '#9A5B00' }}>+</div>
          <span>Nhẫn</span>
        </button>
      </div>

      <div className="sec">
        <h2>Danh mục</h2>
        <button type="button" onClick={() => setScreen('assets')}>Tất cả</button>
      </div>
      <div className="home-assets">
        <button type="button" className="home-asset" onClick={() => setScreen('gold')}>
          <div className="mark gold">N</div>
          <div className="home-asset-mid">
            <div className="t">Nhẫn 9999</div>
            <div className="d">{mask(privacy, `${fmtNum(buckets.gold.qty, 2)} chỉ`)}</div>
          </div>
          <div className="home-asset-end">
            <div className="amt num">{mask(privacy, fmtVnd(buckets.gold.value, true))}</div>
            <div className={`chip ${pctClass(buckets.gold.pnl)}`}>
              {mask(
                privacy,
                `${fmtSignedVnd(buckets.gold.pnl, true)} · ${fmtPct(buckets.gold.pnlPct)}`,
              )}
            </div>
          </div>
        </button>
        <button
          type="button"
          className="home-asset"
          onClick={() => usdt && setScreen('asset-detail', usdt.id)}
        >
          <div className="mark usdt">U</div>
          <div className="home-asset-mid">
            <div className="t">USDT</div>
            <div className="d">{mask(privacy, fmtNum(buckets.usdt.qty, 2))}</div>
          </div>
          <div className="home-asset-end">
            <div className="amt num">{mask(privacy, fmtVnd(buckets.usdt.value, true))}</div>
            <div className={`chip ${pctClass(buckets.usdt.pnl)}`}>
              {mask(
                privacy,
                `${fmtSignedVnd(buckets.usdt.pnl, true)} · ${fmtPct(buckets.usdt.pnlPct)}`,
              )}
            </div>
          </div>
        </button>
        <button type="button" className="home-asset" onClick={() => setScreen('assets')}>
          <div className="mark coin">C</div>
          <div className="home-asset-mid">
            <div className="t">Coin</div>
            <div className="d">
              {buckets.crypto.positions.filter((p) => p.qtyHold > 0).length} mã
            </div>
          </div>
          <div className="home-asset-end">
            <div className="amt num">{mask(privacy, fmtVnd(buckets.crypto.value, true))}</div>
            <div className={`chip ${pctClass(buckets.crypto.pnl)}`}>
              {mask(
                privacy,
                `${fmtSignedVnd(buckets.crypto.pnl, true)} · ${fmtPct(buckets.crypto.pnlPct)}`,
              )}
            </div>
          </div>
        </button>
        <button type="button" className="home-asset" onClick={() => setScreen('cash')}>
          <div className="mark cash">₫</div>
          <div className="home-asset-mid">
            <div className="t">Tiền mặt</div>
            <div className="d">Nạp / rút</div>
          </div>
          <div className="home-asset-end">
            <div className="amt num">{mask(privacy, fmtVnd(buckets.cash.value, true))}</div>
          </div>
        </button>
        <button type="button" className="home-asset" onClick={() => setScreen('savings')}>
          <div className="mark savings">S</div>
          <div className="home-asset-mid">
            <div className="t">Tiết kiệm</div>
            <div className="d">Ngân hàng</div>
          </div>
          <div className="home-asset-end">
            <div className="amt num">{mask(privacy, fmtVnd(savingsTotal, true))}</div>
          </div>
        </button>
        <button type="button" className="home-asset" onClick={() => setScreen('loans')}>
          <div className="mark loan">V</div>
          <div className="home-asset-mid">
            <div className="t">Cho vay</div>
            <div className="d">Còn phải thu</div>
          </div>
          <div className="home-asset-end">
            <div className="amt num">{mask(privacy, fmtVnd(loansTotal, true))}</div>
          </div>
        </button>
      </div>

      <div className="sec">
        <h2>Giá tham chiếu</h2>
        <button type="button" onClick={() => setScreen('prices')}>Sửa</button>
      </div>
      <div className="group">
        <button type="button" className="row" onClick={() => setScreen('prices')}>
          <div className="body">
            <div className="t">Nhẫn 9999</div>
            <div className="d">
              Mua vào {fmtVnd(goldQ?.priceBid ?? 0)} · Bán ra{' '}
              {fmtVnd(goldQ?.priceAsk ?? 0)}
            </div>
          </div>
          <span className="link-btn">Sửa</span>
        </button>
        <button type="button" className="row" onClick={() => setScreen('prices')}>
          <div className="body">
            <div className="t">USDT OTC</div>
            <div className="d">{usdtQ?.label || 'P2P / tư nhân'}</div>
          </div>
          <div className="end">
            <div className="amt num">{fmtVnd(usdtQ?.price ?? 0)} đ</div>
          </div>
        </button>
      </div>

      <div className="home-links">
        <button type="button" onClick={() => setScreen('history')}>Lịch sử</button>
        <button type="button" onClick={() => setScreen('assets')}>Danh mục chi tiết</button>
      </div>

      {summary.positions.every((p) => p.qtyHold === 0) && (
        <div className="empty" style={{ paddingTop: 28 }}>
          <h3>Chưa có hold</h3>
          <p>Bấm + để ghi mua nhẫn, đổi USDT hoặc mua coin.</p>
          <button className="btn-primary" onClick={onSheet}>
            Thêm giao dịch
          </button>
        </div>
      )}
    </div>
  )
}

function Assets({
  summary,
  privacy,
}: {
  summary: ReturnType<typeof portfolioSummary>
  privacy: boolean
}) {
  const setScreen = useStore((s) => s.setScreen)
  const sections = [
    { title: 'Vàng', items: summary.buckets.gold.positions },
    { title: 'Cầu nối', items: summary.buckets.usdt.positions },
    { title: 'Coin', items: summary.buckets.crypto.positions },
    { title: 'Tiền mặt', items: summary.buckets.cash.positions },
  ]

  return (
    <div className="scroll">
      <div className="large-title" style={{ paddingTop: 8 }}>
        <h1>Danh mục</h1>
      </div>
      {sections.map((sec) => (
        <div key={sec.title}>
          <div className="sec" style={{ marginTop: sec.title === 'Vàng' ? 4 : 18 }}>
            <h2>{sec.title}</h2>
          </div>
          <div className="group">
            {sec.items.length === 0 && (
              <div className="row" style={{ color: 'var(--muted)' }}>
                Chưa có
              </div>
            )}
            {sec.items.map((p) => (
              <button
                key={p.asset.id}
                className="row"
                onClick={() => {
                  if (p.asset.symbol === 'NHAN9999') setScreen('gold')
                  else setScreen('asset-detail', p.asset.id)
                }}
              >
                <div
                  className={`mark ${
                    p.asset.assetClass === 'gold'
                      ? 'gold'
                      : p.asset.assetClass === 'stable'
                        ? 'usdt'
                        : p.asset.assetClass === 'crypto'
                          ? 'coin'
                          : 'cash'
                  }`}
                >
                  {p.asset.symbol.slice(0, 1)}
                </div>
                <div className="body">
                  <div className="t">{p.asset.name}</div>
                  <div className="d">
                    {p.asset.symbol === 'NHAN9999'
                      ? `${fmtNum(p.qtyHold, 2)} chỉ`
                      : p.asset.symbol === 'VND'
                        ? 'Sẵn dùng'
                        : `${fmtNum(p.qtyHold, 6)} ${p.asset.unit}`}
                    {p.avgCost != null && p.asset.symbol !== 'VND'
                      ? ` · TB ${fmtVnd(p.avgCost)}`
                      : ''}
                  </div>
                </div>
                <div className="end">
                  <div className="amt num">
                    {mask(privacy, fmtVnd(p.marketValueVnd, true))}
                  </div>
                  {p.asset.symbol !== 'VND' && p.qtyHold > 0 && (
                    <div
                      className={`d ${pctClass(p.unrealizedPnLVnd)}`}
                      style={{ fontWeight: 700, fontSize: 12 }}
                    >
                      {mask(
                        privacy,
                        `${fmtSignedVnd(p.unrealizedPnLVnd, true)} · ${fmtPct(p.unrealizedPnLPct)}`,
                      )}
                    </div>
                  )}
                </div>
                <span className="chev">›</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function GoldDetail({ privacy }: { privacy: boolean }) {
  const setScreen = useStore((s) => s.setScreen)
  const assets = useStore((s) => s.assets)
  const transactions = useStore((s) => s.transactions)
  const quotes = useStore((s) => s.quotes)
  const settings = useStore((s) => s.settings)
  const gold = assets.find((a) => a.symbol === 'NHAN9999')!
  const pos = computePosition(
    { assets, transactions, quotes, settings, savings: [], loans: [], version: 1 },
    gold.id,
  )
  const q = quotes[gold.id]
  const txs = sortedTxs(transactions.filter((t) => t.assetId === gold.id))

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => setScreen('home')}>
          ‹ Tài sản
        </button>
        <div className="mid">Nhẫn 9999</div>
        <button className="link-btn" onClick={() => setScreen('prices')}>
          Giá
        </button>
      </div>
      <div className="pill">1 loại · ngoài tiệm · đơn vị chỉ</div>
      <div className="stats">
        <div className="stat">
          <div className="k">Đang hold</div>
          <div className="v num">
            {mask(privacy, `${fmtNum(pos.qtyHold, 2)} chỉ`)}
          </div>
        </div>
        <div className="stat">
          <div className="k">Giá vốn TB</div>
          <div className="v num">
            {mask(privacy, pos.avgCost != null ? fmtVnd(pos.avgCost) : '—')}
          </div>
        </div>
        <div className="stat">
          <div className="k">Giá trị (mua vào)</div>
          <div className="v num">
            {mask(privacy, fmtVnd(pos.marketValueVnd))}
          </div>
        </div>
        <div className="stat">
          <div className="k">P/L</div>
          <div className={`v num ${pctClass(pos.unrealizedPnLVnd)}`}>
            {mask(privacy, fmtSignedVnd(pos.unrealizedPnLVnd))}
          </div>
        </div>
      </div>
      <div className="dual">
        <div className="box bid">
          <div className="k">MUA VÀO</div>
          <div className="v num">{fmtVnd(q?.priceBid ?? 0)}</div>
          <div className="d">P/L & khi bán</div>
        </div>
        <div className="box ask">
          <div className="k">BÁN RA</div>
          <div className="v num">{fmtVnd(q?.priceAsk ?? 0)}</div>
          <div className="d">Khi mua thêm</div>
        </div>
      </div>
      <div className="btn-row">
        <button className="btn-primary" onClick={() => setScreen('buy-gold')}>
          Mua chỉ
        </button>
        <button className="btn-secondary" onClick={() => setScreen('sell-gold')}>
          Bán
        </button>
      </div>
      <div className="sec" style={{ marginTop: 4 }}>
        <h2>Lịch sử</h2>
      </div>
      <div className="group">
        {txs.length === 0 && (
          <div className="row" style={{ color: 'var(--muted)' }}>
            Chưa có giao dịch
          </div>
        )}
        {[...txs].reverse().map((t) => (
          <div key={t.id} className="row" style={{ cursor: 'default' }}>
            <div className="body">
              <div className="t">
                {t.side === 'in' ? 'Mua' : 'Bán'} {fmtNum(t.qty, 2)} chỉ
              </div>
              <div className="d">
                {new Date(t.tradedAt).toLocaleDateString('vi-VN')}
                {t.venue ? ` · ${t.venue}` : ''} · @ {fmtVnd(t.pricePerUnit)}
              </div>
            </div>
            <div className="end">
              <div className="amt num">{fmtVnd(t.counterQty, true)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AssetDetail({ privacy }: { privacy: boolean }) {
  const setScreen = useStore((s) => s.setScreen)
  const id = useStore((s) => s.detailAssetId)
  const assets = useStore((s) => s.assets)
  const transactions = useStore((s) => s.transactions)
  const quotes = useStore((s) => s.quotes)
  const settings = useStore((s) => s.settings)
  if (!id) return null
  const asset = assets.find((a) => a.id === id)
  if (!asset) return null
  const pos = computePosition(
    { assets, transactions, quotes, settings, savings: [], loans: [], version: 1 },
    id,
  )
  const txs = sortedTxs(transactions.filter((t) => t.assetId === id))

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => setScreen('assets')}>
          ‹ Danh mục
        </button>
        <div className="mid">{asset.symbol}</div>
        <div style={{ minWidth: 64 }} />
      </div>
      <div className="stats">
        <div className="stat">
          <div className="k">Hold</div>
          <div className="v num">
            {mask(privacy, `${fmtNum(pos.qtyHold, 6)} ${asset.unit}`)}
          </div>
        </div>
        <div className="stat">
          <div className="k">Giá trị VND</div>
          <div className="v num">
            {mask(privacy, fmtVnd(pos.marketValueVnd))}
          </div>
        </div>
        <div className="stat">
          <div className="k">Giá vốn TB</div>
          <div className="v num">
            {mask(privacy, pos.avgCost != null ? fmtNum(pos.avgCost, 2) : '—')}
          </div>
        </div>
        <div className="stat">
          <div className="k">P/L</div>
          <div className={`v num ${pctClass(pos.unrealizedPnLVnd)}`}>
            {mask(privacy, fmtSignedVnd(pos.unrealizedPnLVnd))}
          </div>
        </div>
      </div>
      {asset.symbol === 'VND' && (
        <div className="btn-row">
          <button className="btn-primary" onClick={() => setScreen('cash')}>
            Nạp / rút
          </button>
          <button className="btn-secondary" onClick={() => setScreen('usdt')}>
            Đổi USDT
          </button>
        </div>
      )}
      {asset.symbol === 'USDT' && (
        <>
          <div className="btn-row">
            <button className="btn-primary" onClick={() => setScreen('usdt')}>
              Đổi VND
            </button>
            <button
              className="btn-secondary"
              onClick={() => setScreen('buy-coin')}
            >
              Mua coin
            </button>
          </div>
          <button
            className="btn-secondary"
            onClick={() => setScreen('adjust-usdt')}
          >
            Điều chỉnh hold USDT
          </button>
        </>
      )}
      {asset.assetClass === 'crypto' && (
        <div className="btn-row">
          <button
            className="btn-primary"
            onClick={() => setScreen('buy-coin', asset.id)}
          >
            Mua / hold thêm
          </button>
          <button className="btn-secondary" onClick={() => setScreen('sell-coin')}>
            Bán
          </button>
        </div>
      )}
      <div className="sec">
        <h2>Lịch sử</h2>
      </div>
      <div className="group">
        {[...txs].reverse().map((t) => (
          <div key={t.id} className="row" style={{ cursor: 'default' }}>
            <div className="body">
              <div className="t">
                {t.kind === 'adjust' ? 'Điều chỉnh' : t.side === 'in' ? 'Nhận' : 'Chi'}{' '}
                {fmtNum(t.qty, 6)}
                {t.venue ? ` · ${t.venue}` : ''}
              </div>
              <div className="d">
                {new Date(t.tradedAt).toLocaleString('vi-VN')}
                {t.note ? ` · ${t.note}` : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BuyGold() {
  const tradeGold = useStore((s) => s.tradeGold)
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const gold = useStore((s) => s.assets.find((a) => a.symbol === 'NHAN9999')!)
  const ask = useStore((s) => s.quotes[gold.id]?.priceAsk ?? 7_920_000)
  const [chi, setChi] = useState('1')
  const [preset, setPreset] = useState('1')
  const [price, setPrice] = useState(String(ask))
  const [fee, setFee] = useState('0')
  const [venue, setVenue] = useState('Tiệm')
  const [when, setWhen] = useState(toLocalInput())
  const [err, setErr] = useState('')

  const q = moneyNum(chi)
  const p = moneyNum(price)
  const f = moneyNum(fee)
  const total = q * p + f

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => setScreen('gold')}>
          ‹ Huỷ
        </button>
        <div className="mid">Mua nhẫn</div>
        <div style={{ minWidth: 64 }} />
      </div>
      <div className="asset-fixed">
        <div className="mark gold" style={{ width: 40, height: 40 }}>
          N
        </div>
        <div>
          <div className="t" style={{ fontWeight: 650 }}>
            Vàng nhẫn 9999
          </div>
          <div className="d" style={{ fontSize: 12, color: 'var(--muted)' }}>
            Cố định · không chọn loại khác
          </div>
        </div>
      </div>
      <div className="sec" style={{ marginTop: 4 }}>
        <h2>Số chỉ</h2>
      </div>
      <div className="presets">
        {['1', '2', '5'].map((x) => (
          <button
            key={x}
            type="button"
            className={preset === x ? 'on' : ''}
            onClick={() => {
              setPreset(x)
              setChi(x)
            }}
          >
            {x}
            <small>chỉ</small>
          </button>
        ))}
      </div>
      <div className="card">
        <div className="field">
          <label>Hoặc nhập khác</label>
          <MoneyInput
            value={chi}
            onChange={(v) => {
              setChi(v)
              setPreset('')
            }}
            unit="chỉ"
            decimal
            maxFraction={2}
          />
        </div>
        <div className="field">
          <label>Giá bán ra tiệm</label>
          <MoneyInput value={price} onChange={setPrice} unit="đ/chỉ" />
          <div className="hint">Mua ngoài tiệm = trả giá bán ra</div>
        </div>
        <div className="field">
          <label>Gia công / phí</label>
          <MoneyInput value={fee} onChange={setFee} />
        </div>
        <div className="field">
          <label>Tiệm</label>
          <input
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            style={{ fontSize: 17, fontWeight: 600 }}
          />
        </div>
        <div className="field">
          <label>Thời gian</label>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            style={{ fontSize: 16, fontWeight: 600 }}
          />
        </div>
      </div>
      <div className="summary">
        <div className="r">
          <span>Số chỉ</span>
          <span>
            {q} chỉ
          </span>
        </div>
        <div className="r">
          <span>Đơn giá bán ra</span>
          <span>{fmtVnd(p)}</span>
        </div>
        <div className="r">
          <span>Trừ từ</span>
          <span>Tiền mặt VND</span>
        </div>
        <div className="total">
          <span className="k">Thành tiền</span>
          <span className="v num">{fmtVnd(total)}đ</span>
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      <button
        className="btn-primary"
        onClick={() => {
          const res = tradeGold({
            side: 'buy',
            chi: q,
            pricePerChi: p,
            fee: f,
            tradedAt: fromLocalInput(when),
            venue,
          })
          if (!res.ok) {
            setErr(res.error)
            return
          }
          showToast(`Đã mua ${q} chỉ nhẫn 9999`)
          setScreen('gold')
        }}
      >
        Lưu giao dịch
      </button>
    </div>
  )
}

function SellGold() {
  const tradeGold = useStore((s) => s.tradeGold)
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const state = useStore.getState()
  const gold = state.assets.find((a) => a.symbol === 'NHAN9999')!
  const hold = qtyHoldAt(
    {
      assets: state.assets,
      transactions: state.transactions,
      quotes: state.quotes,
      settings: state.settings,
      savings: [],
      loans: [],
      version: 1,
    },
    gold.id,
  )
  const bid = state.quotes[gold.id]?.priceBid ?? 7_820_000
  const [chi, setChi] = useState('1')
  const [preset, setPreset] = useState('1')
  const [price, setPrice] = useState(String(bid))
  const [when, setWhen] = useState(toLocalInput())
  const [venue, setVenue] = useState('Tiệm')
  const [err, setErr] = useState('')
  const q = moneyNum(chi)
  const p = moneyNum(price)
  const total = q * p

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => setScreen('gold')}>
          ‹ Huỷ
        </button>
        <div className="mid">Bán nhẫn</div>
        <div style={{ minWidth: 64 }} />
      </div>
      <div className="card">
        <div className="field">
          <label>Hold hiện có</label>
          <div className="num" style={{ fontSize: 20, fontWeight: 750 }}>
            {fmtNum(hold, 2)} chỉ
          </div>
        </div>
      </div>
      <div className="presets">
        {['1', '2', '5'].map((x) => (
          <button
            key={x}
            type="button"
            className={preset === x ? 'on' : ''}
            onClick={() => {
              setPreset(x)
              setChi(x)
            }}
          >
            {x}
            <small>chỉ</small>
          </button>
        ))}
      </div>
      <div className="card">
        <div className="field">
          <label>Số chỉ bán</label>
          <MoneyInput
            value={chi}
            onChange={(v) => {
              setChi(v)
              setPreset('')
            }}
            unit="chỉ"
            decimal
            maxFraction={2}
          />
        </div>
        <div className="field">
          <label>Giá mua vào tiệm</label>
          <MoneyInput value={price} onChange={setPrice} unit="đ/chỉ" />
          <div className="hint">Bán lại tiệm = nhận giá mua vào</div>
        </div>
        <div className="field">
          <label>Tiệm</label>
          <input value={venue} onChange={(e) => setVenue(e.target.value)} style={{ fontSize: 17, fontWeight: 600 }} />
        </div>
        <div className="field">
          <label>Thời gian</label>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ fontSize: 16, fontWeight: 600 }} />
        </div>
      </div>
      <div className="summary">
        <div className="r">
          <span>Số chỉ bán</span>
          <span>{q} chỉ</span>
        </div>
        <div className="total">
          <span className="k">Tiền nhận</span>
          <span className="v num">{fmtVnd(total)}đ</span>
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      <button
        className="btn-primary"
        onClick={() => {
          const res = tradeGold({
            side: 'sell',
            chi: q,
            pricePerChi: p,
            tradedAt: fromLocalInput(when),
            venue,
          })
          if (!res.ok) {
            setErr(res.error)
            return
          }
          showToast(`Đã bán ${q} chỉ`)
          setScreen('gold')
        }}
      >
        Lưu giao dịch bán
      </button>
    </div>
  )
}

function CashAdjust() {
  const adjustCash = useStore((s) => s.adjustCash)
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const st = useStore.getState()
  const vnd = st.assets.find((a) => a.symbol === 'VND')!
  const hold = qtyHoldAt(
    {
      assets: st.assets,
      transactions: st.transactions,
      quotes: st.quotes,
      settings: st.settings,
      savings: [],
      loans: [],
      version: 1,
    },
    vnd.id,
  )
  const [side, setSide] = useState<'deposit' | 'withdraw'>('deposit')
  const [amount, setAmount] = useState('10000000')
  const [when, setWhen] = useState(toLocalInput())
  const [venue, setVenue] = useState('Ngân hàng / ví')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const a = moneyNum(amount)

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => setScreen('home')}>
          ‹ Huỷ
        </button>
        <div className="mid">Tiền mặt</div>
        <div style={{ minWidth: 64 }} />
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="field">
          <label>Tiền mặt trong sổ hiện có</label>
          <div className="num" style={{ fontSize: 24, fontWeight: 750 }}>
            {fmtVnd(hold)} đ
          </div>
          <div className="hint">
            Muốn mua USDT hoặc vàng: <b>nạp VND vào sổ trước</b>, rồi mới đổi /
            mua.
          </div>
        </div>
      </div>

      <div className="seg">
        <button
          type="button"
          className={side === 'deposit' ? 'on' : ''}
          onClick={() => setSide('deposit')}
        >
          Nạp vào sổ
        </button>
        <button
          type="button"
          className={side === 'withdraw' ? 'on' : ''}
          onClick={() => setSide('withdraw')}
        >
          Rút ra
        </button>
      </div>

      <div className="card">
        <div className="field">
          <label>Số tiền VND</label>
          <MoneyInput value={amount} onChange={setAmount} />
          <div className="hint">
            {side === 'deposit'
              ? 'Ví dụ: rút 10tr từ bank bỏ vào theo dõi tài sản'
              : 'Rút khỏi sổ (chi tiêu / chuyển bank)'}
          </div>
        </div>
        <div className="field">
          <label>Nguồn / nơi</label>
          <input
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            style={{ fontSize: 17, fontWeight: 600 }}
          />
        </div>
        <div className="field">
          <label>Ghi chú</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Tuỳ chọn"
            style={{ fontSize: 17, fontWeight: 600 }}
          />
        </div>
        <div className="field">
          <label>Thời gian</label>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            style={{ fontSize: 16, fontWeight: 600 }}
          />
        </div>
      </div>

      <div className="summary">
        <div className="r">
          <span>Thao tác</span>
          <span>{side === 'deposit' ? 'Nạp tiền mặt' : 'Rút tiền mặt'}</span>
        </div>
        <div className="r">
          <span>Sau giao dịch</span>
          <span>
            {fmtVnd(side === 'deposit' ? hold + a : Math.max(0, hold - a))} đ
          </span>
        </div>
        <div className="total">
          <span className="k">Số tiền</span>
          <span className="v num">{fmtVnd(a)}đ</span>
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      <button
        className="btn-primary"
        onClick={() => {
          const res = adjustCash({
            side,
            amount: a,
            tradedAt: fromLocalInput(when),
            venue,
            note: note || undefined,
          })
          if (!res.ok) {
            setErr(res.error)
            return
          }
          showToast(
            side === 'deposit'
              ? `Đã nạp ${fmtVnd(a)}đ tiền mặt`
              : `Đã rút ${fmtVnd(a)}đ`,
          )
          setScreen('home')
        }}
      >
        {side === 'deposit' ? 'Lưu nạp tiền mặt' : 'Lưu rút tiền mặt'}
      </button>
      <button className="btn-secondary" onClick={() => setScreen('usdt')}>
        Tiếp: Đổi sang USDT
      </button>
    </div>
  )
}

function UsdtConvert() {
  const convert = useStore((s) => s.convertVndUsdt)
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const defaultRate = useStore((s) => s.settings.defaultUsdtVnd)
  const st = useStore.getState()
  const vndAsset = st.assets.find((a) => a.symbol === 'VND')!
  const cashHold = qtyHoldAt(
    {
      assets: st.assets,
      transactions: st.transactions,
      quotes: st.quotes,
      settings: st.settings,
      savings: [],
      loans: [],
      version: 1,
    },
    vndAsset.id,
  )
  const [dir, setDir] = useState<'vnd_to_usdt' | 'usdt_to_vnd'>('vnd_to_usdt')
  const [qty, setQty] = useState('100')
  const [rate, setRate] = useState(String(defaultRate || 25650))
  const [when, setWhen] = useState(toLocalInput())
  const [venue, setVenue] = useState('P2P')
  const [err, setErr] = useState('')
  const q = moneyNum(qty)
  const r = moneyNum(rate)
  const vnd = q * r
  const needMore = dir === 'vnd_to_usdt' && cashHold < vnd

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => setScreen('home')}>
          ‹ Huỷ
        </button>
        <div className="mid">Đổi USDT</div>
        <div style={{ minWidth: 64 }} />
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="field">
          <label>Tiền mặt VND trong sổ</label>
          <div className="num" style={{ fontSize: 20, fontWeight: 750 }}>
            {fmtVnd(cashHold)} đ
          </div>
          <div className="hint">
            Mua USDT sẽ <b>trừ</b> từ số này. Thiếu tiền?{' '}
            <button
              type="button"
              className="link-btn"
              style={{ minWidth: 0, display: 'inline', padding: 0 }}
              onClick={() => setScreen('cash')}
            >
              Nạp tiền mặt
            </button>
          </div>
        </div>
      </div>

      <div className="seg">
        <button
          type="button"
          className={dir === 'vnd_to_usdt' ? 'on' : ''}
          onClick={() => setDir('vnd_to_usdt')}
        >
          VND → USDT
        </button>
        <button
          type="button"
          className={dir === 'usdt_to_vnd' ? 'on' : ''}
          onClick={() => setDir('usdt_to_vnd')}
        >
          USDT → VND
        </button>
      </div>
      <div className="card">
        <div className="field">
          <label>Số USDT</label>
          <MoneyInput
            value={qty}
            onChange={setQty}
            unit="USDT"
            decimal
            maxFraction={6}
          />
        </div>
        <div className="field">
          <label>Giá OTC</label>
          <MoneyInput value={rate} onChange={setRate} unit="đ" />
          <div className="hint">Giá tư nhân / P2P, không phải USD bank</div>
        </div>
        <div className="field">
          <label>Nơi đổi</label>
          <input value={venue} onChange={(e) => setVenue(e.target.value)} style={{ fontSize: 17, fontWeight: 600 }} />
        </div>
        <div className="field">
          <label>Thời gian</label>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ fontSize: 16, fontWeight: 600 }} />
        </div>
      </div>
      <div className="summary">
        <div className="r">
          <span>Chiều</span>
          <span>{dir === 'vnd_to_usdt' ? 'Mua USDT' : 'Bán USDT lấy VND'}</span>
        </div>
        <div className="r">
          <span>Cần / nhận VND</span>
          <span>{fmtVnd(vnd)} đ</span>
        </div>
        <div className="total">
          <span className="k">Tiền VND</span>
          <span className="v num">{fmtVnd(vnd)}đ</span>
        </div>
      </div>
      {needMore && (
        <div className="error">
          Thiếu {fmtVnd(vnd - cashHold)}đ tiền mặt.{' '}
          <button
            type="button"
            className="link-btn"
            style={{ minWidth: 0, display: 'inline', padding: 0, color: 'var(--brand)' }}
            onClick={() => setScreen('cash')}
          >
            Nạp VND trước →
          </button>
        </div>
      )}
      {err && <div className="error">{err}</div>}
      <button
        className="btn-primary"
        onClick={() => {
          const res = convert({
            direction: dir,
            usdtQty: q,
            rateVnd: r,
            tradedAt: fromLocalInput(when),
            venue,
          })
          if (!res.ok) {
            setErr(res.error)
            return
          }
          showToast('Đã ghi đổi VND ↔ USDT')
          setScreen('home')
        }}
      >
        Lưu giao dịch
      </button>
    </div>
  )
}

function BuyCoin() {
  const buyCoin = useStore((s) => s.buyCoin)
  const assets = useStore((s) => s.assets)
  const detailAssetId = useStore((s) => s.detailAssetId)
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const cryptos = assets.filter((a) => a.assetClass === 'crypto')
  const prefilled = detailAssetId
    ? assets.find((a) => a.id === detailAssetId && a.assetClass === 'crypto')
    : undefined
  const [symbol, setSymbol] = useState(
    prefilled?.symbol || cryptos[0]?.symbol || 'BTC',
  )
  const [custom, setCustom] = useState('')
  const [qty, setQty] = useState('0.01')
  const [usdt, setUsdt] = useState('950')
  const [when, setWhen] = useState(toLocalInput())
  const [venue, setVenue] = useState('Sàn')
  /** true = coin mua từ trước / hold sẵn — không trừ USDT hiện tại */
  const [oldHold, setOldHold] = useState(false)
  const [err, setErr] = useState('')
  const q = moneyNum(qty)
  const u = moneyNum(usdt)
  const px = q > 0 && u > 0 ? u / q : 0
  const sym = custom.trim() || symbol

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => setScreen('home')}>
          ‹ Huỷ
        </button>
        <div className="mid">{oldHold ? 'Ghi coin cũ' : 'Mua coin'}</div>
        <div style={{ minWidth: 64 }} />
      </div>
      <div className="card">
        <label className="check-row" style={{ padding: '4px 0 12px', borderBottom: '1px solid var(--line)', marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={oldHold}
            onChange={(e) => {
              const on = e.target.checked
              setOldHold(on)
              if (on) {
                setVenue((v) => (v === 'Sàn' ? 'Hold cũ' : v))
                // Giá vốn có thể 0 nếu không nhớ — không bắt buộc
              } else {
                setVenue((v) => (v === 'Hold cũ' ? 'Sàn' : v))
              }
              setErr('')
            }}
          />
          <span>
            <b>Không trừ USDT hiện tại</b>
            <br />
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
              Coin mua từ trước / hold sẵn — chỉ ghi số lượng &amp; giá vốn để
              tính P/L, không đụng số dư USDT trong sổ
            </span>
          </span>
        </label>
        <div className="field">
          <label>Coin</label>
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            <option value="BTC">BTC · Bitcoin</option>
            <option value="ETH">ETH · Ethereum</option>
            {cryptos
              .filter((c) => !['BTC', 'ETH'].includes(c.symbol))
              .map((c) => (
                <option key={c.id} value={c.symbol}>
                  {c.symbol} · {c.name}
                </option>
              ))}
            <option value="__new">+ Coin khác…</option>
          </select>
        </div>
        {symbol === '__new' && (
          <div className="field">
            <label>Mã coin mới</label>
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value.toUpperCase())}
              placeholder="SOL"
              style={{ fontSize: 17, fontWeight: 650 }}
            />
          </div>
        )}
        <div className="field">
          <label>Số lượng</label>
          <MoneyInput
            value={qty}
            onChange={setQty}
            unit=""
            decimal
            maxFraction={8}
          />
        </div>
        <div className="field">
          <label>{oldHold ? 'Giá vốn USDT (tuỳ chọn)' : 'USDT bỏ ra'}</label>
          <MoneyInput
            value={usdt}
            onChange={setUsdt}
            unit="USDT"
            decimal
            maxFraction={4}
          />
          <div className="hint">
            {oldHold
              ? u > 0
                ? `Giá vốn ≈ ${fmtNum(px, 2)} USDT/coin · dùng để tính P/L (0 nếu không nhớ)`
                : 'Để 0 nếu không nhớ giá vốn — hold vẫn ghi, P/L tạm ẩn'
              : `Chỉ trả bằng USDT · Giá ≈ ${fmtNum(px, 2)} USDT`}
          </div>
        </div>
        <div className="field">
          <label>Sàn / nơi</label>
          <input value={venue} onChange={(e) => setVenue(e.target.value)} style={{ fontSize: 17, fontWeight: 600 }} />
        </div>
        <div className="field">
          <label>Thời gian</label>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ fontSize: 16, fontWeight: 600 }} />
        </div>
      </div>
      <div className="summary">
        <div className="r">
          <span>USDT trong sổ</span>
          <span style={{ fontWeight: 700, color: oldHold ? 'var(--green-ink)' : undefined }}>
            {oldHold ? 'Không trừ' : 'Trừ khi lưu'}
          </span>
        </div>
        <div className="r">
          <span>{oldHold ? 'Giá vốn ghi' : 'Trả bằng'}</span>
          <span>{oldHold ? `${fmtNum(u, 2)} USDT` : 'USDT'}</span>
        </div>
        <div className="total">
          <span className="k">{oldHold ? 'Hold thêm' : 'USDT chi'}</span>
          <span className="v num">
            {oldHold ? `${fmtNum(q, 6)} ${sym}` : fmtNum(u, 2)}
          </span>
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      <button
        className="btn-primary"
        onClick={() => {
          if (symbol === '__new' && !custom.trim()) {
            setErr('Nhập mã coin')
            return
          }
          const res = buyCoin({
            symbol: sym,
            qty: moneyNum(qty),
            usdtSpent: moneyNum(usdt),
            tradedAt: fromLocalInput(when),
            venue,
            deductUsdt: !oldHold,
            note: oldHold
              ? 'Hold sẵn / mua từ trước — không trừ USDT hiện tại'
              : undefined,
          })
          if (!res.ok) {
            setErr(res.error)
            return
          }
          showToast(
            oldHold
              ? `Đã ghi hold ${sym} (không trừ USDT)`
              : `Đã mua ${sym}`,
          )
          setScreen('home')
        }}
      >
        {oldHold ? 'Lưu hold coin (không trừ USDT)' : 'Lưu mua coin'}
      </button>
    </div>
  )
}

/** Cộng / trừ số dư USDT độc lập (sửa hold, không qua mua coin) */
function AdjustUsdt() {
  const adjustUsdtHold = useStore((s) => s.adjustUsdtHold)
  const assets = useStore((s) => s.assets)
  const transactions = useStore((s) => s.transactions)
  const quotes = useStore((s) => s.quotes)
  const settings = useStore((s) => s.settings)
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const usdtAsset = assets.find((a) => a.symbol === 'USDT')
  const hold = usdtAsset
    ? qtyHoldAt(
        {
          assets,
          transactions,
          quotes,
          settings,
          savings: [],
          loans: [],
          version: 1,
        },
        usdtAsset.id,
      )
    : 0
  const [side, setSide] = useState<'in' | 'out'>('in')
  const [qty, setQty] = useState('')
  const [when, setWhen] = useState(toLocalInput())
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const q = moneyNum(qty)

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => setScreen('home')}>
          ‹ Huỷ
        </button>
        <div className="mid">Điều chỉnh USDT</div>
        <div style={{ minWidth: 64 }} />
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="field">
          <label>USDT đang hold trong sổ</label>
          <div className="num" style={{ fontSize: 24, fontWeight: 750 }}>
            {fmtNum(hold, 4)} USDT
          </div>
          <div className="hint">
            Dùng khi nạp USDT ngoài app, sửa lệch số, hoặc coin cũ không nên trừ
            USDT. <b>Không</b> ghi mua coin tại đây.
          </div>
        </div>
      </div>

      <div className="seg">
        <button
          type="button"
          className={side === 'in' ? 'on' : ''}
          onClick={() => setSide('in')}
        >
          Cộng USDT
        </button>
        <button
          type="button"
          className={side === 'out' ? 'on' : ''}
          onClick={() => setSide('out')}
        >
          Trừ USDT
        </button>
      </div>

      <div className="card">
        <div className="field">
          <label>Số USDT</label>
          <MoneyInput
            value={qty}
            onChange={setQty}
            unit="USDT"
            decimal
            maxFraction={6}
          />
        </div>
        <div className="field">
          <label>Ghi chú</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="VD: nạp sàn / sửa lệch / coin cũ"
            style={{ fontSize: 17, fontWeight: 600 }}
          />
        </div>
        <div className="field">
          <label>Thời gian</label>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            style={{ fontSize: 16, fontWeight: 600 }}
          />
        </div>
      </div>

      <div className="summary">
        <div className="r">
          <span>Thao tác</span>
          <span>{side === 'in' ? 'Cộng hold' : 'Trừ hold'}</span>
        </div>
        <div className="r">
          <span>Sau điều chỉnh</span>
          <span className="num">
            {fmtNum(side === 'in' ? hold + q : Math.max(0, hold - q), 4)} USDT
          </span>
        </div>
        <div className="total">
          <span className="k">Số USDT</span>
          <span className="v num">{fmtNum(q, 4)}</span>
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      <button
        className="btn-primary"
        onClick={() => {
          const res = adjustUsdtHold({
            side,
            qty: q,
            tradedAt: fromLocalInput(when),
            note: note || undefined,
          })
          if (!res.ok) {
            setErr(res.error)
            return
          }
          showToast(
            side === 'in'
              ? `Đã cộng ${fmtNum(q, 4)} USDT`
              : `Đã trừ ${fmtNum(q, 4)} USDT`,
          )
          setScreen('home')
        }}
      >
        {side === 'in' ? 'Lưu cộng USDT' : 'Lưu trừ USDT'}
      </button>
      <button className="btn-secondary" onClick={() => setScreen('buy-coin')}>
        Ghi coin cũ (không trừ USDT)
      </button>
    </div>
  )
}

function SellCoin() {
  const sellCoin = useStore((s) => s.sellCoin)
  const assets = useStore((s) => s.assets)
  const transactions = useStore((s) => s.transactions)
  const quotes = useStore((s) => s.quotes)
  const settings = useStore((s) => s.settings)
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const cryptos = assets.filter((a) => a.assetClass === 'crypto')
  const [assetId, setAssetId] = useState(cryptos[0]?.id || '')
  const [qty, setQty] = useState('')
  const [usdt, setUsdt] = useState('')
  const [when, setWhen] = useState(toLocalInput())
  const [err, setErr] = useState('')

  const hold = assetId
    ? qtyHoldAt(
        { assets, transactions, quotes, settings, savings: [], loans: [], version: 1 },
        assetId,
      )
    : 0

  if (cryptos.length === 0) {
    return (
      <div className="scroll plain">
        <div className="nav">
          <button className="back" onClick={() => setScreen('home')}>
            ‹ Huỷ
          </button>
          <div className="mid">Bán coin</div>
          <div style={{ minWidth: 64 }} />
        </div>
        <div className="empty">
          <h3>Chưa có coin</h3>
          <p>Hãy mua coin bằng USDT trước.</p>
          <button className="btn-primary" onClick={() => setScreen('buy-coin')}>
            Mua coin
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => setScreen('home')}>
          ‹ Huỷ
        </button>
        <div className="mid">Bán coin</div>
        <div style={{ minWidth: 64 }} />
      </div>
      <div className="card">
        <div className="field">
          <label>Coin</label>
          <select
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
          >
            {cryptos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.symbol} · {c.name}
              </option>
            ))}
          </select>
          <div className="hint">Hold: {fmtNum(hold, 6)}</div>
        </div>
        <div className="field">
          <label>Số lượng bán</label>
          <MoneyInput value={qty} onChange={setQty} unit="" decimal maxFraction={8} />
        </div>
        <div className="field">
          <label>USDT nhận</label>
          <MoneyInput value={usdt} onChange={setUsdt} unit="USDT" decimal maxFraction={4} />
        </div>
        <div className="field">
          <label>Thời gian</label>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ fontSize: 16, fontWeight: 600 }} />
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      <button
        className="btn-primary"
        onClick={() => {
          const res = sellCoin({
            assetId,
            qty: moneyNum(qty),
            usdtReceived: moneyNum(usdt),
            tradedAt: fromLocalInput(when),
          })
          if (!res.ok) {
            setErr(res.error)
            return
          }
          showToast('Đã bán coin lấy USDT')
          setScreen('home')
        }}
      >
        Lưu giao dịch bán
      </button>
    </div>
  )
}

function Prices() {
  const setQuote = useStore((s) => s.setQuote)
  const updateSettings = useStore((s) => s.updateSettings)
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const assets = useStore((s) => s.assets)
  const quotes = useStore((s) => s.quotes)
  const gold = assets.find((a) => a.symbol === 'NHAN9999')!
  const usdt = assets.find((a) => a.symbol === 'USDT')!
  const cryptos = assets.filter((a) => a.assetClass === 'crypto')
  const settings = useStore((s) => s.settings)
  const { refresh, status: autoStatus } = useAutoPrices(false)

  const [bid, setBid] = useState(String(quotes[gold.id]?.priceBid ?? 7820000))
  const [ask, setAsk] = useState(String(quotes[gold.id]?.priceAsk ?? 7920000))
  const [label, setLabel] = useState(quotes[gold.id]?.label || 'Tiệm')
  const [usdtP, setUsdtP] = useState(String(quotes[usdt.id]?.price ?? 25650))
  const [coinPrices, setCoinPrices] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    cryptos.forEach((c) => {
      m[c.id] = String(quotes[c.id]?.price ?? '')
    })
    return m
  })
  const [fetching, setFetching] = useState(false)

  // Sync form khi quotes store đổi (sau auto fetch)
  useEffect(() => {
    const g = quotes[gold.id]
    const u = quotes[usdt.id]
    if (g?.priceBid != null) setBid(String(g.priceBid))
    if (g?.priceAsk != null) setAsk(String(g.priceAsk))
    if (g?.label) setLabel(g.label)
    if (u?.price != null) setUsdtP(String(u.price))
    setCoinPrices((m) => {
      const next = { ...m }
      cryptos.forEach((c) => {
        if (quotes[c.id]?.price != null) next[c.id] = String(quotes[c.id]!.price)
      })
      return next
    })
  }, [quotes, gold.id, usdt.id, cryptos])

  async function pullLive(includeGoldInStore: boolean) {
    setFetching(true)
    try {
      // Coin + USDT luôn ghi store; vàng chỉ ghi store nếu bật auto hoặc user chọn
      const live = await refresh(false, {
        forceGold: includeGoldInStore || !!settings.autoGoldPrice,
      })
      if (!live) {
        showToast('Không lấy được giá — kiểm tra mạng')
        return
      }
      if (live.usdtVnd) setUsdtP(String(live.usdtVnd))
      // Form vàng: luôn điền ước lượng để xem / Lưu tay
      if (live.goldBid) setBid(String(live.goldBid))
      if (live.goldAsk) setAsk(String(live.goldAsk))
      if (live.goldLabel) setLabel(live.goldLabel)
      setCoinPrices((m) => {
        const next = { ...m }
        cryptos.forEach((c) => {
          const p = live.coins[c.symbol.toUpperCase()]
          if (p) next[c.id] = String(p)
        })
        return next
      })
      const parts = [
        live.usdtVnd
          ? `USDT ${live.usdtVnd.toLocaleString('vi-VN')}đ`
          : null,
        Object.keys(live.coins).length
          ? `Coin ${Object.keys(live.coins).length} mã`
          : null,
        includeGoldInStore || settings.autoGoldPrice
          ? 'Đã áp giá vàng ước'
          : live.goldBid
            ? 'Vàng điền form (chưa ghi sổ — bấm Lưu giá)'
            : null,
      ].filter(Boolean)
      showToast(parts.join(' · ') || live.errors[0] || 'Đã lấy giá live')
    } finally {
      setFetching(false)
    }
  }

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => setScreen('home')}>
          ‹ Huỷ
        </button>
        <div className="mid">Cập nhật giá</div>
        <div style={{ minWidth: 64 }} />
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ padding: 14, fontSize: 13, lineHeight: 1.45 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Tự động giá
          </div>
          <div style={{ color: 'var(--muted)' }}>
            <b>Coin + USDT</b> luôn auto Binance (~3 phút).{' '}
            <b>Vàng nhẫn</b> mặc định <b>không auto</b> — giữ giá tiệm/tay, tránh
            P/L lệch.
          </div>
        </div>
        <div className="switch-row">
          <div>
            <div style={{ fontWeight: 650 }}>Auto giá vàng (ước XAU)</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Bật thì mỗi lần refresh ghi đè giá nhẫn
            </div>
          </div>
          <button
            className="btn-secondary"
            type="button"
            style={{ width: 'auto', margin: 0, padding: '8px 14px', fontSize: 14 }}
            onClick={() =>
              updateSettings({ autoGoldPrice: !settings.autoGoldPrice })
            }
          >
            {settings.autoGoldPrice ? 'Đang bật' : 'Tắt'}
          </button>
        </div>
        <div style={{ padding: '0 14px 14px', display: 'grid', gap: 8 }}>
          <button
            className="btn-primary"
            type="button"
            disabled={fetching || autoStatus === 'loading'}
            onClick={() => void pullLive(false)}
          >
            {fetching ? 'Đang lấy giá…' : 'Lấy coin + USDT live'}
          </button>
          <button
            className="btn-secondary"
            type="button"
            style={{ margin: 0 }}
            disabled={fetching || autoStatus === 'loading'}
            onClick={() => void pullLive(true)}
          >
            Lấy + áp giá vàng ước vào sổ
          </button>
        </div>
      </div>

      <div className="sec" style={{ marginTop: 4 }}>
        <h2>Nhẫn 9999 · 2 chiều</h2>
      </div>
      <div className="card">
        <div className="field">
          <label>Mua vào (đ/chỉ)</label>
          <MoneyInput value={bid} onChange={setBid} unit="đ/chỉ" />
          <div className="hint">Tiệm mua lại · dùng cho P/L hold</div>
        </div>
        <div className="field">
          <label>Bán ra (đ/chỉ)</label>
          <MoneyInput value={ask} onChange={setAsk} unit="đ/chỉ" />
        </div>
        <div className="field">
          <label>Tiệm / nguồn</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} style={{ fontSize: 17, fontWeight: 600 }} />
        </div>
      </div>
      <div className="sec">
        <h2>USDT · Binance</h2>
      </div>
      <div className="card">
        <div className="field">
          <label>VND / 1 USDT</label>
          <MoneyInput value={usdtP} onChange={setUsdtP} unit="đ" />
          <div className="hint">Mặc định lấy Binance P2P · có thể sửa tay</div>
        </div>
      </div>
      {cryptos.length > 0 && (
        <>
          <div className="sec">
            <h2>Coin · Binance (USDT)</h2>
          </div>
          <div className="card">
            {cryptos.map((c) => (
              <div className="field" key={c.id}>
                <label>{c.symbol}</label>
                <MoneyInput
                  value={coinPrices[c.id] ?? ''}
                  onChange={(v) =>
                    setCoinPrices((m) => ({ ...m, [c.id]: v }))
                  }
                  unit="USDT"
                  decimal
                  maxFraction={4}
                />
              </div>
            ))}
          </div>
        </>
      )}
      <button
        className="btn-primary"
        onClick={() => {
          const t = nowIso()
          setQuote({
            assetId: gold.id,
            price: moneyNum(bid),
            priceBid: moneyNum(bid),
            priceAsk: moneyNum(ask),
            currency: 'VND',
            label,
            quotedAt: t,
          })
          setQuote({
            assetId: usdt.id,
            price: moneyNum(usdtP),
            currency: 'VND',
            label: 'Binance',
            quotedAt: t,
          })
          updateSettings({ defaultUsdtVnd: moneyNum(usdtP) || 25650 })
          cryptos.forEach((c) => {
            const p = moneyNum(coinPrices[c.id] ?? 0)
            if (p > 0) {
              setQuote({
                assetId: c.id,
                price: p,
                currency: 'USDT',
                label: 'Binance',
                quotedAt: t,
              })
            }
          })
          showToast('Đã cập nhật giá')
          setScreen('home')
        }}
      >
        Lưu giá
      </button>
    </div>
  )
}

function History() {
  const transactions = useStore((s) => s.transactions)
  const assets = useStore((s) => s.assets)
  const deleteTransaction = useStore((s) => s.deleteTransaction)
  const updateTransactionNote = useStore((s) => s.updateTransactionNote)
  const findPairIds = useStore((s) => s.findPairIds)
  const showToast = useStore((s) => s.showToast)
  const byId = Object.fromEntries(assets.map((a) => [a.id, a]))

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [filter, setFilter] = useState<'all' | 'buy' | 'sell' | 'convert' | 'adjust'>(
    'all',
  )

  // de-dupe pair: 1 dòng / cặp — ưu tiên leg không phải VND
  const shown = useMemo(() => {
    const sorted = [...transactions].sort((a, b) => {
      const t = b.tradedAt.localeCompare(a.tradedAt)
      if (t !== 0) return t
      return b.createdAt.localeCompare(a.createdAt)
    })
    const seenPair = new Set<string>()
    const out: typeof sorted = []
    for (const t of sorted) {
      if (t.pairId) {
        if (seenPair.has(t.pairId)) continue
        // chọn leg "chính" trong cặp
        const mates = sorted.filter((x) => x.pairId === t.pairId)
        const primary =
          mates.find((x) => x.assetId !== 'asset-vnd') ||
          mates.find((x) => x.side === 'in') ||
          mates[0]!
        seenPair.add(t.pairId)
        out.push(primary)
        continue
      }
      // cũ: ẩn leg VND của pair không có pairId
      if (t.assetId === 'asset-vnd' && t.kind !== 'adjust') {
        const hasMate = sorted.some(
          (x) =>
            x.id !== t.id &&
            x.tradedAt === t.tradedAt &&
            x.kind === t.kind &&
            x.assetId === t.counterAssetId,
        )
        if (hasMate) continue
      }
      out.push(t)
    }
    if (filter === 'all') return out
    return out.filter((t) => t.kind === filter)
  }, [transactions, filter])

  const selected = selectedId
    ? transactions.find((t) => t.id === selectedId)
    : null
  const pairCount = selectedId ? findPairIds(selectedId).length : 0

  useEffect(() => {
    if (selected) setNoteDraft(selected.note || '')
  }, [selected?.id, selected?.note])

  function kindLabel(t: (typeof transactions)[0]) {
    if (t.kind === 'adjust') return 'Điều chỉnh'
    if (t.kind === 'convert') return t.side === 'in' ? 'Đổi · nhận' : 'Đổi · chi'
    if (t.kind === 'buy') return t.side === 'in' ? 'Mua' : 'Chi (mua)'
    if (t.kind === 'sell') return t.side === 'out' ? 'Bán' : 'Nhận (bán)'
    return t.side === 'in' ? 'Nhận' : 'Chi'
  }

  return (
    <div className="scroll">
      <div className="large-title" style={{ paddingTop: 8 }}>
        <h1>Lịch sử</h1>
        <div className="sub">Bấm dòng để sửa ghi chú / xóa an toàn</div>
      </div>

      <div
        className="seg"
        style={{
          margin: '0 0 12px',
          gridTemplateColumns: 'repeat(5, 1fr)',
        }}
      >
        {(
          [
            ['all', 'Tất cả'],
            ['buy', 'Mua'],
            ['sell', 'Bán'],
            ['convert', 'Đổi'],
            ['adjust', 'Điều chỉnh'],
          ] as const
        ).map(([k, lab]) => (
          <button
            key={k}
            type="button"
            className={filter === k ? 'on' : ''}
            onClick={() => setFilter(k)}
            style={{ fontSize: 11, padding: '8px 4px' }}
          >
            {lab}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <h3>Chưa có giao dịch</h3>
          <p>Mọi lần mua nhẫn, đổi USDT, mua coin sẽ hiện ở đây.</p>
        </div>
      ) : (
        <div className="group">
          {shown.map((t) => {
            const a = byId[t.assetId]
            return (
              <button
                key={t.id}
                type="button"
                className="row"
                onClick={() => setSelectedId(t.id)}
              >
                <div className="body">
                  <div className="t">
                    {kindLabel(t)} · {a?.symbol || '?'} · {fmtNum(t.qty, 6)}
                  </div>
                  <div className="d">
                    {new Date(t.tradedAt).toLocaleString('vi-VN')}
                    {t.venue ? ` · ${t.venue}` : ''}
                    {t.note ? ` · ${t.note}` : ''}
                  </div>
                </div>
                <div className="end">
                  <div className={`amt num ${t.side === 'out' ? 'down' : ''}`}>
                    {t.priceCurrency === 'VND'
                      ? fmtVnd(t.qty * t.pricePerUnit, true)
                      : `${fmtNum(t.counterQty || t.qty * t.pricePerUnit, 2)} U`}
                  </div>
                </div>
                <span className="chev">›</span>
              </button>
            )
          })}
        </div>
      )}

      {selected && (
        <div className="sheet-bg" onClick={() => setSelectedId(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            <h3>
              {kindLabel(selected)} · {byId[selected.assetId]?.symbol || '?'}
            </h3>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              {new Date(selected.tradedAt).toLocaleString('vi-VN')}
              {selected.venue ? ` · ${selected.venue}` : ''}
              {pairCount > 1 ? ` · ${pairCount} leg (xóa cả cặp)` : ''}
            </div>
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="switch-row">
                <span>Số lượng</span>
                <span className="num" style={{ fontWeight: 700 }}>
                  {fmtNum(selected.qty, 6)} {byId[selected.assetId]?.unit}
                </span>
              </div>
              <div className="switch-row">
                <span>Giá / đơn vị</span>
                <span className="num" style={{ fontWeight: 700 }}>
                  {selected.priceCurrency === 'VND'
                    ? `${fmtVnd(selected.pricePerUnit)} đ`
                    : `${fmtNum(selected.pricePerUnit, 4)} USDT`}
                </span>
              </div>
              {selected.counterQty > 0 && (
                <div className="switch-row">
                  <span>Đối ứng</span>
                  <span className="num" style={{ fontWeight: 700 }}>
                    {fmtNum(selected.counterQty, 4)}{' '}
                    {byId[selected.counterAssetId]?.symbol || ''}
                  </span>
                </div>
              )}
            </div>
            <div className="field">
              <label>Ghi chú</label>
              <input
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Tuỳ chọn"
                style={{ fontSize: 16, fontWeight: 600 }}
              />
            </div>
            <button
              className="btn-primary"
              type="button"
              onClick={() => {
                const res = updateTransactionNote(selected.id, noteDraft)
                if (!res.ok) {
                  showToast(res.error)
                  return
                }
                showToast('Đã lưu ghi chú')
                setSelectedId(null)
              }}
            >
              Lưu ghi chú
            </button>
            <button
              className="btn-secondary"
              type="button"
              style={{
                marginTop: 8,
                color: 'var(--down)',
                borderColor: 'rgba(255,59,48,0.35)',
              }}
              onClick={() => {
                if (
                  !confirm(
                    pairCount > 1
                      ? `Xóa giao dịch này và ${pairCount - 1} leg cặp?\nHold/P/L sẽ tính lại. Bản an toàn sẽ được chụp.`
                      : 'Xóa giao dịch này? Hold/P/L sẽ tính lại. Bản an toàn sẽ được chụp.',
                  )
                ) {
                  return
                }
                const res = deleteTransaction(selected.id)
                if (!res.ok) {
                  showToast(res.error)
                  return
                }
                showToast(
                  res.removed > 1
                    ? `Đã xóa ${res.removed} leg (cặp an toàn)`
                    : 'Đã xóa giao dịch',
                )
                setSelectedId(null)
              }}
            >
              Xóa giao dịch{pairCount > 1 ? ` (${pairCount} leg)` : ''}
            </button>
            <button
              className="sheet-cancel"
              type="button"
              onClick={() => setSelectedId(null)}
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Settings() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const exportJson = useStore((s) => s.exportJson)
  const importJson = useStore((s) => s.importJson)
  const resetAll = useStore((s) => s.resetAll)
  const listSafetyBackups = useStore((s) => s.listSafetyBackups)
  const restoreSafetyBackup = useStore((s) => s.restoreSafetyBackup)
  const saveSafetyBackup = useStore((s) => s.saveSafetyBackup)
  const showToast = useStore((s) => s.showToast)
  const setScreen = useStore((s) => s.setScreen)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [importing, setImporting] = useState(false)
  const [safetyOpen, setSafetyOpen] = useState(false)
  const [safetyTick, setSafetyTick] = useState(0)
  const safetyList = useMemo(() => {
    void safetyTick
    return listSafetyBackups()
  }, [listSafetyBackups, safetyTick])

  function applyImport(text: string): boolean {
    const trimmed = text.trim()
    if (!trimmed) {
      showToast('Chưa có nội dung JSON')
      return false
    }
    // Debug nhẹ: độ dài text dán (iOS hay cắt dở)
    if (trimmed.length < 20) {
      showToast('Nội dung quá ngắn — copy lại TOÀN BỘ file JSON')
      return false
    }
    try {
      const res = importJson(trimmed)
      if (!res.ok) {
        showToast(res.error)
        return false
      }
      const s = useStore.getState()
      showToast(
        res.message ||
          `Import OK · TK ${s.savings.length} · Vay ${s.loans.length}`,
      )
      setPasteText('')
      setPasteOpen(false)
      // Nhảy thẳng dashboard
      useStore.setState({ screen: 'home' })
      return true
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Import lỗi')
      return false
    }
  }

  async function onPickFile(file: File | null | undefined) {
    if (!file) {
      showToast('Không chọn được file — thử Dán JSON')
      return
    }
    showToast(`Đang đọc: ${file.name}`)
    setImporting(true)
    try {
      let text = ''
      try {
        text = await file.text()
      } catch {
        text = await new Promise<string>((resolve, reject) => {
          const r = new FileReader()
          r.onload = () => resolve(String(r.result || ''))
          r.onerror = () => reject(new Error('Đọc file thất bại'))
          r.readAsText(file)
        })
      }
      applyImport(text)
    } catch {
      showToast('Không đọc được file. Mở Dán JSON bên dưới.')
      setPasteOpen(true)
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function doExport() {
    const raw = exportJson()
    const name = `so-tai-san-${new Date().toISOString().slice(0, 10)}.json`
    const blob = new Blob([raw], { type: 'application/json' })
    const file = new File([blob], name, { type: 'application/json' })

    // iOS Safari / PWA: Web Share API (file) là cách ổn nhất
    try {
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean
        share?: (data: ShareData) => Promise<void>
      }
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: 'Sổ Tài Sản backup' })
        showToast('Đã mở chia sẻ backup')
        return
      }
      if (nav.share) {
        await nav.share({ title: 'Sổ Tài Sản backup', text: raw })
        showToast('Đã mở chia sẻ (text)')
        return
      }
    } catch {
      // user cancel share — ignore
    }

    try {
      await navigator.clipboard.writeText(raw)
      showToast('Đã copy JSON vào clipboard')
      return
    } catch {
      /* fallthrough */
    }

    // Desktop fallback
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    showToast('Đã tải / mở file backup')
  }

  return (
    <div className="scroll">
      <div className="large-title" style={{ paddingTop: 8 }}>
        <h1>Cài đặt</h1>
        <div className="sub">Tùy chọn & dữ liệu</div>
      </div>

      <div className="sec" style={{ marginTop: 4 }}>
        <h2>Hiển thị</h2>
      </div>
      <div className="card">
        <div className="switch-row">
          <div>
            <div style={{ fontWeight: 650 }}>Ẩn số</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Che số trên dashboard
            </div>
          </div>
          <button
            className="btn-secondary"
            style={{ width: 'auto', margin: 0, padding: '8px 14px', fontSize: 14 }}
            onClick={() =>
              updateSettings({ privacyMode: !settings.privacyMode })
            }
          >
            {settings.privacyMode ? 'Đang bật' : 'Tắt'}
          </button>
        </div>
        <div className="switch-row">
          <div>
            <div style={{ fontWeight: 650 }}>Giá vốn</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Phương pháp tính
            </div>
          </div>
          <span style={{ fontWeight: 700 }}>AVG</span>
        </div>
        <div className="switch-row">
          <div>
            <div style={{ fontWeight: 650 }}>Coin mua bằng USDT</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              VND → USDT → Coin
            </div>
          </div>
          <span style={{ fontWeight: 700, color: 'var(--green-ink)' }}>Bật</span>
        </div>
        <div className="switch-row">
          <div>
            <div style={{ fontWeight: 650 }}>Auto giá vàng</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Ước XAU → đ/chỉ (mặc định tắt, giữ giá tiệm)
            </div>
          </div>
          <button
            className="btn-secondary"
            style={{ width: 'auto', margin: 0, padding: '8px 14px', fontSize: 14 }}
            onClick={() =>
              updateSettings({ autoGoldPrice: !settings.autoGoldPrice })
            }
          >
            {settings.autoGoldPrice ? 'Đang bật' : 'Tắt'}
          </button>
        </div>
      </div>

      <div className="sec">
        <h2>Cloud · đồng bộ máy</h2>
      </div>
      <CloudSyncPanel />

      <div className="sec">
        <h2>Sao lưu & khôi phục</h2>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json,text/plain,text/*,*/*"
        className="file-input-hidden"
        onChange={(e) => {
          void onPickFile(e.target.files?.[0])
        }}
      />
      <div className="card">
        <button className="row" type="button" onClick={() => void doExport()}>
          <div className="body">
            <div className="t">Export backup</div>
            <div className="d">Chia sẻ / copy file JSON</div>
          </div>
          <span className="chev">›</span>
        </button>
        <label className="row file-label-row">
          <div className="body">
            <div className="t">
              {importing ? 'Đang import…' : 'Import từ file'}
            </div>
            <div className="d">Sổ Tài Sản hoặc QuanLyTaiChinh</div>
          </div>
          <span className="chev">›</span>
          <input
            type="file"
            accept=".json,application/json,text/plain,text/*,*/*"
            className="file-input-overlay"
            disabled={importing}
            onChange={(e) => {
              void onPickFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        <button
          className="row"
          type="button"
          onClick={() => setPasteOpen((v) => !v)}
        >
          <div className="body">
            <div className="t">Dán JSON</div>
            <div className="d">Copy file → dán vào đây</div>
          </div>
          <span className="chev">{pasteOpen ? '˄' : '›'}</span>
        </button>
        <button
          className="row"
          type="button"
          onClick={() => {
            const id = saveSafetyBackup('manual')
            setSafetyTick((n) => n + 1)
            showToast(
              id
                ? 'Đã chụp bản an toàn trên máy'
                : 'Sổ trống — không cần chụp',
            )
          }}
        >
          <div className="body">
            <div className="t">Chụp bản an toàn ngay</div>
            <div className="d">Giữ trên máy (tối đa 5 bản)</div>
          </div>
          <span className="chev">›</span>
        </button>
        <button
          className="row"
          type="button"
          onClick={() => {
            setSafetyOpen((v) => !v)
            setSafetyTick((n) => n + 1)
          }}
        >
          <div className="body">
            <div className="t">Sao lưu an toàn ({safetyList.length})</div>
            <div className="d">
              Tự chụp trước import / kéo cloud / xóa sổ
            </div>
          </div>
          <span className="chev">{safetyOpen ? '˄' : '›'}</span>
        </button>
      </div>

      {safetyOpen && (
        <div className="card" style={{ marginTop: 10 }}>
          {safetyList.length === 0 ? (
            <div style={{ padding: 14, color: 'var(--muted)', fontSize: 13 }}>
              Chưa có bản an toàn. Sẽ tự tạo khi import, kéo cloud hoặc xóa sổ.
            </div>
          ) : (
            safetyList.map((b) => (
              <div key={b.id} className="switch-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 650, fontSize: 14 }}>{b.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {new Date(b.createdAt).toLocaleString('vi-VN')}
                    {' · '}
                    {b.tx} GD · {b.savings} TK · {b.loans} vay
                  </div>
                </div>
                <button
                  className="btn-secondary"
                  type="button"
                  style={{
                    width: 'auto',
                    margin: 0,
                    padding: '8px 12px',
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                  onClick={() => {
                    if (
                      !confirm(
                        `Khôi phục bản ${b.label}?\nSổ hiện tại sẽ được chụp lại trước khi ghi đè.`,
                      )
                    ) {
                      return
                    }
                    const res = restoreSafetyBackup(b.id)
                    setSafetyTick((n) => n + 1)
                    if (!res.ok) {
                      showToast(res.error)
                      return
                    }
                    showToast(res.message)
                    setScreen('home')
                  }}
                >
                  Khôi phục
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {pasteOpen && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="field">
            <label>Nội dung JSON</label>
            <textarea
              className="paste-area"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Dán toàn bộ JSON backup…"
              rows={7}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <div style={{ padding: '0 14px 14px', display: 'grid', gap: 8 }}>
            <button
              className="btn-primary"
              type="button"
              disabled={importing || !pasteText.trim()}
              onClick={() => {
                setImporting(true)
                try {
                  applyImport(pasteText)
                } finally {
                  setImporting(false)
                }
              }}
            >
              {importing ? 'Đang import…' : 'Import'}
            </button>
            <button
              className="btn-secondary"
              type="button"
              style={{ margin: 0 }}
              onClick={async () => {
                try {
                  const t = await navigator.clipboard.readText()
                  if (!t) {
                    showToast('Clipboard trống')
                    return
                  }
                  setPasteText(t)
                  showToast('Đã dán từ clipboard')
                } catch {
                  showToast('Giữ để dán thủ công')
                }
              }}
            >
              Dán từ clipboard
            </button>
          </div>
        </div>
      )}

      <div className="sec">
        <h2>Điều hướng</h2>
      </div>
      <div className="card">
        <button className="row" type="button" onClick={() => setScreen('assets')}>
          <div className="body">
            <div className="t">Danh mục vàng / coin</div>
          </div>
          <span className="chev">›</span>
        </button>
        <button className="row" type="button" onClick={() => setScreen('history')}>
          <div className="body">
            <div className="t">Lịch sử giao dịch</div>
          </div>
          <span className="chev">›</span>
        </button>
        <button
          className="row"
          type="button"
          onClick={() => setScreen('prices')}
        >
          <div className="body">
            <div className="t">Cập nhật giá thị trường</div>
          </div>
          <span className="chev">›</span>
        </button>
      </div>

      <div className="sec">
        <h2>Nguy hiểm</h2>
      </div>
      <div className="card">
        <button
          className="row"
          type="button"
          onClick={() => {
            if (
              confirm(
                'Xoá toàn bộ dữ liệu trên máy này?\nSổ hiện tại sẽ được chụp vào Sao lưu an toàn (nếu còn data).',
              )
            ) {
              resetAll()
              setSafetyTick((n) => n + 1)
              showToast('Đã reset · xem Sao lưu an toàn để khôi phục')
            }
          }}
        >
          <div className="body">
            <div className="t" style={{ color: 'var(--down)' }}>
              Xoá toàn bộ dữ liệu
            </div>
            <div className="d">Có bản an toàn trên máy trước khi xóa</div>
          </div>
        </button>
      </div>
    </div>
  )
}

/* ========== TIẾT KIỆM ========== */

function SavingsList({ privacy }: { privacy: boolean }) {
  const savings = useStore((s) => s.savings)
  const setScreen = useStore((s) => s.setScreen)
  const active = savings
    .filter((s) => s.status === 'active' && s.principal > 0)
    .slice()
    .sort((a, b) => {
      const da = daysUntil(a.maturityDate)
      const db = daysUntil(b.maturityDate)
      if (da == null && db == null) return b.principal - a.principal
      if (da == null) return 1
      if (db == null) return -1
      return da - db
    })
  const total = active.reduce((a, s) => a + s.principal, 0)
  const totalInterest = active.reduce(
    (a, s) => a + estimateInterest(s.principal, s.rateAnnual, s.startDate),
    0,
  )
  const soon = active.filter((s) => {
    const d = daysUntil(s.maturityDate)
    return d != null && d >= 0 && d <= 30
  }).length

  return (
    <div className="scroll">
      <div className="large-title" style={{ paddingTop: 8 }}>
        <h1>Tiết kiệm</h1>
        <div className="sub">Sổ gửi ngân hàng đang mở</div>
      </div>

      <div className="sav-hero">
        <div className="sav-hero-label">Tổng gốc đang gửi</div>
        <div className="sav-hero-total num">
          {mask(privacy, fmtVnd(total))}
          <small>đ</small>
        </div>
        <div className="sav-hero-grid">
          <div>
            <div className="k">Số khoản</div>
            <div className="v num">{active.length}</div>
          </div>
          <div>
            <div className="k">Lãi ước tính</div>
            <div className="v num up">
              +{mask(privacy, fmtVnd(totalInterest, true))}
            </div>
          </div>
          <div>
            <div className="k">Sắp đáo hạn</div>
            <div className="v num">{soon > 0 ? `${soon} khoản` : '—'}</div>
          </div>
        </div>
      </div>

      <button
        className="btn-primary"
        style={{ marginBottom: 14 }}
        onClick={() => setScreen('savings-form')}
      >
        + Gửi tiết kiệm mới
      </button>

      {active.length === 0 ? (
        <div className="empty">
          <h3>Chưa có khoản đang gửi</h3>
          <p>Thêm sổ tiết kiệm ngân hàng để theo dõi gốc, lãi và đáo hạn.</p>
        </div>
      ) : (
        <div className="sav-list">
          {active.map((s) => (
            <SavingsRow key={s.id} s={s} privacy={privacy} />
          ))}
        </div>
      )}
    </div>
  )
}

function SavingsRow({
  s,
  privacy,
}: {
  s: SavingsAccount
  privacy: boolean
}) {
  const setScreen = useStore((s) => s.setScreen)
  const interest = estimateInterest(s.principal, s.rateAnnual, s.startDate)
  const due = daysUntil(s.maturityDate)
  const termDays =
    s.startDate && s.maturityDate
      ? Math.max(
          1,
          Math.round(
            (new Date(s.maturityDate).getTime() -
              new Date(s.startDate).getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : null
  const elapsed =
    s.startDate && termDays
      ? Math.min(
          1,
          Math.max(
            0,
            (Date.now() - new Date(s.startDate).getTime()) /
              (1000 * 60 * 60 * 24) /
              termDays,
          ),
        )
      : null
  const pct = elapsed != null ? Math.round(elapsed * 100) : null
  const urgent = due != null && due <= 30
  const overdue = due != null && due < 0

  return (
    <button
      type="button"
      className={`sav-card ${urgent ? 'sav-card-warn' : ''} ${overdue ? 'sav-card-over' : ''}`}
      onClick={() => setScreen('savings-detail', s.id)}
    >
      <div className="sav-card-top">
        <div className="sav-bank-badge">{s.bank.slice(0, 2).toUpperCase()}</div>
        <div className="sav-card-mid">
          <div className="sav-card-name">{s.name}</div>
          <div className="sav-card-meta">
            {s.bank}
            {s.rateAnnual > 0 ? ` · ${fmtNum(s.rateAnnual, 2)}%/năm` : ''}
          </div>
        </div>
        <div className="sav-card-amt">
          <div className="num">{mask(privacy, fmtVnd(s.principal))}</div>
          <div className="unit">đ</div>
        </div>
      </div>

      <div className="sav-card-bottom">
        <div className="sav-interest up">
          Lãi ~{mask(privacy, fmtVnd(interest))}đ
        </div>
        <div
          className={`sav-due ${overdue ? 'over' : urgent ? 'warn' : ''}`}
        >
          {due == null
            ? 'Không kỳ hạn'
            : overdue
              ? `Quá hạn ${-due} ngày`
              : due === 0
                ? 'Đáo hạn hôm nay'
                : `Còn ${due} ngày`}
        </div>
      </div>

      {pct != null && (
        <div className="sav-progress">
          <div className="sav-progress-bar" style={{ width: `${pct}%` }} />
        </div>
      )}
    </button>
  )
}

function SavingsForm() {
  const addSavings = useStore((s) => s.addSavings)
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const [name, setName] = useState('Sổ tiết kiệm')
  const [bank, setBank] = useState('')
  const [principal, setPrincipal] = useState('50000000')
  const [rate, setRate] = useState('5.5')
  const [start, setStart] = useState(toDateInput(nowIso()))
  const [term, setTerm] = useState('6')
  const [noTerm, setNoTerm] = useState(false)
  const [linkedCash, setLinkedCash] = useState(true)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  const maturity = (() => {
    if (noTerm || !term) return null
    const d = new Date(start + 'T12:00:00')
    d.setMonth(d.getMonth() + (Number(term) || 0))
    return d.toISOString()
  })()

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => setScreen('savings')}>
          ‹ Huỷ
        </button>
        <div className="mid">Gửi tiết kiệm</div>
        <div style={{ minWidth: 64 }} />
      </div>

      <div className="card">
        <div className="field">
          <label>Tên khoản</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ fontSize: 17, fontWeight: 600 }}
          />
        </div>
        <div className="field">
          <label>Ngân hàng</label>
          <input
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            placeholder="VCB, ACB, MB…"
            style={{ fontSize: 17, fontWeight: 600 }}
          />
        </div>
        <div className="field">
          <label>Số tiền gửi</label>
          <MoneyInput value={principal} onChange={setPrincipal} />
        </div>
        <div className="field">
          <label>Lãi suất %/năm</label>
          <div className="inline">
            <input
              className="num"
              type="text"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))}
            />
            <span className="unit">%</span>
          </div>
        </div>
        <div className="field">
          <label>Ngày gửi</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            style={{ fontSize: 16, fontWeight: 600 }}
          />
        </div>
        <div className="field">
          <label>Kỳ hạn (tháng)</label>
          <div className="inline">
            <input
              className="num"
              type="text"
              inputMode="numeric"
              value={term}
              disabled={noTerm}
              onChange={(e) => setTerm(e.target.value.replace(/\D/g, ''))}
            />
            <span className="unit">th</span>
          </div>
          {maturity && !noTerm && (
            <div className="hint">
              Đáo hạn ước tính:{' '}
              {new Date(maturity).toLocaleDateString('vi-VN')}
            </div>
          )}
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={noTerm}
            onChange={(e) => setNoTerm(e.target.checked)}
          />
          <span>Không kỳ hạn</span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={linkedCash}
            onChange={(e) => setLinkedCash(e.target.checked)}
          />
          <span>
            Trừ từ <b>tiền mặt VND</b> trong sổ (cần nạp VND trước nếu bật)
          </span>
        </label>
        <div className="field">
          <label>Ghi chú</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ fontSize: 16, fontWeight: 600 }}
          />
        </div>
      </div>

      <div className="summary">
        <div className="r">
          <span>Số tiền gửi</span>
          <span>{formatMoneyInput(principal) || '0'} đ</span>
        </div>
        <div className="total">
          <span className="k">Ghi nhận</span>
          <span className="v num">{formatMoneyInput(principal) || '0'}đ</span>
        </div>
      </div>

      {err && <div className="error">{err}</div>}
      <button
        className="btn-primary"
        onClick={() => {
          const res = addSavings({
            name,
            bank,
            principal: moneyNum(principal),
            rateAnnual: Number(rate) || 0,
            startDate: new Date(start + 'T12:00:00').toISOString(),
            maturityDate: noTerm ? null : maturity,
            termMonths: noTerm ? null : Number(term) || null,
            note: note || undefined,
            linkedCash,
          })
          if (!res.ok) {
            setErr(res.error)
            return
          }
          showToast('Đã thêm tiết kiệm')
          setScreen('savings-detail', res.id)
        }}
      >
        Lưu khoản tiết kiệm
      </button>
    </div>
  )
}

function SavingsDetail({ privacy }: { privacy: boolean }) {
  const id = useStore((s) => s.detailAssetId)
  const savings = useStore((s) => s.savings)
  const setScreen = useStore((s) => s.setScreen)
  const closeSavings = useStore((s) => s.closeSavings)
  const deleteSavings = useStore((s) => s.deleteSavings)
  const showToast = useStore((s) => s.showToast)
  const s = savings.find((x) => x.id === id)
  const [closeAmt, setCloseAmt] = useState('')
  const [closeTouched, setCloseTouched] = useState(false)
  const [linkCash, setLinkCash] = useState(false)
  const [err, setErr] = useState('')

  if (!s) {
    return (
      <div className="scroll plain">
        <button className="back" onClick={() => setScreen('savings')}>
          ‹ Tiết kiệm
        </button>
        <div className="empty">
          <h3>Không tìm thấy</h3>
        </div>
      </div>
    )
  }

  const interest = estimateInterest(
    s.principal,
    s.rateAnnual,
    s.startDate,
    s.status === 'closed' ? s.updatedAt : undefined,
  )
  const suggestClose = Math.round(s.principal + interest)
  const closeDisplay = closeTouched
    ? closeAmt
    : String(suggestClose)
  const due = daysUntil(s.maturityDate)

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => setScreen('savings')}>
          ‹ Tiết kiệm
        </button>
        <div className="mid">{s.name}</div>
        <div style={{ minWidth: 64 }} />
      </div>

      <div className="sav-detail-hero">
        <div className="pill sav-status-pill">
          {s.status === 'active' ? 'Đang gửi' : 'Đã tất toán'} · {s.bank}
        </div>
        <div className="k">Gốc</div>
        <div className="big num">
          {mask(privacy, fmtVnd(s.principal))}
          <small>đ</small>
        </div>
        <div className="sav-detail-row">
          <div>
            <div className="k">Lãi suất</div>
            <div className="v num">{fmtNum(s.rateAnnual, 2)}%/năm</div>
          </div>
          <div>
            <div className="k">Lãi ước tính</div>
            <div className="v num up">+{mask(privacy, fmtVnd(interest))}đ</div>
          </div>
          <div>
            <div className="k">Đáo hạn</div>
            <div className="v">
              {s.maturityDate
                ? new Date(s.maturityDate).toLocaleDateString('vi-VN')
                : 'KKH'}
            </div>
          </div>
        </div>
        {due != null && (
          <div className={`sav-due-banner ${due <= 30 ? 'warn' : ''} ${due < 0 ? 'over' : ''}`}>
            {due < 0
              ? `Đã quá hạn ${-due} ngày`
              : due === 0
                ? 'Đáo hạn hôm nay'
                : `Còn ${due} ngày đến đáo hạn`}
          </div>
        )}
      </div>

      {s.note && (
        <div className="card">
          <div className="field">
            <label>Ghi chú</label>
            <div style={{ fontSize: 15 }}>{s.note}</div>
          </div>
        </div>
      )}

      {s.status === 'active' && (
        <>
          <div className="sec">
            <h2>Tất toán</h2>
          </div>
          <div className="card">
            <div className="field">
              <label>Số nhận về (gốc + lãi)</label>
              <MoneyInput
                value={closeDisplay}
                onChange={(digits) => {
                  setCloseTouched(true)
                  setCloseAmt(digits)
                }}
              />
              <div className="hint">
                Gợi ý gốc + lãi ước:{' '}
                <b>{fmtVnd(suggestClose)} đ</b>
              </div>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={linkCash}
                onChange={(e) => setLinkCash(e.target.checked)}
              />
              <span>Cộng vào tiền mặt VND trong sổ</span>
            </label>
          </div>

          <div className="summary">
            <div className="r">
              <span>Gốc</span>
              <span>{fmtVnd(s.principal)} đ</span>
            </div>
            <div className="r">
              <span>Lãi ước</span>
              <span>+{fmtVnd(interest)} đ</span>
            </div>
            <div className="total">
              <span className="k">Nhận về</span>
              <span className="v num">
                {formatMoneyInput(closeDisplay) || '0'}đ
              </span>
            </div>
          </div>

          <button
            className="btn-primary"
            onClick={() => {
              const amountBack = moneyNum(closeDisplay) || suggestClose
              const res = closeSavings({
                id: s.id,
                amountBack,
                linkedCash: linkCash,
                tradedAt: nowIso(),
              })
              if (!res.ok) {
                setErr(res.error)
                return
              }
              showToast('Đã tất toán')
              setScreen('savings')
            }}
          >
            Tất toán khoản này
          </button>
        </>
      )}

      {err && <div className="error">{err}</div>}
      <button
        className="btn-secondary"
        style={{ color: 'var(--down)', marginTop: 16 }}
        onClick={() => {
          if (confirm('Xoá khoản tiết kiệm này khỏi sổ?')) {
            deleteSavings(s.id)
            showToast('Đã xoá')
            setScreen('savings')
          }
        }}
      >
        Xoá khỏi sổ
      </button>
    </div>
  )
}

/* ========== CHO VAY ========== */

function LoansList({ privacy }: { privacy: boolean }) {
  const loans = useStore((s) => s.loans)
  const setScreen = useStore((s) => s.setScreen)
  const trashCount = loans.filter((l) => l.deletedAt).length
  const open = loans
    .filter(
      (l) =>
        !l.deletedAt &&
        (l.status === 'open' || l.status === 'partial') &&
        l.remaining > 0,
    )
    .slice()
    .sort((a, b) => b.remaining - a.remaining)
  const total = open.reduce((a, l) => a + l.remaining, 0)
  const principalSum = open.reduce((a, l) => a + l.principal, 0)
  const collected = principalSum - total
  const overdueN = open.filter((l) => {
    const d = daysUntil(l.dueDate)
    return d != null && d < 0
  }).length
  const accrued = open.reduce(
    (a, l) => a + calcLoanOutstandingInterest(l).outstanding,
    0,
  )

  return (
    <div className="scroll">
      <div className="large-title" style={{ paddingTop: 8 }}>
        <h1>Cho vay</h1>
        <div className="sub">Khoản còn phải thu</div>
      </div>

      <div className="loan-hero">
        <div className="loan-hero-label">Tổng còn thu</div>
        <div className="loan-hero-total num">
          {mask(privacy, fmtVnd(total))}
          <small>đ</small>
        </div>
        <div className="loan-hero-grid">
          <div>
            <div className="k">Số khoản</div>
            <div className="v num">{open.length}</div>
          </div>
          <div>
            <div className="k">Đã thu (gốc)</div>
            <div className="v num">
              {mask(privacy, fmtVnd(Math.max(0, collected), true))}
            </div>
          </div>
          <div>
            <div className="k">Lãi tạm tính</div>
            <div className="v num">
              {mask(privacy, fmtVnd(accrued, true))}
            </div>
          </div>
        </div>
        {overdueN > 0 && (
          <div className="loan-due-banner over" style={{ marginTop: 12 }}>
            {overdueN} khoản đang trễ hạn
          </div>
        )}
      </div>

      <div className="btn-row" style={{ marginBottom: 14 }}>
        <button
          className="btn-primary"
          style={{ margin: 0 }}
          onClick={() => setScreen('loan-form')}
        >
          + Cho vay mới
        </button>
        <button
          className="btn-secondary"
          style={{ margin: 0 }}
          onClick={() => setScreen('loans-trash')}
        >
          Thùng rác{trashCount ? ` (${trashCount})` : ''}
        </button>
      </div>

      {open.length === 0 ? (
        <div className="empty">
          <h3>Không còn khoản đang vay</h3>
          <p>Chỉ hiện khoản còn phải thu. Đã xóa nằm trong Thùng rác.</p>
        </div>
      ) : (
        <div className="loan-list">
          {open.map((l) => (
            <LoanRow key={l.id} l={l} privacy={privacy} />
          ))}
        </div>
      )}
    </div>
  )
}

function LoanRow({ l, privacy }: { l: Loan; privacy: boolean }) {
  const setScreen = useStore((s) => s.setScreen)
  const due = daysUntil(l.dueDate)
  const paidPct =
    l.principal > 0
      ? Math.round(((l.principal - l.remaining) / l.principal) * 100)
      : 0
  const initials = l.borrower
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 2) || 'V'
  const overdue = due != null && due < 0
  const urgent = due != null && due >= 0 && due <= 7

  return (
    <button
      type="button"
      className={`loan-card ${urgent ? 'loan-card-warn' : ''} ${overdue ? 'loan-card-over' : ''}`}
      onClick={() => setScreen('loan-detail', l.id)}
    >
      <div className="loan-card-top">
        <div className="loan-avatar">{initials}</div>
        <div className="loan-card-mid">
          <div className="loan-card-name">{l.borrower}</div>
          <div className="loan-card-meta">
            {l.status === 'partial' ? 'Thu một phần' : 'Đang vay'}
            {' · '}
            {loanInterestLabel({
              rateAnnual: l.rateAnnual,
              interestType: l.interestType,
              interestValue: l.interestValue,
            })}
            {l.phone ? ` · ${l.phone}` : ''}
          </div>
        </div>
        <div className="loan-card-amt">
          <div className="num">{mask(privacy, fmtVnd(l.remaining))}</div>
          <div className="unit">còn thu</div>
        </div>
      </div>
      <div className="loan-card-bottom">
        <div className="loan-orig">
          Gốc {mask(privacy, fmtVnd(l.principal, true))}
          {paidPct > 0 ? ` · đã thu ${paidPct}%` : ''}
        </div>
        <div className={`loan-due ${overdue ? 'over' : urgent ? 'warn' : ''}`}>
          {due == null
            ? 'Không hẹn hạn'
            : overdue
              ? `Trễ ${-due} ngày`
              : due === 0
                ? 'Hẹn hôm nay'
                : `Còn ${due} ngày`}
        </div>
      </div>
      {l.principal > 0 && (
        <div className="loan-progress">
          <div
            className="loan-progress-bar"
            style={{ width: `${Math.min(100, paidPct)}%` }}
          />
        </div>
      )}
    </button>
  )
}

function LoanForm({ mode }: { mode: 'create' | 'edit' }) {
  const addLoan = useStore((s) => s.addLoan)
  const updateLoan = useStore((s) => s.updateLoan)
  const goBack = useStore((s) => s.goBack)
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const detailId = useStore((s) => s.detailAssetId)
  const existing = useStore((s) =>
    mode === 'edit' ? s.loans.find((x) => x.id === detailId) : undefined,
  )

  const [borrower, setBorrower] = useState(existing?.borrower || '')
  const [phone, setPhone] = useState(existing?.phone || '')
  const [principal, setPrincipal] = useState(
    String(existing?.principal ?? 5000000),
  )
  const [remaining, setRemaining] = useState(
    String(existing?.remaining ?? existing?.principal ?? 5000000),
  )
  // 3 kiểu lãi chính: %/tháng | đ/1tr/ngày | cố định/tháng
  const initType: LoanInterestType =
    existing?.interestType === 'per_million_daily' ||
    existing?.interestType === 'flat_monthly' ||
    existing?.interestType === 'percent_monthly'
      ? existing.interestType
      : existing?.interestType === 'annual' && (existing.rateAnnual || 0) > 0
        ? 'percent_monthly' // annual cũ → nhập lại %/tháng (rateAnnual/12)
        : 'percent_monthly'

  const [interestType, setInterestType] =
    useState<LoanInterestType>(initType)
  const defaultVal =
    existing?.interestValue != null && existing.interestValue > 0
      ? String(existing.interestValue)
      : existing?.interestType === 'annual' && existing.rateAnnual
        ? String(Math.round((existing.rateAnnual / 12) * 100) / 100)
        : interestType === 'per_million_daily'
          ? '1000'
          : interestType === 'flat_monthly'
            ? '1300000'
            : '1.5'
  const [interestVal, setInterestVal] = useState(defaultVal)
  const [lendDate, setLendDate] = useState(
    toDateInput(existing?.lendDate || nowIso()),
  )
  const [dueDate, setDueDate] = useState(
    existing?.dueDate ? toDateInput(existing.dueDate) : '',
  )
  const [linkedCash, setLinkedCash] = useState(
    mode === 'create' ? false : !!existing?.linkedCash,
  )
  const [note, setNote] = useState(existing?.note || '')
  const [err, setErr] = useState('')

  const pNum = moneyNum(principal)
  const remNum = mode === 'edit' ? moneyNum(remaining) : pNum
  const vNum = moneyNum(interestVal)
  const previewDay = calcLoanInterestPerDay({
    remaining: remNum || pNum,
    rateAnnual: toRateAnnual(interestType, vNum),
    interestType,
    interestValue: vNum,
  })
  const previewMonth =
    interestType === 'flat_monthly'
      ? vNum
      : interestType === 'percent_monthly'
        ? (remNum || pNum) * (vNum / 100)
        : interestType === 'per_million_daily'
          ? ((remNum || pNum) / 1_000_000) * vNum * 30
          : previewDay * 30

  function pickType(t: LoanInterestType) {
    setInterestType(t)
    if (t === 'percent_monthly' && (!interestVal || interestVal === '0'))
      setInterestVal('1.5')
    if (t === 'per_million_daily' && (!interestVal || interestVal === '0'))
      setInterestVal('1000')
    if (t === 'flat_monthly' && (!interestVal || interestVal === '0'))
      setInterestVal('1300000')
  }

  function buildInterestFields() {
    const val = moneyNum(interestVal)
    return {
      interestType,
      interestValue: val,
      rateAnnual: toRateAnnual(interestType, val),
    }
  }

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => goBack()}>
          ‹ Huỷ
        </button>
        <div className="mid">
          {mode === 'edit' ? 'Sửa khoản vay' : 'Cho vay mới'}
        </div>
        <div style={{ minWidth: 64 }} />
      </div>

      <div className="card">
        <div className="field">
          <label>Người vay *</label>
          <input
            value={borrower}
            onChange={(e) => setBorrower(e.target.value)}
            placeholder="Tên / biệt danh"
            style={{ fontSize: 17, fontWeight: 600 }}
          />
        </div>
        <div className="field">
          <label>SĐT (tuỳ chọn)</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            style={{ fontSize: 17, fontWeight: 600 }}
          />
        </div>
        <div className="field">
          <label>Số tiền cho vay (gốc)</label>
          <MoneyInput
            value={principal}
            onChange={(v) => {
              setPrincipal(v)
              if (mode === 'create') setRemaining(v)
            }}
          />
        </div>
        {mode === 'edit' && (
          <div className="field">
            <label>Còn phải thu (gốc)</label>
            <MoneyInput value={remaining} onChange={setRemaining} />
          </div>
        )}
      </div>

      <div className="sec">
        <h2>Cách tính lãi</h2>
      </div>
      <div className="interest-type-grid">
        <button
          type="button"
          className={interestType === 'percent_monthly' ? 'on' : ''}
          onClick={() => pickType('percent_monthly')}
        >
          <strong>% / tháng</strong>
          <span>vd 1,5%/tháng</span>
        </button>
        <button
          type="button"
          className={interestType === 'per_million_daily' ? 'on' : ''}
          onClick={() => pickType('per_million_daily')}
        >
          <strong>đ / 1tr / ngày</strong>
          <span>vd 1k/1tr/ngày</span>
        </button>
        <button
          type="button"
          className={interestType === 'flat_monthly' ? 'on' : ''}
          onClick={() => pickType('flat_monthly')}
        >
          <strong>Cố định / tháng</strong>
          <span>vd 1.300.000đ</span>
        </button>
      </div>

      <div className="card">
        {interestType === 'percent_monthly' && (
          <div className="field">
            <label>Lãi suất (% / tháng)</label>
            <MoneyInput
              value={interestVal}
              onChange={setInterestVal}
              unit="%/th"
              decimal
              maxFraction={3}
            />
            <div className="hint">
              Gốc {fmtVnd(remNum || pNum)}đ → lãi khoảng{' '}
              <b>{fmtVnd(Math.round(previewMonth))}đ/tháng</b>
            </div>
          </div>
        )}
        {interestType === 'per_million_daily' && (
          <div className="field">
            <label>Lãi (đ / 1 triệu / ngày)</label>
            <MoneyInput
              value={interestVal}
              onChange={setInterestVal}
              unit="đ"
            />
            <div className="hint">
              Ví dụ <b>1.000</b> = 1k/1tr/ngày. Gốc{' '}
              {fmtVnd(remNum || pNum)}đ →{' '}
              <b>{fmtVnd(Math.round(previewDay))}đ/ngày</b>
              {' · '}
              <b>{fmtVnd(Math.round(previewMonth))}đ/tháng</b> (ước 30 ngày)
            </div>
          </div>
        )}
        {interestType === 'flat_monthly' && (
          <div className="field">
            <label>Lãi cố định mỗi tháng</label>
            <MoneyInput
              value={interestVal}
              onChange={setInterestVal}
              unit="đ/th"
            />
            <div className="hint">
              Ví dụ <b>1.300.000</b>đ/tháng — không phụ thuộc gốc. ≈{' '}
              <b>{fmtVnd(Math.round(previewDay))}đ/ngày</b>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="field">
          <label>Ngày cho vay</label>
          <input
            type="date"
            value={lendDate}
            onChange={(e) => setLendDate(e.target.value)}
            style={{ fontSize: 16, fontWeight: 600 }}
          />
        </div>
        <div className="field">
          <label>Hẹn trả (tuỳ chọn)</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            style={{ fontSize: 16, fontWeight: 600 }}
          />
        </div>
        {mode === 'create' && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={linkedCash}
              onChange={(e) => setLinkedCash(e.target.checked)}
            />
            <span>
              Trừ từ <b>tiền mặt VND</b> trong sổ
            </span>
          </label>
        )}
        <div className="field">
          <label>Ghi chú</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ fontSize: 16, fontWeight: 600 }}
          />
        </div>
      </div>

      <div className="summary">
        <div className="r">
          <span>Kiểu lãi</span>
          <span>
            {loanInterestLabel({
              interestType,
              interestValue: vNum,
              rateAnnual: toRateAnnual(interestType, vNum),
            })}
          </span>
        </div>
        <div className="r">
          <span>Ước / ngày</span>
          <span>{fmtVnd(Math.round(previewDay))} đ</span>
        </div>
        <div className="total">
          <span className="k">Ước / tháng</span>
          <span className="v num">{fmtVnd(Math.round(previewMonth))}đ</span>
        </div>
      </div>

      {err && <div className="error">{err}</div>}
      <button
        className="btn-primary"
        onClick={() => {
          const { interestType: it, interestValue: iv, rateAnnual } =
            buildInterestFields()
          if (mode === 'edit' && existing) {
            const res = updateLoan(existing.id, {
              borrower,
              phone: phone || undefined,
              principal: moneyNum(principal),
              remaining: moneyNum(remaining),
              rateAnnual,
              interestType: it,
              interestValue: iv,
              lendDate: new Date(lendDate + 'T12:00:00').toISOString(),
              dueDate: dueDate
                ? new Date(dueDate + 'T12:00:00').toISOString()
                : null,
              note: note || undefined,
            })
            if (!res.ok) {
              setErr(res.error)
              return
            }
            showToast('Đã cập nhật khoản vay')
            setScreen('loan-detail', existing.id, { replace: true })
            return
          }
          const res = addLoan({
            borrower,
            phone: phone || undefined,
            principal: moneyNum(principal),
            rateAnnual,
            interestType: it,
            interestValue: iv,
            lendDate: new Date(lendDate + 'T12:00:00').toISOString(),
            dueDate: dueDate
              ? new Date(dueDate + 'T12:00:00').toISOString()
              : null,
            note: note || undefined,
            linkedCash,
          })
          if (!res.ok) {
            setErr(res.error)
            return
          }
          showToast('Đã ghi khoản cho vay')
          setScreen('loan-detail', res.id, { replace: true })
        }}
      >
        {mode === 'edit' ? 'Lưu chỉnh sửa' : 'Lưu khoản cho vay'}
      </button>
    </div>
  )
}

function LoanDetail({ privacy }: { privacy: boolean }) {
  const id = useStore((s) => s.detailAssetId)
  const loans = useStore((s) => s.loans)
  const setScreen = useStore((s) => s.setScreen)
  const goBack = useStore((s) => s.goBack)
  const receiveLoanPayment = useStore((s) => s.receiveLoanPayment)
  const payLoanInterest = useStore((s) => s.payLoanInterest)
  const writeOffLoan = useStore((s) => s.writeOffLoan)
  const softDeleteLoan = useStore((s) => s.softDeleteLoan)
  const showToast = useStore((s) => s.showToast)
  const l = loans.find((x) => x.id === id)
  const [panel, setPanel] = useState<'none' | 'principal' | 'interest' | 'more'>(
    'none',
  )
  const [pay, setPay] = useState('')
  const [linkCash, setLinkCash] = useState(false)
  const [err, setErr] = useState('')

  if (!l) {
    return (
      <div className="scroll plain">
        <button className="back" onClick={() => goBack()}>
          ‹ Cho vay
        </button>
        <div className="empty">
          <h3>Không tìm thấy</h3>
        </div>
      </div>
    )
  }

  const interestInfo = calcLoanOutstandingInterest(l)
  const accrued = interestInfo.outstanding
  const active =
    !l.deletedAt &&
    (l.status === 'open' || l.status === 'partial') &&
    l.remaining > 0
  const paid = l.principal - l.remaining
  const paidPct =
    l.principal > 0 ? Math.round((paid / l.principal) * 100) : 0
  const due = daysUntil(l.dueDate)
  const interestPaid = l.interestPaid || 0
  const fromLabel = new Date(interestInfo.fromDate).toLocaleDateString('vi-VN')
  const interestStartIsLend =
    interestInfo.fromDate.slice(0, 10) === l.lendDate.slice(0, 10)

  return (
    <div className="scroll plain has-bottom-actions">
      <div className="nav">
        <button className="back" onClick={() => goBack()}>
          ‹ Cho vay
        </button>
        <div className="mid">{l.borrower}</div>
        <button
          className="link-btn"
          type="button"
          onClick={() => setScreen('loan-edit', l.id)}
        >
          Sửa
        </button>
      </div>

      <div className="loan-detail-hero">
        <div className="pill loan-status-pill">
          {l.status === 'written_off'
            ? 'Đã xóa nợ'
            : l.status === 'paid'
              ? 'Đã thu đủ gốc'
              : l.status === 'partial'
                ? 'Thu một phần'
                : 'Đang vay'}
        </div>
        <div className="k">Còn phải thu (gốc)</div>
        <div className="big num">
          {mask(privacy, fmtVnd(l.remaining))}
          <small>đ</small>
        </div>
        <div className="loan-detail-row">
          <div>
            <div className="k">Gốc</div>
            <div className="v num">{mask(privacy, fmtVnd(l.principal, true))}</div>
          </div>
          <div>
            <div className="k">Đã thu gốc</div>
            <div className="v num">{mask(privacy, fmtVnd(paid, true))}</div>
          </div>
          <div>
            <div className="k">Đã thu lãi</div>
            <div className="v num">
              {mask(privacy, fmtVnd(interestPaid, true))}
            </div>
          </div>
        </div>

        <div className="loan-accrued-box">
          <div>
            <div className="k">Lãi tạm tính đến hôm nay</div>
            <div className="accrued num">
              {mask(privacy, fmtVnd(Math.round(accrued)))} đ
            </div>
          </div>
          <div className="accrued-hint">
            {loanInterestLabel({
              rateAnnual: l.rateAnnual,
              interestType: l.interestType,
              interestValue: l.interestValue,
            })}
            {' · '}
            ≈{' '}
            {fmtVnd(
              Math.round(
                calcLoanInterestPerDay({
                  remaining: l.remaining,
                  rateAnnual: l.rateAnnual,
                  interestType: l.interestType,
                  interestValue: l.interestValue,
                }),
              ),
            )}
            đ/ngày
            <br />
            {interestStartIsLend
              ? `Tính từ ngày vay ${fromLabel} → hôm nay (${interestInfo.days} ngày)`
              : `Sau lần đóng lãi ${fromLabel} → hôm nay (${interestInfo.days} ngày) · đã thu ${fmtVnd(interestPaid, true)}`}
          </div>
        </div>

        {l.principal > 0 && (
          <div className="loan-progress loan-progress-dark">
            <div
              className="loan-progress-bar"
              style={{ width: `${Math.min(100, paidPct)}%` }}
            />
          </div>
        )}
        <div className="loan-progress-label">Đã thu {paidPct}% gốc</div>
        {due != null && (
          <div
            className={`loan-due-banner ${due < 0 ? 'over' : due <= 7 ? 'warn' : ''}`}
          >
            {due < 0
              ? `Trễ hạn ${-due} ngày`
              : due === 0
                ? 'Hẹn trả hôm nay'
                : `Còn ${due} ngày đến hạn`}
          </div>
        )}
      </div>

      <div className="card">
        <div className="field">
          <label>Ngày cho vay</label>
          <div style={{ fontWeight: 650 }}>
            {new Date(l.lendDate).toLocaleDateString('vi-VN')}
          </div>
        </div>
        {l.dueDate && (
          <div className="field">
            <label>Hẹn trả</label>
            <div style={{ fontWeight: 650 }}>
              {new Date(l.dueDate).toLocaleDateString('vi-VN')}
            </div>
          </div>
        )}
        {l.phone && (
          <div className="field">
            <label>SĐT</label>
            <a
              href={`tel:${l.phone}`}
              style={{ color: 'var(--brand)', fontWeight: 650 }}
            >
              {l.phone}
            </a>
          </div>
        )}
        {l.note && (
          <div className="field">
            <label>Ghi chú</label>
            <div>{l.note}</div>
          </div>
        )}
      </div>

      {panel === 'principal' && active && (
        <div className="card action-panel">
          <div className="field">
            <label>Thu gốc (giảm còn thu)</label>
            <MoneyInput
              value={pay}
              onChange={setPay}
              placeholder={formatMoneyInput(l.remaining)}
            />
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={linkCash}
              onChange={(e) => setLinkCash(e.target.checked)}
            />
            <span>Cộng vào tiền mặt VND</span>
          </label>
          <div style={{ padding: '0 14px 14px', display: 'grid', gap: 8 }}>
            <button
              className="btn-primary"
              type="button"
              onClick={() => {
                const res = receiveLoanPayment({
                  id: l.id,
                  amount: moneyNum(pay) || l.remaining,
                  paidAt: nowIso(),
                  linkedCash: linkCash,
                })
                if (!res.ok) {
                  setErr(res.error)
                  return
                }
                setPay('')
                setPanel('none')
                setErr('')
                showToast('Đã thu gốc')
              }}
            >
              Xác nhận thu gốc
            </button>
            <button
              className="btn-secondary"
              type="button"
              style={{ margin: 0 }}
              onClick={() => {
                const res = receiveLoanPayment({
                  id: l.id,
                  amount: l.remaining,
                  paidAt: nowIso(),
                  linkedCash: linkCash,
                  note: 'Thu đủ gốc',
                })
                if (!res.ok) {
                  setErr(res.error)
                  return
                }
                showToast('Đã thu đủ gốc')
                setPanel('none')
                goBack()
              }}
            >
              Thu hết gốc còn lại
            </button>
          </div>
        </div>
      )}

      {panel === 'interest' && (
        <div className="card action-panel">
          <div className="field">
            <label>Đóng lãi (không giảm gốc)</label>
            <MoneyInput
              value={pay}
              onChange={setPay}
              placeholder={formatMoneyInput(Math.round(accrued))}
            />
            <div className="hint">
              Gợi ý lãi tạm tính: <b>{fmtVnd(Math.round(accrued))} đ</b>
            </div>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={linkCash}
              onChange={(e) => setLinkCash(e.target.checked)}
            />
            <span>Cộng vào tiền mặt VND</span>
          </label>
          <div style={{ padding: '0 14px 14px', display: 'grid', gap: 8 }}>
            <button
              className="btn-primary"
              type="button"
              onClick={() => {
                const amt = moneyNum(pay) || Math.round(accrued)
                const res = payLoanInterest({
                  id: l.id,
                  amount: amt,
                  paidAt: nowIso(),
                  linkedCash: linkCash,
                })
                if (!res.ok) {
                  setErr(res.error)
                  return
                }
                setPay('')
                setPanel('none')
                setErr('')
                showToast('Đã đóng lãi')
              }}
            >
              Xác nhận đóng lãi
            </button>
            <button
              className="btn-secondary"
              type="button"
              style={{ margin: 0 }}
              onClick={() => {
                setPay(String(Math.round(accrued)))
              }}
            >
              Điền lãi tạm tính
            </button>
          </div>
        </div>
      )}

      {panel === 'more' && (
        <div className="card action-panel">
          <div className="field">
            <div className="hint" style={{ margin: 0, color: 'var(--ink-2)' }}>
              <b>Xóa nợ</b> = không thu được, giữ lịch sử, gốc còn = 0.
              <br />
              <b>Cho vào thùng rác</b> = ẩn khỏi list, có thể khôi phục.
            </div>
          </div>
          <div style={{ padding: '0 14px 14px', display: 'grid', gap: 8 }}>
            {active && (
              <button
                className="btn-secondary"
                type="button"
                style={{ margin: 0 }}
                onClick={() => {
                  if (
                    confirm(
                      'Xóa nợ: đánh dấu không thu được. Khoản vẫn lưu lịch sử, còn thu = 0.',
                    )
                  ) {
                    writeOffLoan(l.id)
                    showToast('Đã xóa nợ (không thu được)')
                    goBack()
                  }
                }}
              >
                Xóa nợ (không thu được)
              </button>
            )}
            <button
              className="btn-secondary"
              type="button"
              style={{ margin: 0, color: 'var(--down)' }}
              onClick={() => {
                if (confirm('Cho vào thùng rác? Có thể khôi phục sau.')) {
                  softDeleteLoan(l.id)
                  showToast('Đã đưa vào thùng rác')
                  goBack()
                }
              }}
            >
              Cho vào thùng rác
            </button>
            <button
              className="btn-secondary"
              type="button"
              style={{ margin: 0 }}
              onClick={() => setPanel('none')}
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {l.payments.length > 0 && (
        <>
          <div className="sec">
            <h2>Lịch sử thu</h2>
          </div>
          <div className="group">
            {[...l.payments].reverse().map((p) => (
              <div key={p.id} className="row" style={{ cursor: 'default' }}>
                <div className="body">
                  <div className="t">
                    {p.type === 'interest' ? 'Đóng lãi' : 'Thu gốc'}{' '}
                    {fmtVnd(p.amount)}đ
                  </div>
                  <div className="d">
                    {new Date(p.paidAt).toLocaleString('vi-VN')}
                    {p.note ? ` · ${p.note}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {err && <div className="error">{err}</div>}

      {/* Menu thao tác nhanh dưới đáy — fixed, kéo lên là hiện */}
      <div className="bottom-actions">
        {active ? (
          <>
            <button
              type="button"
              className={panel === 'principal' ? 'on' : ''}
              onClick={() => {
                setPanel(panel === 'principal' ? 'none' : 'principal')
                setPay('')
              }}
            >
              Thu gốc
            </button>
            <button
              type="button"
              className={panel === 'interest' ? 'on' : ''}
              onClick={() => {
                setPanel(panel === 'interest' ? 'none' : 'interest')
                setPay(String(Math.round(accrued) || ''))
              }}
            >
              Đóng lãi
            </button>
            <button
              type="button"
              onClick={() => setScreen('loan-edit', l.id)}
            >
              Sửa
            </button>
            <button
              type="button"
              className={panel === 'more' ? 'on' : ''}
              onClick={() => setPanel(panel === 'more' ? 'none' : 'more')}
            >
              Thêm
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => goBack()}>
              Quay lại
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm('Cho vào thùng rác?')) {
                  softDeleteLoan(l.id)
                  showToast('Đã đưa vào thùng rác')
                  goBack()
                }
              }}
            >
              Thùng rác
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function LoansTrash({ privacy }: { privacy: boolean }) {
  const loans = useStore((s) => s.loans)
  const goBack = useStore((s) => s.goBack)
  const restoreLoan = useStore((s) => s.restoreLoan)
  const hardDeleteLoan = useStore((s) => s.hardDeleteLoan)
  const showToast = useStore((s) => s.showToast)
  const trash = loans
    .filter((l) => l.deletedAt)
    .slice()
    .sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''))

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => goBack()}>
          ‹ Cho vay
        </button>
        <div className="mid">Thùng rác</div>
        <div style={{ minWidth: 64 }} />
      </div>
      <p
        style={{
          fontSize: 13,
          color: 'var(--muted)',
          marginBottom: 12,
          lineHeight: 1.45,
        }}
      >
        Khoản xóa nhầm có thể <b>Khôi phục</b>. Xóa vĩnh viễn thì mất hẳn.
      </p>
      {trash.length === 0 ? (
        <div className="empty">
          <h3>Thùng rác trống</h3>
        </div>
      ) : (
        <div className="loan-list">
          {trash.map((l) => (
            <div key={l.id} className="loan-card">
              <div className="loan-card-top">
                <div className="loan-avatar">
                  {l.borrower.slice(0, 1).toUpperCase()}
                </div>
                <div className="loan-card-mid">
                  <div className="loan-card-name">{l.borrower}</div>
                  <div className="loan-card-meta">
                    Xóa {l.deletedAt
                      ? new Date(l.deletedAt).toLocaleString('vi-VN')
                      : ''}
                  </div>
                </div>
                <div className="loan-card-amt">
                  <div className="num">
                    {mask(privacy, fmtVnd(l.remaining))}
                  </div>
                  <div className="unit">còn thu</div>
                </div>
              </div>
              <div className="btn-row" style={{ marginTop: 12, marginBottom: 0 }}>
                <button
                  className="btn-primary"
                  type="button"
                  style={{ margin: 0, padding: 12, fontSize: 14 }}
                  onClick={() => {
                    restoreLoan(l.id)
                    showToast('Đã khôi phục')
                  }}
                >
                  Khôi phục
                </button>
                <button
                  className="btn-secondary"
                  type="button"
                  style={{ margin: 0, padding: 12, fontSize: 14, color: 'var(--down)' }}
                  onClick={() => {
                    if (confirm('Xóa vĩnh viễn? Không hoàn tác được.')) {
                      hardDeleteLoan(l.id)
                      showToast('Đã xóa vĩnh viễn')
                    }
                  }}
                >
                  Xóa hẳn
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
