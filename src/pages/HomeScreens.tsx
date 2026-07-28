import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { portfolioSummary } from '../lib/calc'
import {
  daysUntil,
  fmtNum,
  fmtPct,
  fmtSignedVnd,
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

export function Home({
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
  const savings = useStore((s) => s.savings)
  const loans = useStore((s) => s.loans)
  const gold = assets.find((a) => a.symbol === 'NHAN9999')
  const goldQ = gold ? quotes[gold.id] : undefined
  const usdt = assets.find((a) => a.symbol === 'USDT')
  const usdtQ = usdt ? quotes[usdt.id] : undefined
  const { buckets, totalValue, totalPnl, totalPnlPct } = summary
  const grandTotal = totalValue + savingsTotal + loansTotal
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
        {navPoints.length >= 1 && (
          <div className="hero-nav">
            <NavSparkline points={navPoints} privacy={privacy} height={44} />
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
                  <span className="chev">›</span>
                </button>
              )
            })}
          </div>
        </>
      )}

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
          <button type="button" className="btn-primary" onClick={onSheet}>
            Ghi chi tiêu nhanh
          </button>
        </div>
      )}
    </div>
  )
}


export function Assets({
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


