
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const compression = require('compression');
const { PORT, CORS_ALLOWED_ORIGINS } = require('./config/env');
const registerRoutes = require('./routes');
const { startCassoAutoPolling } = require('./routes/deposits');

const app = express();
app.use(compression());
app.set('trust proxy', 1);

const allowedOrigins = new Set([
  ...CORS_ALLOWED_ORIGINS,
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://dungicl.store',
  'https://www.dungicl.store'
]);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  try {
    const url = new URL(origin);
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return true;
    // Allow all Vercel deployment domains
    if (url.hostname.endsWith('.vercel.app')) return true;
    return false;
  } catch {
    return false;
  }
}

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.tailwindcss.com https://accounts.google.com https://apis.google.com https://connect.facebook.net https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://accounts.google.com https://challenges.cloudflare.com",
      "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
      "img-src 'self' data: https:",
      "connect-src 'self' http://localhost:* http://127.0.0.1:* https: https://challenges.cloudflare.com",
      "frame-src 'self' https://accounts.google.com https://connect.facebook.net https://www.facebook.com https://challenges.cloudflare.com",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  );
  next();
});

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    const error = new Error(`Origin is not allowed by CORS: ${origin}`);
    error.status = 403;
    error.code = 'CORS_ORIGIN_DENIED';
    return callback(error);
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Keep fingerprint-free CSS/JS fresh while caching immutable media efficiently.
app.use('/assets', express.static(path.join(__dirname, 'assets'), {
  setHeaders: (res, filepath) => {
    if (/\.(?:css|js)$/i.test(filepath)) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// Serving HTML or root files with no-cache (prevent stale pages)
app.use(express.static(path.join(__dirname), {
  index: false,
  extensions: ['html'],
  setHeaders: (res, filepath) => {
    if (filepath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

registerRoutes(app);

// Keep API failures machine-readable so the login page can show the real cause.
app.use('/api', (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const requestId = require('crypto').randomBytes(5).toString('hex');
  const status = err && err.status >= 400 && err.status < 600 ? err.status : 500;
  console.error(`[API ${requestId}] ${req.method} ${req.originalUrl}:`, err);
  return res.status(status).json({
    ok: false,
    message: err && err.code === 'CORS_ORIGIN_DENIED'
      ? 'Tên miền hiện tại chưa được máy chủ cho phép đăng nhập'
      : status === 400
        ? 'Dữ liệu gửi lên máy chủ không hợp lệ'
        : 'Máy chủ gặp lỗi khi xử lý yêu cầu',
    requestId
  });
});

const isVercel = process.env.VERCEL === '1';

if (!isVercel) {
  try {
    // Fallback Background Cron Scheduler: release expired inventory reservations
    const supabase = require('./config/supabase');
    setInterval(async () => {
      try {
        const { data: count, error } = await supabase.rpc('release_expired_reservations');
        if (error) {
          console.error('[Scheduler] Error cleaning up expired reservations:', error.message);
        } else if (count > 0) {
          console.log(`[Scheduler] Cleaned up ${count} expired reservations successfully.`);
        }
      } catch (err) {
        console.error('[Scheduler] Exception cleaning up expired reservations:', err.message);
      }
    }, 300000); // Check every 5 minutes
    console.log('Reservation cleanup scheduler started (5m interval).');
  } catch (err) {
    console.error('Cannot start background jobs:', err.message);
  }

  // ── HTTPS Support (fixes Cloudflare Error 525) ──────────────────────────────
  // Sử dụng port 8443 để tránh xung đột với Windows svchost/IKEEXT trên port 443.
  // Cloudflare hỗ trợ HTTPS trên port 8443 — cấu hình Origin Rules trỏ về port này.
  const sslCertPath = process.env.SSL_CERT;
  const sslKeyPath  = process.env.SSL_KEY;

  if (sslCertPath && sslKeyPath && fs.existsSync(sslCertPath) && fs.existsSync(sslKeyPath)) {
    try {
      const cert = fs.readFileSync(sslCertPath, "utf8");
      const key  = fs.readFileSync(sslKeyPath, "utf8");

      const sslOptions = { cert, key };

      // Start HTTPS server on PORT (8443) — Cloudflare connects here via Origin Rules
      const httpsServer = https.createServer(sslOptions, app);

      httpsServer.on('tlsClientError', (err) => {
        console.error('[TLS CLIENT ERROR]', err.message);
      });

      httpsServer.listen(PORT, () => {
        console.log(`✅ HTTPS server running on port ${PORT} (Cloudflare Origin Rules → port ${PORT})`);
      });

    } catch (sslErr) {
      console.error(sslErr);
      app.listen(PORT, () => {
        console.log(`Server running at: http://localhost:${PORT}`);
      });
    }
  } else {
    // Không có SSL cert — chạy HTTP thường (phù hợp Cloudflare Flexible mode)
    if (sslCertPath || sslKeyPath) {
      console.warn('[SSL] SSL_CERT or SSL_KEY is set but certificate file not found. Running HTTP only.');
      console.warn('[SSL] Check paths:', { sslCertPath, sslKeyPath });
    }
    app.listen(PORT, () => {
      console.log(`Server running at: http://localhost:${PORT}`);
      console.log(`Login page: http://localhost:${PORT}/login.html`);
      // startCassoAutoPolling(); // Đã tắt tiến trình tự động quét giao dịch Casso
    });
  }
} else {
  console.log('Running server in Vercel Serverless environment.');
}

module.exports = app;
