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
    <div className="scroll plain wb-page">
      <div className="large-title onboarding-title">
        <h1>Sổ Tài Sản</h1>
        <div className="sub">
          Nhẫn 9999 · USDT · Coin · lưu trên máy bạn
        </div>
      </div>

      <p className="onboarding-lead">
        Nhập số dư hiện có (có thể để 0). Sau đó ghi từng lần mua hoặc bán.
        Thêm vào Màn hình chính để dùng offline trên iPhone.
      </p>

      <div className="card">
        <div className="field">
          <label htmlFor="onb-vnd">Tiền mặt VND</label>
          <MoneyInput
            value={vnd}
            onChange={setVnd}
            inputId="onb-vnd"
            ariaLabel="Tiền mặt VND"
          />
        </div>
        <div className="field">
          <label htmlFor="onb-usdt">USDT đang hold</label>
          <MoneyInput
            value={usdt}
            onChange={setUsdt}
            unit="USDT"
            decimal
            maxFraction={6}
            inputId="onb-usdt"
            ariaLabel="USDT đang hold"
          />
        </div>
        <div className="field">
          <label htmlFor="onb-usdt-avg">Giá vốn USDT (VND/USDT)</label>
          <MoneyInput
            value={usdtAvg}
            onChange={setUsdtAvg}
                        inputId="onb-usdt-avg"
            ariaLabel="Giá vốn USDT"
          />
        </div>
        <div className="field">
          <label htmlFor="onb-gold">Nhẫn 9999 đang hold</label>
          <MoneyInput
            value={gold}
            onChange={setGold}
            unit="chỉ"
            decimal
            maxFraction={2}
            inputId="onb-gold"
            ariaLabel="Nhẫn 9999 đang hold"
          />
        </div>
        <div className="field">
          <label htmlFor="onb-gold-avg">Giá vốn nhẫn (/chỉ)</label>
          <MoneyInput
            value={goldAvg}
            onChange={setGoldAvg}
            unit="chỉ"
            inputId="onb-gold-avg"
            ariaLabel="Giá vốn nhẫn"
          />
          <div className="hint">Vàng nhẫn 9999 · ngoài tiệm · 1 loại</div>
        </div>
      </div>

      <button
        type="button"
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
        type="button"
        className="btn-secondary"
        onClick={() => {
          bootstrap({
            vnd: 0,
            usdt: 0,
            usdtAvg: 25650,
            goldChi: 0,
            goldAvg: 7850000,
          })
          setScreen('spend')
        }}
      >
        Bỏ qua · sổ trống
      </button>
    </div>
  )
}
