const axios = require('axios');
const { CLOUDFLARE_TURNSTILE_SECRET_KEY } = require('../config/env');

async function verifyTurnstile(req, res, next) {
  try {
    // If no secret key is configured or dummy key, allow bypass in dev
    if (!CLOUDFLARE_TURNSTILE_SECRET_KEY || CLOUDFLARE_TURNSTILE_SECRET_KEY.startsWith('1x00000000')) {
      return next();
    }

    const token = req.body['cf-turnstile-response'] || 
                  req.body.turnstileToken || 
                  req.headers['cf-turnstile-response'] || 
                  req.headers['x-turnstile-token'];

    if (!token) {
      return res.status(400).json({
        ok: false,
        message: 'Vui lòng hoàn thành xác thực chống bot (Cloudflare Turnstile).'
      });
    }

    const ip = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress;

    const formData = new URLSearchParams();
    formData.append('secret', CLOUDFLARE_TURNSTILE_SECRET_KEY);
    formData.append('response', token);
    if (ip) formData.append('remoteip', ip);

    const result = await axios.post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      formData,
      { timeout: 8000 }
    );

    if (result.data && result.data.success) {
      return next();
    } else {
      console.warn('[Turnstile] Verification failed:', result.data ? result.data['error-codes'] : 'No data');
      return res.status(400).json({
        ok: false,
        message: 'Xác thực Cloudflare Turnstile không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.'
      });
    }
  } catch (err) {
    console.error('[Turnstile] Verification error:', err.message);
    return res.status(500).json({
      ok: false,
      message: 'Lỗi xác thực hệ thống bảo mật Cloudflare Turnstile.'
    });
  }
}

module.exports = verifyTurnstile;

