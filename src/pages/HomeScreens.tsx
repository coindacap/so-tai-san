import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { portfolioSummary } from '../lib/calc'
import {
  daysUntil,
  fmtNum,
  fmtPct,
  fmtSignedVnd,
  fmtSignedUsdt,
  fmtVnd,
} from '../lib/format'
import { useAutoPrices } from '../hooks/useAutoPrices'
import { mask, pctClass } from '../lib/ui'
import {
  navChangePct,
  readNavHistory,
  recordNavSample,
  type NavPoint,
} from '../lib/navHistory'
import { NavSparkline } from '../components/NavSparkline'
import { AppIcon } from '../components/AppIcon'

/** Cửa sổ nhắc: quá hạn hoặc còn ≤ N ngày */
const ALERT_WITHIN_DAYS = 30

type DueAlert = {
  id: string
  kind: 'savings' | 'loan'
  title: string
  sub: string
  days: number
  amount: number
}

function dueLabel(days: number): string {
  if (days < 0) return `Trễ ${-days} ngày`
  if (days === 0) return 'Hôm nay'
  if (days === 1) return 'Còn 1 ngày'
  return `Còn ${days} ngày`
}

export function Home({ onOpenTradeSheet }: { onOpenTradeSheet: () => void }) {
  const setScreen = useStore((s) => s.setScreen)
  const updateSettings = useStore((s) => s.updateSettings)
  const showToast = useStore((s) => s.showToast)
  const quotes = useStore((s) => s.quotes)
  const assets = useStore((s) => s.assets)
  const transactions = useStore((s) => s.transactions)
  const settings = useStore((s) => s.settings)
  const savings = useStore((s) => s.savings)
  const loans = useStore((s) => s.loans)
  const privacy = settings.privacyMode
  const summary = useMemo(
    () =>
      portfolioSummary({
        assets,
        transactions,
        quotes,
        settings,
        savings,
        loans,
      }),
    [assets, transactions, quotes, settings, savings, loans],
  )
  const gold = assets.find((a) => a.symbol === 'NHAN9999')
  const goldQ = gold ? quotes[gold.id] : undefined
  const usdt = assets.find((a) => a.symbol === 'USDT')
  const usdtQ = usdt ? quotes[usdt.id] : undefined
  const { buckets, totalValue, totalPnl, totalPnlPct } = summary
  const cryptoPnlUsdt = buckets.crypto.positions.reduce(
    (s, p) => s + (p.unrealizedPnLNative ?? 0),
    0,
  )
  const liquidTotal = totalValue
  const savingsTotal = savings
    .filter((s) => s.status === 'active')
    .reduce((a, s) => a + s.principal, 0)
  const loansTotal = loans
    .filter(
      (l) =>
        !l.deletedAt &&
        (l.status === 'open' || l.status === 'partial') &&
        l.remaining > 0,
    )
    .reduce((a, l) => a + l.remaining, 0)
  const grandTotal = liquidTotal + savingsTotal + loansTotal
  const grandTotalText = fmtVnd(grandTotal)
  const totalAmountSize =
    grandTotalText.length >= 19
      ? 'is-very-long'
      : grandTotalText.length >= 15
        ? 'is-long'
        : ''
  // Dùng số đầy đủ trên màn tài sản (không compact) để cộng dồn khớp 100%
  const money = (n: number) => mask(privacy, fmtVnd(n, false))
  const { refresh: refreshPrices, status: priceStatus } = useAutoPrices(false)

  const [navPoints, setNavPoints] = useState<NavPoint[]>(() =>
    typeof localStorage !== 'undefined' ? readNavHistory() : [],
  )

  // Ghi NAV hôm nay mỗi khi tổng đổi (1 điểm / ngày, cập nhật trong ngày)
  useEffect(() => {
    if (!Number.isFinite(grandTotal) || grandTotal < 0) return
    setNavPoints(recordNavSample(grandTotal))
  }, [grandTotal])

  const navDelta = useMemo(() => navChangePct(navPoints, 7), [navPoints])

  const dueAlerts = useMemo(() => {
    const list: DueAlert[] = []
    for (const s of savings) {
      if (s.status !== 'active' || s.principal <= 0 || !s.maturityDate) continue
      const d = daysUntil(s.maturityDate)
      if (d == null || d > ALERT_WITHIN_DAYS) continue
      list.push({
        id: s.id,
        kind: 'savings',
        title: s.name || s.bank,
        sub: s.bank,
        days: d,
        amount: s.principal,
      })
    }
    for (const l of loans) {
      if (l.deletedAt) continue
      if (!(l.status === 'open' || l.status === 'partial')) continue
      if (l.remaining <= 0 || !l.dueDate) continue
      const d = daysUntil(l.dueDate)
      if (d == null || d > ALERT_WITHIN_DAYS) continue
      list.push({
        id: l.id,
        kind: 'loan',
        title: l.borrower,
        sub: 'Cho vay · đến hạn',
        days: d,
        amount: l.remaining,
      })
    }
    list.sort((a, b) => a.days - b.days)
    return list.slice(0, 6)
  }, [savings, loans])

  return (
    <div className="scroll wb-page">
      <div className="wb-nav">
        <div className="wb-nav-spacer" />
        <div className="wb-nav-actions">
          <button
            type="button"
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
            <AppIcon
              name={priceStatus === 'loading' ? 'loader' : 'refresh'}
              size={19}
              className={priceStatus === 'loading' ? 'spin' : undefined}
            />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => updateSettings({ privacyMode: !privacy })}
            aria-label={privacy ? 'Hiện số' : 'Ẩn số'}
          >
            <AppIcon name={privacy ? 'eye-off' : 'eye'} size={19} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setScreen('settings')}
            aria-label="Cài đặt"
          >
            <AppIcon name="settings" size={19} />
          </button>
        </div>
      </div>
      <div className="large-title">
        <h1>Tài sản</h1>
        <div className="sub">Tổng quan sổ của bạn</div>
      </div>

      <section className="wb-hero wb-hero--portfolio" aria-label="Tổng tài sản">
        <div className="wb-hero__money-head">
          <div>
            <p className="wb-hero__label">Tổng tài sản</p>
            <p className="wb-hero__caption">Giá trị hiện tại</p>
          </div>
        </div>
        <p
          className={`wb-hero__amount num ${totalAmountSize}`}
          title={privacy ? undefined : grandTotalText}
        >
          {mask(privacy, grandTotalText)}
        </p>
        {navPoints.length >= 1 && (
          <div className="hero-nav">
            <NavSparkline points={navPoints} privacy={privacy} height={40} />
            <div className="hero-nav-meta">
              <span className="hero-nav-label">
                NAV {navPoints.length < 2 ? 'hôm nay' : `${navPoints.length} ngày`}
              </span>
              {navDelta.pct != null && navPoints.length >= 2 ? (
                <span className={`num ${pctClass(navDelta.pct)}`}>
                  {privacy
                    ? '···'
                    : `${navDelta.pct >= 0 ? '+' : ''}${navDelta.pct.toFixed(1)}% · 7n+`}
                </span>
              ) : (
                <span className="hero-nav-hint">Tự lưu mỗi ngày mở app</span>
              )}
            </div>
          </div>
        )}
        <div className="wb-hero__stats">
          <div className="wb-hero__stat">
            <span className="wb-hero__stat-k">Thanh khoản</span>
            <span className="wb-hero__stat-v num">{money(liquidTotal)}</span>
          </div>
          <div className="wb-hero__stat">
            <span className="wb-hero__stat-k">Tiết kiệm</span>
            <span className="wb-hero__stat-v num">{money(savingsTotal)}</span>
          </div>
          <div className="wb-hero__stat">
            <span className="wb-hero__stat-k">Cho vay</span>
            <span className="wb-hero__stat-v num">{money(loansTotal)}</span>
          </div>
        </div>
        <p className="wb-hero__equation" aria-hidden={privacy}>
          Tổng = thanh khoản + tiết kiệm + cho vay
        </p>
        <div className="hero-pnl">
          <span>P/L hold (vàng · USDT · coin)</span>
          <span className={`num ${pctClass(totalPnl)}`}>
            {mask(privacy, `${fmtSignedVnd(totalPnl)} · ${fmtPct(totalPnlPct)}`)}
          </span>
        </div>
      </section>

      {dueAlerts.length > 0 && (
        <>
          <div className="sec">
            <h2>Cần chú ý</h2>
            <span className="sec-hint">≤ {ALERT_WITHIN_DAYS} ngày</span>
          </div>
          <div className="group home-alerts">
            {dueAlerts.map((a) => {
              const overdue = a.days < 0
              const urgent = a.days >= 0 && a.days <= 7
              return (
                <button
                  key={`${a.kind}-${a.id}`}
                  type="button"
                  className="row"
                  onClick={() =>
                    setScreen(
                      a.kind === 'savings' ? 'savings-detail' : 'loan-detail',
                      a.id,
                    )
                  }
                >
                  <div
                    className={`mark ${a.kind === 'savings' ? 'savings' : 'loan'}`}
                  >
                    {a.kind === 'savings' ? 'S' : 'V'}
                  </div>
                  <div className="body">
                    <div className="t">{a.title}</div>
                    <div className="d">
                      {a.sub}
                      {' · '}
                      {mask(privacy, fmtVnd(a.amount, true))}
                    </div>
                  </div>
                  <div className="end">
                    <div
                      className={`home-due ${overdue ? 'over' : urgent ? 'warn' : ''}`}
                    >
                      {dueLabel(a.days)}
                    </div>
                  </div>
                  <span className="chev">
                    <AppIcon name="chevron-right" size={18} />
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}

      <div className="sec">
        <h2>Nhanh</h2>
        <button type="button" onClick={onOpenTradeSheet}>
          Tất cả
        </button>
      </div>
      <div className="quick home-quick">
        <button type="button" onClick={onOpenTradeSheet} aria-label="Thêm giao dịch tài sản">
          <div className="qico qico-plus">
            <AppIcon name="plus" size={20} />
          </div>
          <span>Giao dịch</span>
        </button>
        <button type="button" onClick={() => setScreen('cash')}>
          <div className="qico">
            <AppIcon name="cash" size={20} />
          </div>
          <span>Nạp VND</span>
        </button>
        <button type="button" onClick={() => setScreen('usdt')}>
          <div className="qico">
            <AppIcon name="swap" size={20} />
          </div>
          <span>USDT</span>
        </button>
        <button type="button" onClick={() => setScreen('buy-gold')}>
          <div className="qico">
            <AppIcon name="gold" size={20} />
          </div>
          <span>Nhẫn</span>
        </button>
      </div>
      <p className="home-flow-hint">
        Nạp VND chỉ là chuyển bank vào sổ. Chi tiêu hàng ngày dùng tab{' '}
        <b>Chi tiêu</b> (bật trừ tiền mặt nếu muốn đồng bộ).
      </p>

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
            <div className="amt num">{money(buckets.gold.value)}</div>
            <div className={`chip ${pctClass(buckets.gold.pnl)}`}>
              {mask(
                privacy,
                `${fmtSignedVnd(buckets.gold.pnl, false)} · ${fmtPct(buckets.gold.pnlPct)}`,
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
            <div className="amt num">{money(buckets.usdt.value)}</div>
            <div className={`chip ${pctClass(buckets.usdt.pnl)}`}>
              {mask(
                privacy,
                `${fmtSignedVnd(buckets.usdt.pnl, false)} · ${fmtPct(buckets.usdt.pnlPct)}`,
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
            <div className="amt num">{money(buckets.crypto.value)}</div>
            <div className={`chip ${pctClass(cryptoPnlUsdt)}`}>
              {mask(
                privacy,
                `${fmtSignedUsdt(cryptoPnlUsdt)} · ${fmtPct(buckets.crypto.pnlPct)}`,
              )}
            </div>
          </div>
        </button>
        <button type="button" className="home-asset" onClick={() => setScreen('cash')}>
          <div className="mark cash">TM</div>
          <div className="home-asset-mid">
            <div className="t">Tiền mặt</div>
            <div className="d">Nạp / rút bank ↔ sổ</div>
          </div>
          <div className="home-asset-end">
            <div className="amt num">{money(buckets.cash.value)}</div>
          </div>
        </button>
        <button type="button" className="home-asset" onClick={() => setScreen('savings')}>
          <div className="mark savings">S</div>
          <div className="home-asset-mid">
            <div className="t">Tiết kiệm</div>
            <div className="d">Ngân hàng</div>
          </div>
          <div className="home-asset-end">
            <div className="amt num">{money(savingsTotal)}</div>
          </div>
        </button>
        <button type="button" className="home-asset" onClick={() => setScreen('loans')}>
          <div className="mark loan">V</div>
          <div className="home-asset-mid">
            <div className="t">Cho vay</div>
            <div className="d">Còn phải thu</div>
          </div>
          <div className="home-asset-end">
            <div className="amt num">{money(loansTotal)}</div>
          </div>
        </button>
      </div>
      <p className="home-assets-sum">
        Cộng danh mục:{' '}
        <span className="num">
          {money(
            buckets.gold.value +
              buckets.usdt.value +
              buckets.crypto.value +
              buckets.cash.value +
              savingsTotal +
              loansTotal,
          )}
        </span>
        {!privacy && liquidTotal + savingsTotal + loansTotal === grandTotal
          ? ' · khớp tổng'
          : ''}
      </p>

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
            <div className="amt num">{fmtVnd(usdtQ?.price ?? 0)}</div>
          </div>
        </button>
      </div>

      <div className="home-links">
        <button type="button" onClick={() => setScreen('history')}>Lịch sử</button>
        <button type="button" onClick={() => setScreen('assets')}>Danh mục chi tiết</button>
      </div>

      {summary.positions.every((p) => p.qtyHold === 0) &&
        savingsTotal <= 0 &&
        loansTotal <= 0 && (
        <div className="empty pt-lg">
          <h3>Chưa có hold</h3>
          <p>
            Bắt đầu bằng nạp VND, đổi USDT, mua nhẫn hoặc mua coin. Chi tiêu
            hàng ngày nằm tab Chi tiêu.
          </p>
          <button type="button" className="btn-primary" onClick={onOpenTradeSheet}>
            Thêm giao dịch tài sản
          </button>
        </div>
      )}
      <div className="scroll-end-spacer" aria-hidden />
    </div>
  )
}

export function Assets() {
  const setScreen = useStore((s) => s.setScreen)
  const goBack = useStore((s) => s.goBack)
  const privacy = useStore((s) => s.settings.privacyMode)
  const assets = useStore((s) => s.assets)
  const transactions = useStore((s) => s.transactions)
  const quotes = useStore((s) => s.quotes)
  const settings = useStore((s) => s.settings)
  const savings = useStore((s) => s.savings)
  const loans = useStore((s) => s.loans)
  const summary = useMemo(
    () =>
      portfolioSummary({
        assets,
        transactions,
        quotes,
        settings,
        savings,
        loans,
      }),
    [assets, transactions, quotes, settings, savings, loans],
  )
  const sections = [
    { title: 'Vàng', items: summary.buckets.gold.positions },
    { title: 'Cầu nối', items: summary.buckets.usdt.positions },
    { title: 'Coin', items: summary.buckets.crypto.positions },
    { title: 'Tiền mặt', items: summary.buckets.cash.positions },
  ]
  // Chỉ hold thanh khoản (không gồm tiết kiệm / cho vay)
  const liquidSum = summary.totalValue

  return (
    <div className="scroll wb-page assets-page">
      <div className="nav">
        <button type="button" className="back" onClick={() => goBack()}>
          <AppIcon name="arrow-left" size={18} />
          Tài sản
        </button>
        <div className="mid">Danh mục</div>
        <div className="nav-spacer" />
      </div>
      <section className="wb-hero" aria-label="Tổng thanh khoản">
        <p className="wb-hero__label">Tổng thanh khoản</p>
        <p className="wb-hero__amount num">
          {mask(privacy, fmtVnd(liquidSum))}
        </p>
        <p className="wb-hero__equation">
          Vàng + USDT + coin + tiền mặt · chưa gồm tiết kiệm / cho vay
        </p>
      </section>
      {sections.map((sec) => (
        <div key={sec.title} className="assets-section">
          <div className={sec.title === 'Vàng' ? 'sec sec-tight' : 'sec sec-loose'}>
            <h2>{sec.title}</h2>
          </div>
          <div className="group">
            {sec.items.length === 0 && (
              <div className="row row-muted">
                Chưa có
              </div>
            )}
            {sec.items.map((p) => (
              <button
                key={p.asset.id}
                type="button"
                className="row"
                onClick={() => {
                  if (p.asset.symbol === 'NHAN9999') setScreen('gold')
                  else if (p.asset.symbol === 'VND') setScreen('cash')
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
                  {p.asset.symbol === 'VND' ? 'TM' : p.asset.symbol.slice(0, 1)}
                </div>
                <div className="body">
                  <div className="t">{p.asset.name}</div>
                  <div className="d">
                    {p.asset.symbol === 'NHAN9999'
                      ? `${fmtNum(p.qtyHold, 2)} chỉ`
                      : p.asset.symbol === 'VND'
                        ? 'Sẵn dùng · nạp / rút'
                        : `${fmtNum(p.qtyHold, 6)}${p.asset.unit && p.asset.unit !== 'VND' && p.asset.unit !== 'đ' ? ` ${p.asset.unit}` : ''}`}
                    {p.asset.assetClass === 'crypto'
                      ? [
                          p.lastPrice != null
                            ? ` · ${fmtNum(p.lastPrice, 4)} USDT`
                            : '',
                          p.avgCost != null
                            ? ` · TB ${fmtNum(p.avgCost, 4)}`
                            : '',
                        ].join('')
                      : p.avgCost != null && p.asset.symbol !== 'VND'
                        ? ` · TB ${fmtVnd(p.avgCost)}`
                        : ''}
                  </div>
                </div>
                <div className="end">
                  <div className="amt num">
                    {mask(privacy, fmtVnd(p.marketValueVnd, false))}
                  </div>
                  {p.asset.symbol !== 'VND' && p.qtyHold > 0 && (
                    <div
                      className={`d weight-bold text-xs ${pctClass(
                        p.asset.assetClass === 'crypto'
                          ? p.unrealizedPnLNative
                          : p.unrealizedPnLVnd,
                      )}`}
                    >
                      {mask(
                        privacy,
                        p.asset.assetClass === 'crypto'
                          ? `${fmtSignedUsdt(p.unrealizedPnLNative)} · ${fmtPct(p.unrealizedPnLPct)}`
                          : `${fmtSignedVnd(p.unrealizedPnLVnd, false)} · ${fmtPct(p.unrealizedPnLPct)}`,
                      )}
                    </div>
                  )}
                </div>
                <span className="chev">
                  <AppIcon name="chevron-right" size={18} />
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {/* Chừa tabbar — mục Tiền mặt không bị che khi cuộn cuối */}
      <div className="scroll-end-spacer" aria-hidden />
    </div>
  )
}

