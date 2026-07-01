const { S3Client } = require('@aws-sdk/client-s3');
const env = require('./env');

const isConfigured = !!(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);

let r2Client = null;

if (isConfigured) {
  r2Client = new S3Client({
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    region: 'auto',
  });
  console.log('[R2 Config] Cloudflare R2 client initialized successfully.');
} else {
  console.warn('[R2 Config] Cloudflare R2 is NOT configured. R2 uploads will fail.');
}

module.exports = {
  r2Client,
  isConfigured
};
