const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const env = require('../config/env');
const { r2Client, isConfigured } = require('../config/r2');
const supabase = require('../config/supabase');

const projectRoot = path.resolve(__dirname, '..');
const sources = [
  'assets/img/nguoi-dan-ong-chau-a-deo-kinh-va-co-rau-dung-thu-gian-hinh-minh-hoa-avatar-vector-2d-khuon-mat-nhan-vat-hoat-hinh-nam-truong-thanh-vui-ve-chup-anh-chan-dung-tu-t_11zon.webp',
  'assets/img/images_11zon.webp',
  'assets/img/phu nu_11zon.webp',
  'assets/img/anh-ho-so-nguoi-dan-ong_24908-81754_11zon.webp',
  'assets/img/anh-dai-dien-zalo-30_11zon.webp'
];

function publicUrlFor(key) {
  const domain = String(env.R2_CUSTOM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${domain}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

async function main() {
  if (!isConfigured || !r2Client || !env.R2_CUSTOM_DOMAIN || !env.R2_BUCKET_NAME) {
    throw new Error('Cloudflare R2 chưa được cấu hình đầy đủ.');
  }

  const results = [];
  for (const source of sources) {
    const input = await fs.readFile(path.resolve(projectRoot, source));
    const buffer = await sharp(input, { failOn: 'error', limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 512, height: 512, fit: 'cover', position: 'attention' })
      .webp({ quality: 84 })
      .toBuffer();
    const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 24);
    const key = `catalog/avatars/presets/${hash}.webp`;
    const url = publicUrlFor(key);

    await r2Client.send(new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
      Metadata: { owner: 'system-presets', folder: 'avatars' }
    }));

    const { error } = await supabase.from('image_assets').upsert({
      owner_id: 'system-presets',
      object_key: key,
      public_url: url,
      purpose: 'avatars',
      mime_type: 'image/webp',
      byte_size: buffer.length,
      deleted_at: null
    }, { onConflict: 'object_key' });
    if (error) {
      await r2Client.send(new DeleteObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key
      })).catch(() => {});
      throw error;
    }
    results.push({ source, url });
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
