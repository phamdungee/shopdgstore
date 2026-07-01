const { r2Client, isConfigured } = require('../config/r2');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const env = require('../config/env');

async function testR2() {
  console.log('Testing Cloudflare R2 Connection...');
  console.log('Is Configured:', isConfigured);

  if (!isConfigured) {
    console.warn('R2 is not configured in .env. Skipping upload test.');
    console.log('Uploads will fall back to local storage path assets/img/ảnh sản phẩm/');
    return;
  }

  try {
    const dummyKey = `test/test-connection-${Date.now()}.txt`;
    const dummyContent = 'Cloudflare R2 test connection success! Time: ' + new Date().toISOString();

    console.log(`Attempting to upload dummy file to key: "${dummyKey}"...`);

    const command = new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: dummyKey,
      Body: dummyContent,
      ContentType: 'text/plain',
    });

    await r2Client.send(command);
    console.log('Upload successful!');
    console.log(`Public URL: https://${env.R2_CUSTOM_DOMAIN || 'cdn.otuck.vn'}/${dummyKey}`);
  } catch (err) {
    console.error('Error during R2 connection test:', err);
  }
}

testR2();
