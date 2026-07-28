import { useState } from 'react'
import { useStore } from '../store/useStore'
import { computePosition, qtyHoldAt, sortedTxs } from '../lib/calc'
import {
  fmtNum,
  fmtSignedVnd,
  fmtVnd,
  fromLocalInput,
  toLocalInput,
  moneyNum,
} from '../lib/format'
import { MoneyInput } from '../components/MoneyInput'
import { mask, pctClass } from '../lib/ui'

export function AssetDetail({ privacy }: { privacy: boolean }) {
  const setScreen = useStore((s) => s.setScreen)
  const id = useStore((s) => s.detailAssetId)
  const assets = useStore((s) => s.assets)
  const transactions = useStore((s) => s.transactions)
  const quotes = useStore((s) => s.quotes)
  const settings = useStore((s) => s.settings)
  if (!id) return null
  const asset = assets.find((a) => a.id === id)
  if (!asset) return null
  const pos = computePosition({ assets, transactions, quotes, settings }, id)
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


export function CashAdjust() {
  const adjustCash = useStore((s) => s.adjustCash)
  const setScreen = useStore((s) => s.setScreen)
  const showToast = useStore((s) => s.showToast)
  const assets = useStore((s) => s.assets)
  const transactions = useStore((s) => s.transactions)
  const quotes = useStore((s) => s.quotes)
  const settings = useStore((s) => s.settings)
  const vnd = assets.find((a) => a.symbol === 'VND')
  const hold = vnd
    ? qtyHoldAt({ assets, transactions, quotes, settings }, vnd.id)
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
            ‹ Về trang chủ
          </button>
        </div>
        <div className="empty" style={{ paddingTop: 40 }}>
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


export function BuyCoin() {
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


