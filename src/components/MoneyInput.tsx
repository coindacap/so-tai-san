import { formatMoneyInput, parseMoney } from '../lib/format'

type Props = {
  value: string | number
  onChange: (raw: string) => void
  unit?: string
  placeholder?: string
  className?: string
  /**
   * true = cho phép phần thập phân (USDT, chỉ vàng, rate…)
   * false = chỉ số nguyên + chấm nghìn (VND)
   */
  decimal?: boolean
  maxFraction?: number
}

/**
 * Chuẩn hoá số thập phân khi gõ trên iPhone VN.
 * Quan trọng: giữ dấu `.` khi user vừa gõ `,` hoặc `.` (để gõ tiếp 0,5).
 */
function sanitizeDecimal(input: string, maxFraction: number): string {
  // Chuẩn hoá các loại dấu thập phân / phẩy iOS + Unicode
  let v = input
    .replace(/．/g, '.') // fullwidth dot
    .replace(/[，､٫、]/g, ',') // các loại phẩy
    .replace(/[^\d.,]/g, '')
  if (!v) return ''

  // Đổi mọi phẩy → chấm (bàn phím iOS VI hay ra dấu phẩy)
  v = v.replace(/,/g, '.')

  // Chỉ một dấu chấm thập phân (dấu chấm đầu tiên)
  const firstDot = v.indexOf('.')
  if (firstDot >= 0) {
    const before = v.slice(0, firstDot).replace(/\./g, '')
    let after = v.slice(firstDot + 1).replace(/\./g, '')
    after = after.slice(0, maxFraction)
    // Giữ "12." khi đang gõ dở
    const endsWithDot = v.endsWith('.')
    if (endsWithDot && after.length === 0) {
      return `${before || '0'}.`
    }
    return after.length > 0 ? `${before || '0'}.${after}` : before || '0'
  }

  // Không có chấm: chỉ chữ số (có thể nhiều cụm đã gộp)
  return v.replace(/\D/g, '')
}

/** Ô nhập tiền VN: hiện 20.301.943; thập phân nhận cả , và . */
export function MoneyInput({
  value,
  onChange,
  unit = 'đ',
  placeholder = '0',
  className = '',
  decimal = false,
  maxFraction = 8,
}: Props) {
  if (decimal) {
    const raw = String(value ?? '')
    return (
      <div className={`inline money-input ${className}`}>
        <input
          className="num"
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={placeholder}
          value={raw}
          onChange={(e) => {
            onChange(sanitizeDecimal(e.target.value, maxFraction))
          }}
        />
        {unit ? <span className="unit">{unit}</span> : null}
      </div>
    )
  }

  const display = formatMoneyInput(value)
  return (
    <div className={`inline money-input ${className}`}>
      <input
        className="num"
        type="text"
        inputMode="numeric"
        enterKeyHint="done"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={placeholder}
        value={display}
        onChange={(e) => {
          // VND: chỉ chữ số → hiển thị lại có chấm nghìn
          const digits = e.target.value.replace(/\D/g, '')
          if (digits.length > 15) return
          onChange(digits)
        }}
      />
      {unit ? <span className="unit">{unit}</span> : null}
    </div>
  )
}

export function moneyNum(s: string | number): number {
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0
  const t = String(s).trim()
  if (!t) return 0

  // "12." đang gõ dở
  if (t.endsWith('.')) {
    const n = Number(t.slice(0, -1))
    return Number.isFinite(n) ? n : 0
  }

  // "0,5" / "1.234,56"
  const lastComma = t.lastIndexOf(',')
  const lastDot = t.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      return Number(t.replace(/\./g, '').replace(',', '.')) || 0
    }
    return Number(t.replace(/,/g, '')) || 0
  }
  if (lastComma >= 0 && t.split(',').length === 2) {
    return Number(t.replace(',', '.').replace(/[^\d.]/g, '')) || 0
  }
  if (/^\d+\.\d{1,12}$/.test(t) || /^\d+$/.test(t)) return Number(t) || 0
  return parseMoney(t)
}
