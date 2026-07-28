import { useState } from 'react'
import { useStore } from '../store/useStore'
import { moneyNum } from '../lib/format'
import { MoneyInput } from '../components/MoneyInput'

export function Onboarding() {
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

