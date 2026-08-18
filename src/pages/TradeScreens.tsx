import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { computePosition, qtyHoldAt, sortedTxs } from '../lib/calc'
import {
  fmtNum,
  fmtSignedVnd,
  fmtSignedUsdt,
  fmtVnd,
  fromLocalInput,
  toLocalInput,
  moneyNum,
} from '../lib/format'
import { MoneyInput } from '../components/MoneyInput'
import { AppIcon } from '../components/AppIcon'
import { mask, pctClass } from '../lib/ui'
import { kindLabel } from '../lib/txLabels'

export function AssetDetail({ privacy }: { privacy: boolean }) {
  const setScreen = useStore((s) => s.setScreen)
  const id = useStore((s) => s.detailAssetId)
  const assets = useStore((s) => s.assets)
  const transactions = useStore((s) => s.transactions)
  const expenses = useStore((s) => s.expenses)
  const quotes = useStore((s) => s.quotes)
  const settings = useStore((s) => s.settings)
  const labelCtx = useMemo(
    () => ({ assets, expenses }),
    [assets, expenses],
  )
  if (!id) return null
  const asset = assets.find((a) => a.id === id)
  if (!asset) return null
  const pos = computePosition({ assets, transactions, quotes, settings }, id)
  const txs = sortedTxs(transactions.filter((t) => t.assetId === id))
  const isCrypto = asset.assetClass === 'crypto'
  const quoteLabel = quotes[id]?.label

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => setScreen('assets')}>
          <AppIcon name="arrow-left" size={18} />
          Danh mục
        </button>
        <div className="mid">{asset.symbol}</div>
        {isCrypto ? (
          <button className="link-btn" onClick={() => setScreen('prices')}>
            Giá
          </button>
        ) : (
          <div className="nav-spacer" />
        )}
      </div>
      {isCrypto && (
        <div className="dual">
          <div
            className={`box ${
              pos.lastPrice != null &&
              pos.avgCost != null &&
              pos.lastPrice >= pos.avgCost
                ? 'bid'
                : 'ask'
            }`}
          >
            <div className="k">GIÁ HIỆN TẠI</div>
            <div className="v num">
              {mask(
                privacy,
                pos.lastPrice != null
                  ? `${fmtNum(pos.lastPrice, 4)} USDT`
                  : 'Chưa có',
              )}
            </div>
            <div className="d">
              {quoteLabel ? `${quoteLabel} · /coin` : '/coin'}
            </div>
          </div>
          <div className="box">
            <div className="dual-box-head">
              <div className="k">GIÁ VỐN TB</div>
              <button
                type="button"
                className="dual-box-edit"
                onClick={() => setScreen('adjust-coin-cost', asset.id)}
              >
                Sửa
              </button>
            </div>
            <div className="v num">
              {mask(
                privacy,
                pos.avgCost != null
                  ? `${fmtNum(pos.avgCost, 4)} USDT`
                  : 'Chưa có',
              )}
            </div>
            <div className="d">USDT bỏ ra / coin</div>
          </div>
        </div>
      )}
      <div className="stats">
        <div className="stat">
          <div className="k">Hold</div>
          <div className="v num">
            {mask(privacy, `${fmtNum(pos.qtyHold, 6)}${asset.unit && asset.unit !== 'VND' && asset.unit !== 'đ' ? ` ${asset.unit}` : ''}`)}
          </div>
        </div>
        {isCrypto ? (
          <div className="stat">
            <div className="k">Giá trị USDT</div>
            <div className="v num">
              {mask(
                privacy,
                pos.marketValueNative != null
                  ? `${fmtNum(pos.marketValueNative, 2)} USDT`
                  : '—',
              )}
            </div>
          </div>
        ) : (
          <div className="stat">
            <div className="k">Giá trị VND</div>
            <div className="v num">
              {mask(privacy, fmtVnd(pos.marketValueVnd))}
            </div>
          </div>
        )}
        {!isCrypto && (
          <div className="stat">
            <div className="k">Giá vốn TB</div>
            <div className="v num">
              {mask(privacy, pos.avgCost != null ? fmtNum(pos.avgCost, 2) : 'Chưa có')}
            </div>
          </div>
        )}
        {isCrypto && (
          <div className="stat">
            <div className="k">P/L</div>
            <div className={`v num ${pctClass(pos.unrealizedPnLNative)}`}>
              {mask(privacy, fmtSignedUsdt(pos.unrealizedPnLNative, 4))}
            </div>
          </div>
        )}
        {isCrypto ? (
          <div className="stat">
            <div className="k">≈ VND</div>
            <div className="v num">
              {mask(privacy, fmtVnd(pos.marketValueVnd))}
            </div>
          </div>
        ) : (
          <div className="stat">
            <div className="k">P/L</div>
            <div className={`v num ${pctClass(pos.unrealizedPnLVnd)}`}>
              {mask(privacy, fmtSignedVnd(pos.unrealizedPnLVnd))}
            </div>
          </div>
        )}
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
          <div className="row cursor-default" key={t.id}>
            <div className="body">
              <div className="t">
                {t.costBasisDeltaNative != null
                  ? `Sửa giá vốn · ${fmtSignedUsdt(t.costBasisDeltaNative, 4)}`
                  : `${kindLabel(t, labelCtx)} · ${fmtNum(t.qty, 6)}`}
                {t.venue && t.costBasisDeltaNative == null ? ` · ${t.venue}` : ''}
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

