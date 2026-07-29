const rateLimit = require('express-rate-limit');

// ══════════════════════════════════════════════════════════
// Shared key generator: ưu tiên CF-Connecting-IP (header tin cậy
// khi server chạy sau Cloudflare), fallback về req.ip (đã được
// Express phân giải đúng nhờ trust proxy = 1 trong server.js).
//
// LƯU Ý BẢO MẬT: header CF-Connecting-IP chỉ đáng tin khi
// toàn bộ traffic đều đi qua Cloudflare. Nếu server có thể
// bị truy cập trực tiếp, hacker có thể giả mạo header này.
// → Cần chặn truy cập trực tiếp bằng firewall (chỉ cho phép
//   IP range của Cloudflare) hoặc dùng Cloudflare Tunnel.
// ══════════════════════════════════════════════════════════
function cfKeyGenerator(req) {
  return req.headers['cf-connecting-ip'] || req.ip;
}

// Tắt validation xForwardedForHeader để tránh lỗi
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR khi chạy sau proxy.
// Chúng ta đã tự xử lý IP qua keyGenerator ở trên.
const sharedValidate = { xForwardedForHeader: false, keyGeneratorIpFallback: false };

// 5 requests/min/IP
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { ok: false, message: 'Bạn đã gửi yêu cầu đăng nhập quá nhiều lần. Vui lòng thử lại sau 1 phút.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: sharedValidate,
});

// 3 requests/min/IP
const registerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { ok: false, message: 'Bạn đã yêu cầu đăng ký quá nhiều lần. Vui lòng thử lại sau 1 phút.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: sharedValidate,
});

// Password recovery: keep send limits strict and verification attempts bounded.
const resetOtpSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: {
    ok: false,
    success: false,
    message: 'Bạn đã gửi quá nhiều yêu cầu OTP. Vui lòng thử lại sau 1 phút.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: sharedValidate,
});

const resetOtpVerifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: {
    ok: false,
    success: false,
    message: 'Bạn đã thử mã OTP quá nhiều lần. Vui lòng chờ trước khi thử lại.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: sharedValidate,
});

const resetPasswordLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: {
    ok: false,
    success: false,
    message: 'Quá nhiều yêu cầu đổi mật khẩu. Vui lòng thử lại sau.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: sharedValidate,
});

// 10 requests/min/IP
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { ok: false, message: 'Bạn đã tải tệp lên quá giới hạn. Vui lòng thử lại sau 1 phút.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: sharedValidate,
});

// 10 requests/min/IP
const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { ok: false, message: 'Bạn đã gửi yêu cầu thanh toán quá nhiều lần. Vui lòng thử lại sau 1 phút.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: sharedValidate,
});

// 100 requests/min/IP
const defaultLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { ok: false, message: 'Bạn đã gửi quá nhiều yêu cầu API. Vui lòng thử lại sau 1 phút.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: sharedValidate,
});

module.exports = {
  loginLimiter,
  registerLimiter,
  resetOtpSendLimiter,
  resetOtpVerifyLimiter,
  resetPasswordLimiter,
  uploadLimiter,
  checkoutLimiter,
  defaultLimiter
};
