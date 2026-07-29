const {
  normalizeEmail,
  isValidEmail,
  validateStrongPassword
} = require('../utils/passwordRecoverySecurity');

function failure(res, message, details) {
  return res.status(400).json({ ok: false, success: false, message, details });
}

function validateSendOtp(req, res, next) {
  const email = normalizeEmail(req.body.email);
  if (!isValidEmail(email)) return failure(res, 'Vui lòng nhập địa chỉ email hợp lệ.');
  req.passwordRecovery = { email };
  return next();
}

function validateVerifyOtp(req, res, next) {
  const email = normalizeEmail(req.body.email);
  const otp = String(req.body.otp || '').trim();
  if (!isValidEmail(email) || !/^\d{6}$/.test(otp)) {
    return failure(res, 'Email hoặc mã OTP không hợp lệ.');
  }
  req.passwordRecovery = { email, otp };
  return next();
}

function validateResetPassword(req, res, next) {
  const password = String(req.body.password || '');
  const confirmPassword = String(req.body.confirmPassword || '');
  if (password !== confirmPassword) return failure(res, 'Mật khẩu nhập lại chưa khớp.');
  const strength = validateStrongPassword(password);
  if (!strength.valid) {
    return failure(
      res,
      'Mật khẩu cần 10-128 ký tự, gồm chữ hoa, chữ thường, số, ký tự đặc biệt và không chứa khoảng trắng.',
      strength.rules
    );
  }
  req.passwordRecovery = { password };
  return next();
}

module.exports = { validateSendOtp, validateVerifyOtp, validateResetPassword };
