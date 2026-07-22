# Sổ Tài Sản

App quản lý tài sản cá nhân: **vàng nhẫn 9999**, **USDT OTC**, **coin** (mua bằng USDT).

- Dữ liệu lưu **trên máy** (localStorage)
- Dùng offline, cài lên iPhone như app (PWA / Thêm vào MH chính)
- Không cần đăng nhập, không gửi data ra server

## Chạy trên máy

```bash
cd ~/Desktop/so-tai-san
npm install
npm run dev
```

Mở URL Vite in ra (thường `http://localhost:5173`).

### Xem trên iPhone (cùng Wi‑Fi)

1. Mac chạy `npm run dev -- --host`
2. iPhone Safari mở `http://<IP-Mac>:5173`
3. Chia sẻ → **Thêm vào Màn hình chính**

## Build production

```bash
npm run build
npm run preview -- --host
```

### Online (HTTPS — iPhone “Thêm MH chính”)

- **GitHub Pages:** https://coindacap.github.io/so-tai-san/
- Repo: https://github.com/coindacap/so-tai-san
- Mỗi push `main` → Actions build & deploy tự động

Hoặc deploy `dist/` lên Vercel / Netlify / Cloudflare Pages.

## Luồng nghiệp vụ

1. **VND ↔ USDT** (giá OTC tư nhân)
2. **USDT → Coin**
3. **VND → Nhẫn 9999** (1/2/5 chỉ, giá bán ra tiệm)
4. P/L nhẫn theo **giá mua vào** (bảng 2 chiều)

## Backup

Cài đặt → **Export JSON** định kỳ. Import lại khi đổi máy.
