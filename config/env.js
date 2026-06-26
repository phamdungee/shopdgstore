
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
  DEPOSIT_TTL_MS
};
