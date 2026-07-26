# Tích hợp SSI FastConnect → Sổ Tài Sản

Tài liệu khảo sát + kế hoạch kỹ thuật (cập nhật 2026-07-25).

## 1. Kết luận khảo sát

| Hạng mục | Kết quả |
|----------|---------|
| API chính thức | **Có** — [developers.ssi.com.vn](https://developers.ssi.com.vn) · FastConnect v3 |
| SDK Node | `@ssi.developer/ssi-sdk` ([GitHub](https://github.com/SSI-Securities-Inc/ssi-sdk-node)) |
| Lấy **vị thế cổ phiếu** | `trading.portfolio.getEquityPositions(accountNo)` |
| Lấy **số dư tiền** | `trading.portfolio.getEquityBalance(accountNo)` |
| Giá vốn | `costPrice` trên từng position |
| Market data (không OTP) | `Data` client — OHLC, securities summary |
| Trading / danh mục | Cần **OTP** lần đầu + refresh token |

### Endpoint liên quan (v3)

| Mục đích | Path |
|----------|------|
| Auth token | `POST /api/v3/auth/token` |
| Refresh | `POST /api/v3/auth/refresh` |
| OTP | `POST /api/v3/auth/requestOtp` |
| Account info | `GET /api/v3/account/info` |
| Balance | `GET /api/v3/trading/accountBalance` |
| **Positions** | `GET /api/v3/trading/position` |
| Order book | `GET /api/v3/trading/orderBook` |
| Base URL | `https://api.ssi.com.vn` |

### Dữ liệu position (equity) map được

```
symbol, quantity, sellableQuantity, costPrice,
blockQuantity, dividendQuantity, …
```

→ Đủ để ghi sổ: **mã · số lượng · giá vốn (đ) · P/L khi có giá TT**.

## 2. Việc anh cần làm (SSI)

1. Có **tài khoản giao dịch SSI** (iBoard).
2. Đăng ký developer: https://developers.ssi.com.vn → **Trải nghiệm API / Register**.
3. Tạo app → nhận:
   - `clientId`
   - `apiKey` / `apiSecret`
   - `privateKey` (chỉ cần nếu đặt lệnh; **đồng bộ danh mục có thể không cần ký lệnh** — xác nhận với SSI)
4. Ghi **accountNo** (số TK chứng khoán, vd `1234567`).
5. Lần auth đầu: **OTP** (SMS/app SSI).
6. Môi trường: UAT trước, production sau (SSI cấp URL/key riêng).

> **Không commit** key/secret lên Git. Chỉ env server.

## 3. Kiến trúc đề xuất (Sổ Tài Sản)

```
[iPhone/Mac PWA]
      │  HTTPS + đăng nhập cloud (Supabase)
      ▼
[Backend proxy]  ← Vercel serverless / Node
  - Lưu token SSI (encrypted) theo user
  - Gọi SDK / REST SSI
  - Không expose apiSecret ra browser
      │
      ▼
[SSI FastConnect]
  getEquityPositions + getEquityBalance
      │
      ▼
[Map → snapshot CK]
  assetClass: stock, quoteCurrency: VND
      │
      ▼
[Zustand store / cloud snapshot]
```

**Vì sao cần backend?**  
`apiSecret` + token + OTP **không** được nhét vào frontend Vite (ai cũng đọc được).

## 4. Phạm vi sản phẩm (MVP)

### Làm (đồng bộ sổ)

- [x] Khảo sát API + mapper (file `src/lib/ssi/`)
- [ ] Asset class `stock` + UI danh mục CK
- [ ] Backend `/api/ssi/auth` + `/api/ssi/sync`
- [ ] Nút **Đồng bộ SSI** trong Cài đặt
- [ ] Giá tham chiếu: SSI market summary **hoặc** nguồn public (chỉ giá)

### Không làm (MVP)

- Đặt/hủy lệnh từ Sổ Tài Sản
- Phái sinh / margin call chi tiết
- TCBS (chưa có API public tương đương)

## 5. Map nghiệp vụ

| SSI | Sổ Tài Sản |
|-----|------------|
| `symbol` | `Asset.symbol` (VNM, FPT…) |
| `quantity` | Hold (điều chỉnh / snapshot) |
| `costPrice` | AVG giá vốn (đ/cp) |
| `availableCash` | (tuỳ chọn) ghi chú tiền CK, **không** trộn VND tiệm |
| Market price | `quotes[assetId].price` (VND) |

**Chiến lược sync MVP:**  
Mỗi lần bấm đồng bộ → **set hold = quantity SSI** + khóa AVG từ `costPrice` (snapshot), không replay toàn bộ lịch sử lệnh.  
Sau này có thể import order history nếu cần.

## 6. Bảo mật

- Secret chỉ trên server env: `SSI_CLIENT_ID`, `SSI_API_KEY`, `SSI_API_SECRET`
- Token refresh lưu Supabase (user_id) encrypted hoặc Vercel KV
- App chỉ gửi session Supabase; server gọi SSI
- Không log full token

## 7. Checklist triển khai

| Bước | Ai | Trạng thái |
|------|-----|------------|
| Đăng ký FastConnect | Anh | ⏳ |
| Cấp key + accountNo | SSI | ⏳ |
| Scaffold stock + mapper | Dev | ✅ đang làm |
| UI cổ phiếu thủ công | Dev | ⏳ sau khi có scaffold |
| Backend sync | Dev | ⏳ khi có key |
| Test UAT | Cả hai | ⏳ |

## 8. Tham chiếu code mẫu SSI

```js
// sample_05_balance.js (rút gọn)
const trading = new Trading(auth)
const accounts = await trading.account.getAccountInfo()
const positions = await trading.portfolio.getEquityPositions(ACCOUNT_NO)
// pos.symbol, pos.quantity, pos.costPrice, pos.sellableQuantity
```

Repo: `SSI-Securities-Inc/ssi-fastconnect-v3-tutorials`
