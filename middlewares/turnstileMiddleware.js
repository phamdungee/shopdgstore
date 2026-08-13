const axios = require('axios');
const env = require('../config/env');

async function verifyTurnstile(req, res, next) {
  // Cloudflare Turnstile temporarily disabled by user request
  return next();
}

module.exports = verifyTurnstile;
