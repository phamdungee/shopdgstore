const axios = require('axios');
const env = require('../config/env');

async function verifyTurnstile(req, res, next) {
  // If the secret key is not set, or is the Cloudflare test secret key, skip Turnstile API verification (for testing/local development)
  if (!env.CLOUDFLARE_TURNSTILE_SECRET_KEY || env.CLOUDFLARE_TURNSTILE_SECRET_KEY === '1x00000000000000000000000000000000UNBIASED') {
    return next();
  }

  const token = req.body['cf-turnstile-response'] || req.headers['x-cf-turnstile-response'];
  if (!token) {
    return res.status(400).json({ ok: false, message: 'Thiếu mã xác thực chống bot (Turnstile). Vui lòng thử lại.' });
  }

  // Get client IP address
  let ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    ip = forwarded.split(',')[0].trim();
  }

  try {
    const response = await axios.post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      new URLSearchParams({
        secret: env.CLOUDFLARE_TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip
      }),
      { 
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 6000 // 6 seconds timeout to avoid hanging if network to Cloudflare is slow
      }
    );

    if (response.data && response.data.success === true) {
      return next();
    }
    
    console.warn('[Turnstile Warn] Verification failed:', response.data);
    return res.status(400).json({ 
      ok: false, 
      message: 'Xác thực chống bot không hợp lệ hoặc đã hết hạn. Vui lòng tải lại trang và thử lại.' 
    });
  } catch (err) {
    console.error('[Turnstile Error] Connection to Cloudflare failed:', err.message);
    
    // High-availability fallback: if connection to Cloudflare siteverify endpoint fails (DNS block, timeout, down)
    // we log it and allow the request to proceed so that Cloudflare connection errors do not block legitimate users.
    const isConnectionError = err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.message.includes('timeout');
    if (isConnectionError) {
      console.warn('[Turnstile Warn] Bypassing Turnstile verification due to Cloudflare API connection failure.');
      return next();
    }

    return res.status(500).json({ ok: false, message: 'Lỗi máy chủ khi xác thực chống bot (Turnstile).' });
  }
}

module.exports = verifyTurnstile;
