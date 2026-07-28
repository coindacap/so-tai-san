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

export function GoldDetail({ privacy }: { privacy: boolean }) {
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


export function BuyGold() {
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


export function SellGold() {
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


