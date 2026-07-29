const crypto = require('crypto');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

function generateOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function safeHashEquals(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validateStrongPassword(password) {
  const value = String(password || '');
  const rules = {
    length: value.length >= 10 && value.length <= 128,
    lowercase: /[a-z]/.test(value),
    uppercase: /[A-Z]/.test(value),
    number: /\d/.test(value),
    symbol: /[^A-Za-z0-9\s]/.test(value),
    noWhitespace: !/\s/.test(value)
  };
  return {
    valid: Object.values(rules).every(Boolean),
    rules
  };
}

module.exports = {
  normalizeEmail,
  isValidEmail,
  generateOtp,
  hashToken,
  safeHashEquals,
  validateStrongPassword
};
