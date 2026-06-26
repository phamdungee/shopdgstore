# DG Store - bản tích hợp Supabase Login hoàn chỉnh

## 1. File đã chỉnh

Bản này đã tích hợp frontend với `server.js`:

- `server.js`: backend Express + Supabase + bcrypt + JWT
- `login.html` + `assets/js/login.js`: đăng ký / đăng nhập thật qua `/api/register` và `/api/login`
- `index.html` + `assets/js/index.js`: nhận trạng thái đăng nhập thật bằng JWT
- `profile.html` + `assets/js/profile.js`: lấy thông tin tài khoản từ `/api/me`
- `nap-tien.html` + `assets/js/nap-tien.js`: chặn truy cập nếu chưa đăng nhập, tự điền username vào ô UID
- `supabase_schema.sql`: SQL tạo bảng Supabase phù hợp backend
- `.env.example`: mẫu biến môi trường

## 2. Cấu trúc

```txt
project/
├─ .env.example
├─ package.json
├─ server.js
├─ supabase_schema.sql
├─ index.html
├─ login.html
├─ nap-tien.html
├─ profile.html
└─ assets/
   ├─ css/
   │  ├─ common.css
   │  ├─ index.css
   │  ├─ login.css
   │  ├─ nap-tien.css
   │  └─ profile.css
   ├─ js/
   │  ├─ index.config.js
   │  ├─ index.js
   │  ├─ login.js
   │  ├─ nap-tien.config.js
   │  ├─ nap-tien.js
   │  ├─ profile.config.js
   │  └─ profile.js
   └─ img/
```

## 3. Tạo bảng Supabase

Vào Supabase:

```txt
Project → SQL Editor → New query
```

Dán nội dung trong file:

```txt
supabase_schema.sql
```

Rồi bấm **Run**.

## 4. Cấu hình backend

Đổi tên file:

```txt
.env.example
```

thành:

```txt
.env
```

Sau đó điền:

```env
PORT=3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
JWT_SECRET=doi_chuoi_nay_that_dai_va_kho_doan
ADMIN_SETUP_KEY=doi_key_nay_sau_khi_tao_admin
```

Lấy `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` ở:

```txt
Supabase → Project Settings → API
```

Không đưa `SUPABASE_SERVICE_ROLE_KEY` vào HTML hoặc JS frontend.

## 5. Cài thư viện

Mở terminal trong thư mục project rồi chạy:

```bash
npm install
```

## 6. Chạy web

```bash
npm start
```

Mở:

```txt
http://localhost:3000/login.html
```

Không nên mở trực tiếp bằng `file://`.

## 7. Tạo admin nhanh

Gửi POST tới:

```txt
http://localhost:3000/api/setup-admin
```

Body JSON:

```json
{
  "setupKey": "doi_key_nay_sau_khi_tao_admin",
  "username": "admin",
  "email": "admin@dgstore.local",
  "password": "Admin@123456",
  "fullName": "Quản trị viên"
}
```

Sau đó đăng nhập:

```txt
Username: admin
Password: Admin@123456
```

Sau khi tạo admin xong, nên đổi hoặc xóa `ADMIN_SETUP_KEY` trong `.env`.

## 8. API có sẵn

```txt
GET  /api/health
POST /api/register
POST /api/login
GET  /api/me
POST /api/logout
POST /api/setup-admin
```

## 9. Ghi chú

- Mật khẩu được hash bằng bcrypt ở backend.
- Frontend không giữ `service_role key`.
- Frontend lưu JWT vào `localStorage`.
- Bản nâng cao nên đổi JWT sang httpOnly cookie để bảo mật hơn.
