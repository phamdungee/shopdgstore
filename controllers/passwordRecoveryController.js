const recoveryService = require('../services/passwordRecoveryService');
const logger = require('../utils/appLogger');

function handleError(res, error, event) {
  if (error instanceof recoveryService.RecoveryError) {
    return res.status(error.status).json({
      ok: false,
      success: false,
      code: error.code,
      message: error.message
    });
  }
  logger.error(event, { error: error.message });
  return res.status(500).json({
    ok: false,
    success: false,
    message: 'Không thể xử lý yêu cầu lúc này. Vui lòng thử lại sau.'
  });
}

async function sendResetOtp(req, res) {
  try {
    const result = await recoveryService.sendResetOtp({
      email: req.passwordRecovery.email,
      req
    });
    return res.json(result);
  } catch (error) {
    return handleError(res, error, 'send_reset_otp_failed');
  }
}

async function verifyResetOtp(req, res) {
  try {
    const result = await recoveryService.verifyResetOtp({
      ...req.passwordRecovery,
      req
    });
    return res.json(result);
  } catch (error) {
    return handleError(res, error, 'verify_reset_otp_failed');
  }
}

async function resetPassword(req, res) {
  try {
    const result = await recoveryService.resetPassword({
      resetGrant: req.resetGrant,
      password: req.passwordRecovery.password,
      req
    });
    return res.json(result);
  } catch (error) {
    return handleError(res, error, 'reset_password_failed');
  }
}

module.exports = { sendResetOtp, verifyResetOtp, resetPassword };
