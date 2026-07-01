
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { PORT, CORS_ALLOWED_ORIGINS } = require('./config/env');
const registerRoutes = require('./routes');
const { startCassoAutoPolling } = require('./routes/deposits');
const { startBotScheduler, startTelegramPolling } = require('./routes/tracking');

const app = express();
app.set('trust proxy', 1);

const allowedOrigins = new Set([
  ...CORS_ALLOWED_ORIGINS,
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  'http://localhost:3000',
  'http://127.0.0.1:3000'
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
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname), {
  index: false,
  extensions: ['html']
}));
registerRoutes(app);

const isVercel = process.env.VERCEL === '1';

if (!isVercel) {
  try {
    startBotScheduler();
    console.log('Waybill tracking scheduler started.');
    startTelegramPolling();
    console.log('Telegram polling started.');

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
    console.error('Cannot start tracking background jobs:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`Server running at: http://localhost:${PORT}`);
    console.log(`Login page: http://localhost:${PORT}/login.html`);
    // startCassoAutoPolling(); // Đã tắt tiến trình tự động quét giao dịch Casso
  });
} else {
  console.log('Running server in Vercel Serverless environment.');
}

module.exports = app;
