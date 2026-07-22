# Sổ Tài Sản

App quản lý tài sản cá nhân: **vàng nhẫn 9999**, **USDT OTC**, **coin**, **tiết kiệm**, **cho vay**.

- Dữ liệu **local-first** (localStorage trên máy)
- **Cloud optional** (Supabase): đăng nhập → đồng bộ nhiều máy
- PWA / Thêm MH chính trên iPhone (HTTPS)

## Online

| | |
|---|---|
| **Vercel** | https://so-tai-san.vercel.app |
| **GitHub Pages** | https://coindacap.github.io/so-tai-san/ |
| **Repo** | https://github.com/coindacap/so-tai-san |

## Vercel có vượt giới hạn không?

**Với 1 người dùng cá nhân: gần như không.**

- App là **static frontend** (HTML/JS) — không tốn serverless function
- Gói Hobby free: băng thông + build dư sức cho sổ cá nhân
- Không “đa lỗi” chỉ vì dùng Vercel; lỗi thường do cấu hình env / mạng

Cloud lưu data ở **Supabase free** (không phải Vercel DB):

| | Free đủ cho 1 người? |
|---|---|
| Supabase DB | Có (snapshot JSON rất nhỏ) |
| Supabase Auth | Có |
| Vercel hosting | Có |

## Cloud sync (Supabase) — setup 1 lần

### 1. Tạo project Supabase (miễn phí)

1. Vào https://supabase.com → New project  
2. **Project Settings → API** lấy:
   - Project URL → `VITE_SUPABASE_URL`
   - `anon` `public` key → `VITE_SUPABASE_ANON_KEY`

### 2. Chạy SQL

SQL Editor → dán nội dung file `supabase/schema.sql` → Run.

### 3. Tắt xác nhận email (dùng 1 mình)

**Authentication → Providers → Email → Confirm email = OFF**

### 4. Env local

```bash
cp .env.example .env
# sửa URL + anon key
npm run dev
```

### 5. Env trên Vercel

Project → Settings → Environment Variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Redeploy production.

### 6. Dùng trong app

**Cài đặt → Cloud · đồng bộ máy**

- Tạo tài khoản / đăng nhập (cùng email trên iPhone + Mac)
- Sửa sổ → tự đẩy cloud ~2,5 giây
- Máy mới: đăng nhập → tải sổ từ cloud

## Chạy trên máy

```bash
cd ~/Desktop/so-tai-san
npm install
npm run dev
```

### iPhone LAN

```bash
npm run dev -- --host
```

Mở `http://<IP-Mac>:5173` (chỉ dev; production dùng HTTPS Vercel).

## Build

```bash
npm run build
```

Deploy:

```bash
npx vercel --prod
```

## Luồng nghiệp vụ

1. **VND ↔ USDT** (giá OTC)
2. **USDT → Coin** (hoặc hold cũ không trừ USDT)
3. **VND → Nhẫn 9999**
4. Tiết kiệm / cho vay

## Backup thủ công

Cài đặt → **Export JSON** (vẫn nên làm định kỳ, song song cloud).
