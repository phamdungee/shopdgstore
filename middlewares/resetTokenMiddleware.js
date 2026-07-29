const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');

function authenticateResetToken(req, res, next) {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({
      ok: false,
      success: false,
      message: 'Thiếu reset token.'
    });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      issuer: 'dg-store',
      audience: 'dg-store-password-reset'
    });
    if (payload.purpose !== 'password-reset' || !payload.otpId || !payload.jti || !payload.sub) {
      throw new Error('Invalid reset token payload');
    }
    req.resetGrant = payload;
    return next();
  } catch (_error) {
    return res.status(401).json({
      ok: false,
      success: false,
      message: 'Reset token không hợp lệ hoặc đã hết hạn.'
    });
  }
}

module.exports = authenticateResetToken;
