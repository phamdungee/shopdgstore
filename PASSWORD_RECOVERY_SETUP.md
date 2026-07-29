# Cấu hình khôi phục tài khoản bằng Email OTP

DG Store sử dụng OTP 6 số do máy chủ tự sinh, gửi qua Resend và lưu dưới
dạng bcrypt hash trong Supabase. OTP có hiệu lực 5 phút; mã JWT cho phép đặt
lại mật khẩu có hiệu lực 10 phút và chỉ được sử dụng một lần.

## 1. Cài đặt

```bash
npm install
```

Package `resend` đã được thêm vào `package.json`.

## 2. Tạo bảng và hàm Supabase

Mở Supabase Dashboard, chọn **SQL Editor**, sau đó chạy toàn bộ nội dung:

```text
migrations/20260723_password_reset_otp.sql
```

Migration tạo:

- `password_reset_otps`: lưu hash OTP, thời hạn, số lần sai và reset grant.
- `password_reset_audit_logs`: nhật ký bảo mật không lưu OTP/mật khẩu/token.
- `record_password_reset_otp_failure(...)`: tăng số lần sai nguyên tử.
- `complete_password_reset(...)`: kiểm tra grant, cập nhật mật khẩu và hủy
  toàn bộ OTP trong cùng transaction.

RLS được bật và chỉ `service_role` có quyền gọi các hàm nhạy cảm. Không đưa
`SUPABASE_SERVICE_ROLE_KEY` vào frontend.

## 3. Cấu hình Resend

1. Xác minh domain gửi trong Resend.
2. Tạo API key có quyền gửi email.
3. Dùng địa chỉ `from` thuộc domain đã xác minh.
4. Khai báo biến môi trường trên máy chủ:

```env
RESEND_API_KEY=re_xxxxxxxxx
EMAIL_FROM=DG Store <security@your-domain.com>
RESEND_REPLY_TO=support@your-domain.com
```

Khi chạy thử với domain mặc định của Resend, khả năng gửi có thể bị giới hạn.
Production nên luôn dùng domain riêng đã xác minh SPF/DKIM.

## 4. Biến môi trường

Sao chép `.env.example` thành `.env`, sau đó điền giá trị thật:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=replace-with-a-long-random-secret

RESEND_API_KEY=re_xxxxxxxxx
EMAIL_FROM=DG Store <security@your-domain.com>
RESEND_REPLY_TO=support@your-domain.com

PASSWORD_RESET_OTP_TTL_MINUTES=5
PASSWORD_RESET_TOKEN_TTL_MINUTES=10
PASSWORD_RESET_OTP_MAX_ATTEMPTS=5
PASSWORD_RESET_BCRYPT_ROUNDS=10
```

`JWT_SECRET` nên là chuỗi ngẫu nhiên dài tối thiểu 32 byte. Không commit `.env`
hoặc bất kỳ khóa bí mật nào vào Git.

## 5. API

### Gửi OTP

`POST /api/auth/send-reset-otp`

```json
{ "email": "example@gmail.com" }
```

Phản hồi luôn có cùng nội dung với email tồn tại hoặc không tồn tại:

```json
{
  "success": true,
  "message": "Nếu email hợp lệ, mã OTP đã được gửi.",
  "otp_expires_in": 300,
  "resend_after": 60
}
```

Giới hạn: 3 yêu cầu/phút/IP. Gửi mã mới sẽ vô hiệu mã cũ.

### Xác minh OTP

`POST /api/auth/verify-reset-otp`

```json
{ "email": "example@gmail.com", "otp": "527391" }
```

OTP sai làm tăng `attempt`; sau 5 lần mã bị khóa và người dùng phải gửi mã
mới. Khi hợp lệ, API trả `reset_token` JWT có hạn 10 phút.

### Đặt mật khẩu mới

`POST /api/auth/reset-password`

```http
Authorization: Bearer <reset_token>
Content-Type: application/json
```

```json
{
  "password": "NewStrongPassword1!",
  "confirmPassword": "NewStrongPassword1!"
}
```

Mật khẩu cần dài 10–128 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt,
không có khoảng trắng. Sau khi thành công, reset grant và mọi OTP liên quan
đều bị xóa.

## 6. Kiểm tra trước khi triển khai

```bash
npm run lint
npm test
npm run build
```

Checklist production:

- Migration đã chạy đúng Supabase project.
- Resend domain đã xác minh, `EMAIL_FROM` hợp lệ.
- Secret chỉ được khai báo ở môi trường máy chủ.
- HTTPS được bật và reverse proxy truyền đúng IP.
- Log không chứa OTP, mật khẩu hoặc JWT.
- Thử đầy đủ gửi mã, nhập sai 5 lần, mã hết hạn và dùng token hai lần.
