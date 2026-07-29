const assert = require('assert');
const bcrypt = require('bcrypt');
const {
  generateOtp,
  hashToken,
  normalizeEmail,
  isValidEmail,
  safeHashEquals,
  validateStrongPassword
} = require('../utils/passwordRecoverySecurity');
const { buildOtpEmail } = require('../services/resendOtpService');

async function run() {
  const samples = new Set();
  for (let index = 0; index < 100; index += 1) {
    const otp = generateOtp();
    assert.match(otp, /^\d{6}$/);
    samples.add(otp);
  }
  assert(samples.size > 90, 'Secure OTP generator produced too many collisions');

  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  assert.strictEqual(await bcrypt.compare(otp, otpHash), true);
  assert.strictEqual(await bcrypt.compare('000000', otpHash), otp === '000000');

  assert.strictEqual(normalizeEmail('  User@Example.COM '), 'user@example.com');
  assert.strictEqual(isValidEmail('user@example.com'), true);
  assert.strictEqual(isValidEmail('invalid-email'), false);
  assert.strictEqual(safeHashEquals(hashToken('token'), hashToken('token')), true);
  assert.strictEqual(safeHashEquals(hashToken('token'), hashToken('other')), false);

  assert.strictEqual(validateStrongPassword('Strong#Pass1').valid, true);
  assert.strictEqual(validateStrongPassword('weakpassword').valid, false);
  assert.strictEqual(validateStrongPassword('No Spaces#1').valid, false);

  const emailContent = buildOtpEmail({ otp: '123456' });
  assert.match(emailContent.html, /https:\/\/cdn\.dungicl\.store\/brand\/dg-store-email-logo\.png/);
  assert.doesNotMatch(emailContent.html, /\/assets\/img\//);
  assert.match(emailContent.html, />123456</);

  console.log('Password recovery security tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