export function AdjustCoinCost() {
  const adjustCoinCostBasis = useStore((s) => s.adjustCoinCostBasis)
  const detailAssetId = useStore((s) => s.detailAssetId)
  const assets = useStore((s) => s.assets)
  const transactions = useStore((s) => s.transactions)
  const quotes = useStore((s) => s.quotes)
  const settings = useStore((s) => s.settings)
  const setScreen = useStore((s) => s.setScreen)
  const goBack = useStore((s) => s.goBack)
  const showToast = useStore((s) => s.showToast)
  const asset = detailAssetId
    ? assets.find((a) => a.id === detailAssetId && a.assetClass === 'crypto')
    : undefined
  const position = asset
    ? computePosition({ assets, transactions, quotes, settings }, asset.id)
    : null
  const [avgCost, setAvgCost] = useState(() =>
    position?.avgCost != null ? String(position.avgCost) : '',
  )
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  if (!asset || !position) {
    return (
      <div className="scroll plain">
        <div className="nav">
          <button type="button" className="back" onClick={() => setScreen('home')}>
            <AppIcon name="arrow-left" size={18} />
            Về trang chủ
          </button>
          <div className="nav-spacer" />
        </div>
        <div className="empty">
          <h3>Không thấy coin</h3>
          <p>Hãy mở chi tiết một coin rồi chọn sửa giá vốn.</p>
        </div>
      </div>
    )
  }

  const targetAvg = moneyNum(avgCost)
  const currentTotal = position.totalCostOpen ?? 0
  const targetTotal = position.qtyHold * targetAvg
  const delta = targetTotal - currentTotal
  const canSave = position.qtyHold > 0 && avgCost.trim() !== '' && targetAvg >= 0

  return (
    <div className="scroll plain">
      <div className="nav">
        <button
          type="button"
          className="back"
          onClick={() => goBack()}
        >
          <AppIcon name="arrow-left" size={18} />
          Huỷ
        </button>
        <div className="mid">Sửa giá vốn {asset.symbol}</div>
        <div className="nav-spacer" />
      </div>

      <div className="card mb-sm">
        <div className="field">
          <label>Coin đang hold</label>
          <div className="num amount-xl">{fmtNum(position.qtyHold, 8)} {asset.symbol}</div>
          <div className="hint">
            Chỉ đổi giá vốn để tính P/L, không đổi số lượng coin và không cộng/trừ USDT.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="field">
          <label>Giá vốn TB mới (USDT / coin)</label>
          <MoneyInput
            value={avgCost}
            onChange={setAvgCost}
            unit="USDT"
            decimal
            maxFraction={8}
          />
          <div className="hint">Nhập 0 nếu chưa biết giá vốn.</div>
        </div>
        <div className="field">
          <label>Ghi chú</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="VD: sửa theo giá mua thực tế"
            className="field-control"
          />
        </div>
      </div>

      <div className="summary">
        <div className="r">
          <span>Giá vốn hiện tại</span>
          <span>{fmtNum(position.avgCost ?? 0, 8)} USDT/coin</span>
        </div>
        <div className="r">
          <span>Giá vốn sau sửa</span>
          <span>{fmtNum(targetAvg, 8)} USDT/coin</span>
        </div>
        <div className="r">
          <span>Tổng giá vốn sau sửa</span>
          <span>{fmtNum(targetTotal, 4)} USDT</span>
        </div>
        <div className="total">
          <span className="k">Chênh lệch tổng</span>
          <span className={`v num ${pctClass(delta)}`}>{fmtSignedUsdt(delta, 4)}</span>
        </div>
      </div>

      {position.qtyHold <= 0 && <div className="error">Coin chưa có số dư để sửa giá vốn.</div>}
      {err && <div className="error">{err}</div>}
      <button
        className="btn-primary"
        disabled={!canSave}
        onClick={() => {
          if (!avgCost.trim()) {
            setErr('Nhập giá vốn TB mới')
            return
          }
          const res = adjustCoinCostBasis({
            assetId: asset.id,
            avgCostUsdt: targetAvg,
            note,
          })
          if (!res.ok) {
            setErr(res.error)
            return
          }
          showToast(`Đã sửa giá vốn ${asset.symbol}`)
          goBack()
        }}
      >
        Lưu giá vốn mới
      </button>
    </div>
  )
}

