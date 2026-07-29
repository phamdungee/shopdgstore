const express = require('express');
const controller = require('../controllers/passwordRecoveryController');
const {
  resetOtpSendLimiter,
  resetOtpVerifyLimiter,
  resetPasswordLimiter
} = require('../middlewares/rateLimitMiddleware');
const {
  validateSendOtp,
  validateVerifyOtp,
  validateResetPassword
} = require('../middlewares/passwordRecoveryValidation');
const authenticateResetToken = require('../middlewares/resetTokenMiddleware');

const router = express.Router();

router.post('/send-reset-otp', resetOtpSendLimiter, validateSendOtp, controller.sendResetOtp);
router.post('/verify-reset-otp', resetOtpVerifyLimiter, validateVerifyOtp, controller.verifyResetOtp);
router.post('/reset-password', resetPasswordLimiter, authenticateResetToken, validateResetPassword, controller.resetPassword);

module.exports = router;
