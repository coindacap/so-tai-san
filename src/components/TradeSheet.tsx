import { Action } from './Action'
import type { Screen } from '../types'

type Props = {
  open: boolean
  onClose: () => void
  onPick: (screen: Screen, detailId?: string | null) => void
}

/**
 * Sheet ➕ giao dịch tài sản — một cửa vào các form tiền,
 * tránh chồng quick-action + detail + empty CTA.
 */
export function TradeSheet({ open, onClose, onPick }: Props) {
  if (!open) return null

  function go(screen: Screen, detailId?: string | null) {
    onClose()
    onPick(screen, detailId)
  }

  return (
    <div
      className="sheet-bg"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div
        className="sheet trade-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grab" />
        <h3 id="trade-sheet-title">Giao dịch tài sản</h3>
        <p className="sheet-intro trade-sheet-intro">
          Mỗi việc một cửa. Chi tiêu hàng ngày nằm tab Chi tiêu — không ghi ở
          đây để tránh trừ tiền mặt hai lần.
        </p>

        <div className="trade-sheet-group" role="group" aria-label="Tiền mặt và cầu nối">
          <Action
            icon="cash"
            cls="cash"
            title="Nạp / rút VND"
            desc="Chuyển bank ↔ sổ · không phải ghi chi tiêu"
            onClick={() => go('cash')}
          />
          <Action
            icon="swap"
            cls="usdt"
            title="Đổi VND ↔ USDT"
            desc="OTC / P2P · trừ hoặc cộng tiền mặt"
            onClick={() => go('usdt')}
          />
        </div>

        <div className="trade-sheet-group" role="group" aria-label="Coin">
          <Action
            icon="coin"
            cls="coin"
            title="Mua coin bằng USDT"
            desc="Trừ USDT trong sổ (luồng chuẩn)"
            onClick={() => go('buy-coin')}
          />
          <Action
            icon="coin"
            cls="coin"
            title="Bán coin lấy USDT"
            desc="Nhận USDT về sổ"
            onClick={() => go('sell-coin')}
          />
          <Action
            icon="edit"
            cls="usdt"
            title="Ghi hold coin cũ"
            desc="Mua từ trước · không trừ USDT hiện tại"
            onClick={() => go('buy-coin', '__old_hold__')}
          />
        </div>

        <div className="trade-sheet-group" role="group" aria-label="Vàng">
          <Action
            icon="gold"
            cls="gold"
            title="Mua nhẫn 9999"
            desc="Trả giá bán ra tiệm · trừ VND"
            onClick={() => go('buy-gold')}
          />
          <Action
            icon="gold"
            cls="gold"
            title="Bán nhẫn 9999"
            desc="Nhận giá mua vào tiệm · cộng VND"
            onClick={() => go('sell-gold')}
          />
        </div>

        <div className="trade-sheet-group" role="group" aria-label="Khác">
          <Action
            icon="refresh"
            cls="cash"
            title="Cập nhật giá"
            desc="Nhẫn 2 chiều · USDT OTC · coin"
            onClick={() => go('prices')}
          />
          <Action
            icon="expense"
            cls="loan"
            title="Lịch sử giao dịch"
            desc="Mua · bán · đổi · nạp/rút · gắn tiền mặt"
            onClick={() => go('history')}
          />
        </div>

        <button type="button" className="sheet-cancel" onClick={onClose}>
          Đóng
        </button>
      </div>
    </div>
  )
}