export function CashAdjust() {
  const adjustCash = useStore((s) => s.adjustCash)
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const assets = useStore((s) => s.assets)
  const transactions = useStore((s) => s.transactions)
  const quotes = useStore((s) => s.quotes)
  const settings = useStore((s) => s.settings)
  const vnd = assets.find((a) => a.symbol === 'VND')
  // Cùng nguồn với danh mục Tài sản (computePosition) — tránh lệch 72tr vs 0
  const hold = vnd
    ? computePosition({ assets, transactions, quotes, settings }, vnd.id)
        .qtyHold
    : 0
  const [side, setSide] = useState<'deposit' | 'withdraw'>('deposit')
  const [amount, setAmount] = useState('10000000')
  const [when, setWhen] = useState(() => toLocalInput())
  const [venue, setVenue] = useState('Ngân hàng / ví')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const a = moneyNum(amount)

  if (!vnd) {
    return (
      <div className="scroll plain">
        <div className="nav">
          <button type="button" className="back" onClick={() => setScreen('home')}>
            <AppIcon name="arrow-left" size={18} />
            Về trang chủ
          </button>
        </div>
        <div className="empty pt-xl">
          <h3>Không thấy tài sản VND</h3>
          <p>Thử Cài đặt → khôi phục / import lại sổ.</p>
          <button type="button" className="btn-primary" onClick={() => setScreen('home')}>
            Về trang chủ
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="scroll plain">
      <div className="nav">
        <button type="button" className="back" onClick={() => setScreen('home')}>
          <AppIcon name="arrow-left" size={18} />
          Huỷ
        </button>
        <div className="mid">Tiền mặt</div>
        <div className="nav-spacer" />
      </div>

      <div className="card mb-sm">
        <div className="field">
          <label>Tiền mặt trong sổ hiện có</label>
          <div className="num amount-xl">
            {fmtVnd(hold)}
          </div>
          <div className="hint">
            <b>Nạp/rút</b> = chuyển bank ↔ sổ theo dõi. Muốn mua USDT hoặc
            nhẫn: nạp VND trước, rồi đổi / mua.
          </div>
          <div className="hint hint-warn">
            Chi tiêu hàng ngày → tab <b>Chi tiêu</b> (bật “trừ tiền mặt”). Không
            rút tay ở đây nếu đã trừ qua chi tiêu — sẽ bị trừ hai lần.
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
          Rút ra bank
        </button>
      </div>

      <div className="card">
        <div className="field">
          <label>Số tiền VND</label>
          <MoneyInput value={amount} onChange={setAmount} />
          <div className="hint">
            {side === 'deposit'
              ? 'Ví dụ: rút 10tr từ bank bỏ vào sổ tài sản'
              : 'Chỉ khi chuyển tiền ra bank / ví ngoài sổ — không dùng thay chi tiêu'}
          </div>
        </div>
        <div className="field">
          <label>Nguồn / nơi</label>
          <input
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            className="field-control"
          />
        </div>
        <div className="field">
          <label>Ghi chú</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Tuỳ chọn"
            className="field-control"
          />
        </div>
        <div className="field">
          <label>Thời gian</label>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="field-control-sm"
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
            {fmtVnd(side === 'deposit' ? hold + a : Math.max(0, hold - a))}
          </span>
        </div>
        <div className="total">
          <span className="k">Số tiền</span>
          <span className="v num">{fmtVnd(a)}</span>
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
              ? `Đã nạp ${fmtVnd(a)} tiền mặt`
              : `Đã rút ${fmtVnd(a)}`,
          )
          setScreen('home')
        }}
      >
        {side === 'deposit' ? 'Lưu nạp tiền mặt' : 'Lưu rút tiền mặt'}
      </button>
      <button className="btn-secondary" onClick={() => setScreen('usdt')}>
        Tiếp: Đổi sang USDT
      </button>
      <button className="btn-secondary" onClick={() => setScreen('spend-form')}>
        Ghi chi tiêu (tab Chi tiêu)
      </button>
    </div>
  )
}

