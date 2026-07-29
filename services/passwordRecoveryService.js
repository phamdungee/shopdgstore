const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const otpModel = require('../models/passwordResetOtpModel');
const { sendResetOtpEmail } = require('./resendOtpService');
const logger = require('../utils/appLogger');
const {
  JWT_SECRET,
  PASSWORD_RESET_OTP_TTL_MINUTES,
  PASSWORD_RESET_TOKEN_TTL_MINUTES,
  PASSWORD_RESET_OTP_MAX_ATTEMPTS,
  PASSWORD_RESET_BCRYPT_ROUNDS
} = require('../config/env');
const {
  generateOtp,
  hashToken,
  normalizeEmail,
  safeHashEquals
} = require('../utils/passwordRecoverySecurity');

const GENERIC_SEND_RESPONSE = {
  ok: true,
  success: true,
  message: 'Nếu email hợp lệ, mã OTP đã được gửi.',
  otp_expires_in: PASSWORD_RESET_OTP_TTL_MINUTES * 60,
  resend_after: 60
};
const INVALID_OTP_MESSAGE = 'Mã OTP không hợp lệ, đã hết hạn hoặc đã bị khóa.';
const DUMMY_OTP_HASH = bcrypt.hashSync('000000', PASSWORD_RESET_BCRYPT_ROUNDS);

class RecoveryError extends Error {
  constructor(message, status = 400, code = 'PASSWORD_RECOVERY_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function requestMetadata(req) {
  return {
    request_ip: req.headers['cf-connecting-ip'] || req.ip || null,
    user_agent: String(req.headers['user-agent'] || '').slice(0, 500) || null
  };
}

async function audit({ event, email, userId, req, metadata = {} }) {
  try {
    await otpModel.writeAuditLog({
      user_id: userId ? String(userId) : null,
      email_digest: hashToken(normalizeEmail(email)),
      event,
      request_ip: requestMetadata(req).request_ip,
      user_agent: requestMetadata(req).user_agent,
      metadata
    });
  } catch (error) {
    logger.warn('password_recovery_audit_failed', { event, error: error.message });
  }
}

async function sendResetOtp({ email, req }) {
  const normalizedEmail = normalizeEmail(email);
  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, PASSWORD_RESET_BCRYPT_ROUNDS);
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, status')
    .ilike('email', normalizedEmail)
    .maybeSingle();
  if (error) {
    logger.error('password_recovery_user_lookup_failed', { error: error.message });
    return GENERIC_SEND_RESPONSE;
  }

  if (!user || user.status !== 'active') {
    await audit({ event: 'otp_requested_unknown', email: normalizedEmail, req });
    return GENERIC_SEND_RESPONSE;
  }

  let otpRecord;
  try {
    await otpModel.invalidateActiveOtps(normalizedEmail);
    otpRecord = await otpModel.createOtp({
      user_id: String(user.id),
      email: normalizedEmail,
      otp_hash: otpHash,
      expires_at: new Date(Date.now() + PASSWORD_RESET_OTP_TTL_MINUTES * 60_000).toISOString(),
      attempts: 0,
      verified: false,
      request_ip: requestMetadata(req).request_ip
    });
    await sendResetOtpEmail({ email: user.email, otp });
    await audit({ event: 'otp_sent', email: normalizedEmail, userId: user.id, req });
  } catch (sendError) {
    if (otpRecord?.id) {
      await otpModel.deleteOtp(otpRecord.id).catch(() => {});
    }
    logger.error('password_recovery_otp_send_failed', {
      userId: String(user.id),
      error: sendError.message
    });
    await audit({
      event: 'otp_send_failed',
      email: normalizedEmail,
      userId: user.id,
      req,
      metadata: { reason: 'delivery_or_storage_error' }
    });
  }
  return GENERIC_SEND_RESPONSE;
}

async function verifyResetOtp({ email, otp, req }) {
  const normalizedEmail = normalizeEmail(email);
  const record = await otpModel.findLatestByEmail(normalizedEmail);
  const now = Date.now();
  const unusable = !record ||
    record.verified ||
    record.consumed_at ||
    record.locked_at ||
    record.attempts >= PASSWORD_RESET_OTP_MAX_ATTEMPTS ||
    new Date(record.expires_at).getTime() <= now;

  const matches = await bcrypt.compare(String(otp || ''), record?.otp_hash || DUMMY_OTP_HASH);
  if (unusable || !matches) {
    if (record && !unusable) {
      await otpModel.recordFailedAttempt(record.id, PASSWORD_RESET_OTP_MAX_ATTEMPTS);
    }
    await audit({
      event: 'otp_verification_failed',
      email: normalizedEmail,
      userId: record?.user_id,
      req
    });
    throw new RecoveryError(INVALID_OTP_MESSAGE, 400, 'INVALID_OTP');
  }

  const jti = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(jti);
  const tokenExpiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60_000).toISOString();
  const verified = await otpModel.markVerified({
    id: record.id,
    tokenHash,
    tokenExpiresAt,
    maxAttempts: PASSWORD_RESET_OTP_MAX_ATTEMPTS
  });
  if (!verified) throw new RecoveryError(INVALID_OTP_MESSAGE, 400, 'INVALID_OTP');

  const resetToken = jwt.sign({
    purpose: 'password-reset',
    otpId: record.id,
    jti
  }, JWT_SECRET, {
    subject: String(record.user_id),
    issuer: 'dg-store',
    audience: 'dg-store-password-reset',
    expiresIn: `${PASSWORD_RESET_TOKEN_TTL_MINUTES}m`
  });

  await audit({
    event: 'otp_verified',
    email: normalizedEmail,
    userId: record.user_id,
    req
  });
  return { ok: true, success: true, reset_token: resetToken };
}

async function resetPassword({ resetGrant, password, req }) {
  const record = await otpModel.findResetGrant(resetGrant.otpId);
  const active = record &&
    record.verified &&
    !record.consumed_at &&
    record.user_id === String(resetGrant.sub) &&
    new Date(record.reset_token_expires_at).getTime() > Date.now() &&
    safeHashEquals(record.reset_token_hash, hashToken(resetGrant.jti));
  if (!active) {
    throw new RecoveryError('Phiên khôi phục không hợp lệ hoặc đã hết hạn.', 401, 'INVALID_RESET_TOKEN');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const completed = await otpModel.completePasswordReset({
    otpId: record.id,
    userId: record.user_id,
    passwordHash,
    tokenHash: hashToken(resetGrant.jti)
  });
  if (!completed) {
    throw new RecoveryError('Phiên khôi phục đã được sử dụng hoặc đã hết hạn.', 401, 'RESET_TOKEN_CONSUMED');
  }

  await audit({
    event: 'password_reset_completed',
    email: '',
    userId: record.user_id,
    req
  });
  logger.info('password_reset_completed', { userId: record.user_id });
  return { ok: true, success: true, message: 'Khôi phục mật khẩu thành công.' };
}

module.exports = {
  RecoveryError,
  sendResetOtp,
  verifyResetOtp,
  resetPassword,
  GENERIC_SEND_RESPONSE
};
