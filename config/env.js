
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;
const CORS_ALLOWED_ORIGINS = String(process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const DEPOSIT_CODE_SECRET = process.env.DEPOSIT_CODE_SECRET || JWT_SECRET;
const DEPOSIT_BANK = {
  name: 'MB Bank',
  fullName: 'MB Bank',
  bin: '970422',
  account: '35656568905',
  owner: 'PHAM TRUNG DUNG'
};
const CASSO_API_KEY = process.env.CASSO_API_KEY;
const CASSO_SECURE_TOKEN = process.env.CASSO_SECURE_TOKEN || process.env.DEPOSIT_WEBHOOK_SECRET || '';
const DEPOSIT_MEMO_PREFIX = String(process.env.DEPOSIT_MEMO_PREFIX || 'NP').toUpperCase();
const DEPOSIT_MIN_AMOUNT = Number(process.env.DEPOSIT_MIN_AMOUNT || 10000);
const DEPOSIT_TTL_MS = Number(process.env.DEPOSIT_TTL_SECONDS || 600) * 1000;

// Cloudflare Turnstile Configs
// Set CLOUDFLARE_TURNSTILE_ENABLED=false for local maintenance/testing.
const CLOUDFLARE_TURNSTILE_ENABLED = String(process.env.CLOUDFLARE_TURNSTILE_ENABLED || 'true').toLowerCase() === 'true';
const CLOUDFLARE_TURNSTILE_SITE_KEY = CLOUDFLARE_TURNSTILE_ENABLED
  ? (process.env.CLOUDFLARE_TURNSTILE_SITE_KEY || '')
  : '';
const CLOUDFLARE_TURNSTILE_SECRET_KEY = CLOUDFLARE_TURNSTILE_ENABLED
  ? (process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY || '')
  : '';

// Cloudflare R2 Credentials
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'dg-store-images';
const R2_CUSTOM_DOMAIN = process.env.R2_CUSTOM_DOMAIN || 'cdn.otuck.vn';
const R2_SIGNED_URL_TTL_SECONDS = Math.max(60, Number(process.env.R2_SIGNED_URL_TTL_SECONDS || 900));

// Transactional email / account recovery
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || '';
const RESEND_REPLY_TO = process.env.RESEND_REPLY_TO || '';
const APP_BASE_URL = String(process.env.APP_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const EMAIL_LOGO_URL = process.env.EMAIL_LOGO_URL || 'https://cdn.dungicl.store/brand/dg-store-email-logo.png';
const PASSWORD_RESET_TTL_MINUTES = Math.max(5, Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30));
const PASSWORD_RESET_OTP_TTL_MINUTES = Math.min(15, Math.max(1, Number(process.env.PASSWORD_RESET_OTP_TTL_MINUTES || 5)));
const PASSWORD_RESET_TOKEN_TTL_MINUTES = Math.min(30, Math.max(5, Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 10)));
const PASSWORD_RESET_OTP_MAX_ATTEMPTS = Math.min(10, Math.max(3, Number(process.env.PASSWORD_RESET_OTP_MAX_ATTEMPTS || 5)));
const PASSWORD_RESET_BCRYPT_ROUNDS = Math.min(12, Math.max(10, Number(process.env.PASSWORD_RESET_BCRYPT_ROUNDS || 10)));

// New notification bot. It only sends operational alerts; it does not track parcels.
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !JWT_SECRET) {
  console.error('Missing required .env values');
  console.error('Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET');
  process.exit(1);
}

module.exports = {
  PORT,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  JWT_SECRET,
  CORS_ALLOWED_ORIGINS,
  DEPOSIT_CODE_SECRET,
  DEPOSIT_BANK,
  CASSO_API_KEY,
  CASSO_SECURE_TOKEN,
  DEPOSIT_MEMO_PREFIX,
  DEPOSIT_MIN_AMOUNT,
  DEPOSIT_TTL_MS,
  CLOUDFLARE_TURNSTILE_ENABLED,
  CLOUDFLARE_TURNSTILE_SITE_KEY,
  CLOUDFLARE_TURNSTILE_SECRET_KEY,
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_CUSTOM_DOMAIN,
  R2_SIGNED_URL_TTL_SECONDS,
  RESEND_API_KEY,
  RESEND_FROM_EMAIL,
  RESEND_REPLY_TO,
  APP_BASE_URL,
  EMAIL_LOGO_URL,
  PASSWORD_RESET_TTL_MINUTES,
  PASSWORD_RESET_OTP_TTL_MINUTES,
  PASSWORD_RESET_TOKEN_TTL_MINUTES,
  PASSWORD_RESET_OTP_MAX_ATTEMPTS,
  PASSWORD_RESET_BCRYPT_ROUNDS,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_ADMIN_CHAT_ID
};