export function UsdtConvert() {
  const convert = useStore((s) => s.convertVndUsdt)
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const defaultRate = useStore((s) => s.settings.defaultUsdtVnd)
  const assets = useStore((s) => s.assets)
  const transactions = useStore((s) => s.transactions)
  const quotes = useStore((s) => s.quotes)
  const settings = useStore((s) => s.settings)
  const vndAsset = assets.find((a) => a.symbol === 'VND')
  const cashHold = vndAsset
    ? qtyHoldAt({ assets, transactions, quotes, settings }, vndAsset.id)
    : 0
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
          <AppIcon name="arrow-left" size={18} />
          Huỷ
        </button>
        <div className="mid">Đổi USDT</div>
        <div className="nav-spacer" />
      </div>

      <div className="card mb-sm">
        <div className="field">
          <label>Tiền mặt VND trong sổ</label>
          <div className="num amount-lg">
            {fmtVnd(cashHold)}
          </div>
          <div className="hint">
            Mua USDT sẽ <b>trừ</b> từ số này. Thiếu tiền?{' '}
            <button
              type="button"
              className="link-btn inline-plain"
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
          <MoneyInput value={rate} onChange={setRate} />
          <div className="hint">Giá tư nhân / P2P, không phải USD bank</div>
        </div>
        <div className="field">
          <label>Nơi đổi</label>
          <input value={venue} onChange={(e) => setVenue(e.target.value)} className="field-control" />
        </div>
        <div className="field">
          <label>Thời gian</label>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="field-control-sm" />
        </div>
      </div>
      <div className="summary">
        <div className="r">
          <span>Chiều</span>
          <span>{dir === 'vnd_to_usdt' ? 'Mua USDT' : 'Bán USDT lấy VND'}</span>
        </div>
        <div className="r">
          <span>Cần / nhận VND</span>
          <span>{fmtVnd(vnd)}</span>
        </div>
        <div className="total">
          <span className="k">Tiền VND</span>
          <span className="v num">{fmtVnd(vnd)}</span>
        </div>
      </div>
      {needMore && (
        <div className="error">
          Thiếu {fmtVnd(vnd - cashHold)} tiền mặt.{' '}
          <button
            type="button"
            className="link-btn inline-link"
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

export function BuyCoin() {
  const buyCoin = useStore((s) => s.buyCoin)
  const assets = useStore((s) => s.assets)
  const transactions = useStore((s) => s.transactions)
  const quotes = useStore((s) => s.quotes)
  const settings = useStore((s) => s.settings)
  const detailAssetId = useStore((s) => s.detailAssetId)
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const cryptos = assets.filter((a) => a.assetClass === 'crypto')
  const usdtAsset = assets.find((a) => a.symbol === 'USDT')
  const usdtHold = usdtAsset
    ? qtyHoldAt({ assets, transactions, quotes, settings }, usdtAsset.id)
    : 0
  const prefilled =
    detailAssetId && detailAssetId !== '__old_hold__'
      ? assets.find((a) => a.id === detailAssetId && a.assetClass === 'crypto')
      : undefined
  const [symbol, setSymbol] = useState(
    prefilled?.symbol || cryptos[0]?.symbol || 'BTC',
  )
  const [custom, setCustom] = useState('')
  const [qty, setQty] = useState('0.01')
  const [usdt, setUsdt] = useState('950')
  const [when, setWhen] = useState(toLocalInput())
  const [venue, setVenue] = useState(
    detailAssetId === '__old_hold__' ? 'Hold cũ' : 'Sàn',
  )
  /** true = coin mua từ trước / hold sẵn — không trừ USDT hiện tại */
  const [oldHold, setOldHold] = useState(detailAssetId === '__old_hold__')
  const [err, setErr] = useState('')
  const q = moneyNum(qty)
  const u = moneyNum(usdt)
  const px = q > 0 && u > 0 ? u / q : 0
  const sym = custom.trim() || symbol
  const liveAsset = assets.find(
    (a) => a.assetClass === 'crypto' && a.symbol === (symbol === '__new' ? custom.trim() : symbol),
  )
  const livePx = liveAsset ? quotes[liveAsset.id]?.price : undefined
  const liveLabel = liveAsset ? quotes[liveAsset.id]?.label : undefined
  const oldHoldWarn = oldHold && usdtHold > 0

  return (
    <div className="scroll plain">
      <div className="nav">
        <button className="back" onClick={() => setScreen('home')}>
          <AppIcon name="arrow-left" size={18} />
          Huỷ
        </button>
        <div className="mid">{oldHold ? 'Ghi coin cũ' : 'Mua coin'}</div>
        <div className="nav-spacer" />
      </div>
      <div className="card">
        <div className="field mb-sm">
          <label>USDT trong sổ</label>
          <div className="num amount-lg">{fmtNum(usdtHold, 4)} USDT</div>
          <div className="hint">
            Luồng chuẩn: mua coin sẽ <b>trừ</b> USDT này. Chỉ bật “hold cũ” khi
            coin mua trước khi có sổ.
          </div>
        </div>
        <label className="check-row check-row-form">
          <input
            type="checkbox"
            checked={oldHold}
            onChange={(e) => {
              const on = e.target.checked
              setOldHold(on)
              if (on) {
                setVenue((v) => (v === 'Sàn' ? 'Hold cũ' : v))
              } else {
                setVenue((v) => (v === 'Hold cũ' ? 'Sàn' : v))
              }
              setErr('')
            }}
          />
          <span>
            <b>Hold cũ · không trừ USDT</b>
            <br />
            <span className="switch-desc">
              Coin mua từ trước: chỉ ghi số lượng &amp; giá vốn để tính P/L,
              không đụng số dư USDT
            </span>
          </span>
        </label>
        {oldHoldWarn && (
          <div className="error error-soft">
            Bạn đang có {fmtNum(usdtHold, 2)} USDT trong sổ. Nếu coin này mua
            bằng USDT đó, hãy <b>tắt</b> ô trên để trừ đúng — tránh P/L lệch.
          </div>
        )}
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
            <option value="__new">Coin khác…</option>
          </select>
        </div>
        {symbol === '__new' && (
          <div className="field">
            <label>Mã coin mới</label>
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value.toUpperCase())}
              placeholder="SOL"
              className="field-control"
            />
          </div>
        )}
        <div className="field">
          <label>Số lượng</label>
          <MoneyInput
            value={qty}
            onChange={setQty}
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
            {livePx != null && livePx > 0
              ? `Giá sàn ≈ ${fmtNum(livePx, 4)} USDT/coin${liveLabel ? ` · ${liveLabel}` : ''}`
              : null}
            {livePx != null && livePx > 0 ? ' · ' : ''}
            {oldHold
              ? u > 0
                ? `Giá vốn ≈ ${fmtNum(px, 4)} USDT/coin · dùng để tính P/L (0 nếu không nhớ)`
                : 'Để 0 nếu không nhớ giá vốn; hold vẫn ghi, P/L tạm ẩn'
              : `Chỉ trả bằng USDT · Giá lệnh ≈ ${fmtNum(px, 4)} USDT`}
          </div>
          {livePx != null && livePx > 0 && q > 0 && (
            <button
              type="button"
              className="link-btn"
              onClick={() => setUsdt(String(Number((q * livePx).toFixed(4))))}
            >
              Điền USDT theo giá sàn ({fmtNum(q * livePx, 2)})
            </button>
          )}
        </div>
        <div className="field">
          <label>Sàn / nơi</label>
          <input value={venue} onChange={(e) => setVenue(e.target.value)} className="field-control" />
        </div>
        <div className="field">
          <label>Thời gian</label>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="field-control-sm" />
        </div>
      </div>
      <div className="summary">
        <div className="r">
          <span>USDT trong sổ</span>
          <span className={oldHold ? 'switch-value is-on' : 'switch-value'}>
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
              ? 'Hold sẵn / mua từ trước, không trừ USDT hiện tại'
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

export function AdjustUsdt() {
  const adjustUsdtHold = useStore((s) => s.adjustUsdtHold)
  const assets = useStore((s) => s.assets)
  const transactions = useStore((s) => s.transactions)
  const quotes = useStore((s) => s.quotes)
  const settings = useStore((s) => s.settings)
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const usdtAsset = assets.find((a) => a.symbol === 'USDT')
  const hold = usdtAsset
    ? qtyHoldAt({ assets, transactions, quotes, settings }, usdtAsset.id)
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
          <AppIcon name="arrow-left" size={18} />
          Huỷ
        </button>
        <div className="mid">Điều chỉnh USDT</div>
        <div className="nav-spacer" />
      </div>

      <div className="card mb-sm">
        <div className="field">
          <label>USDT đang hold trong sổ</label>
          <div className="num amount-xl">
            {fmtNum(hold, 4)} USDT
          </div>
          <div className="hint">
            Chỉ sửa số dư USDT <b>không qua</b> đổi VND (nạp sàn ngoài, lệch
            số). Đổi OTC → màn <b>Đổi USDT</b>. Mua coin → màn <b>Mua coin</b>.
          </div>
          <div className="hint hint-warn">
            Không dùng thay “Đổi VND ↔ USDT” — sẽ lệch giá vốn AVG và P/L.
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
            className="field-control"
          />
        </div>
        <div className="field">
          <label>Thời gian</label>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="field-control-sm"
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
      <button className="btn-secondary" onClick={() => setScreen('usdt')}>
        Đổi VND ↔ USDT (chuẩn)
      </button>
      <button className="btn-secondary" onClick={() => setScreen('buy-coin')}>
        Ghi coin cũ (không trừ USDT)
      </button>
    </div>
  )
}

export function SellCoin() {
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
    ? qtyHoldAt({ assets, transactions, quotes, settings }, assetId)
    : 0

  if (cryptos.length === 0) {
    return (
      <div className="scroll plain">
        <div className="nav">
          <button className="back" onClick={() => setScreen('home')}>
            <AppIcon name="arrow-left" size={18} />
            Huỷ
          </button>
          <div className="mid">Bán coin</div>
          <div className="nav-spacer" />
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
          <AppIcon name="arrow-left" size={18} />
          Huỷ
        </button>
        <div className="mid">Bán coin</div>
        <div className="nav-spacer" />
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
          <MoneyInput value={qty} onChange={setQty} decimal maxFraction={8} />
        </div>
        <div className="field">
          <label>USDT nhận</label>
          <MoneyInput value={usdt} onChange={setUsdt} unit="USDT" decimal maxFraction={4} />
        </div>
        <div className="field">
          <label>Thời gian</label>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="field-control-sm" />
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
