
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { PORT, CORS_ALLOWED_ORIGINS } = require('./config/env');
const registerRoutes = require('./routes');
const { startCassoAutoPolling } = require('./routes/deposits');
const { startBotScheduler, startTelegramPolling } = require('./routes/tracking');

const app = express();

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
      "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.tailwindcss.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
      "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
      "img-src 'self' data: https:",
      "connect-src 'self' http://localhost:* http://127.0.0.1:* https:",
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
    return callback(new Error('CORS origin is not allowed'));
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname), {
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
  } catch (err) {
    console.error('Cannot start tracking background jobs:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`Server running at: http://localhost:${PORT}`);
    console.log(`Login page: http://localhost:${PORT}/login.html`);
    startCassoAutoPolling();
  });
} else {
  console.log('Running server in Vercel Serverless environment.');
}

module.exports = app;
