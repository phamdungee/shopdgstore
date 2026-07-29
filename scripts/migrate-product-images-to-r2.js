const crypto = require('crypto');
const { execFileSync } = require('child_process');
const dns = require('dns/promises');
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const env = require('../config/env');
const { r2Client, isConfigured } = require('../config/r2');
const supabase = require('../config/supabase');

const projectRoot = path.resolve(__dirname, '..');
const cdnOrigin = `https://${String(env.R2_CUSTOM_DOMAIN || '')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '')}`;

function isR2Url(value) {
  return String(value || '').startsWith(`${cdnOrigin}/`);
}

function localImagePath(value) {
  const relativePath = decodeURIComponent(String(value || ''))
    .replace(/^https?:\/\/[^/]+\//i, '')
    .replace(/^\/+/, '')
    .replaceAll('/', path.sep);
  const resolved = path.resolve(projectRoot, relativePath);
  if (!resolved.startsWith(`${projectRoot}${path.sep}`)) {
    throw new Error(`Đường dẫn ảnh nằm ngoài dự án: ${value}`);
  }
  return resolved;
}

function publicUrlFor(key) {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `${cdnOrigin}/${encodedKey}`;
}

async function readSourceImage(sourcePath) {
  try {
    return await fs.readFile(sourcePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const relativePath = path.relative(projectRoot, sourcePath).replaceAll(path.sep, '/');
    const commit = execFileSync(
      'git',
      ['log', '-1', '--format=%H', '--', relativePath],
      { cwd: projectRoot, encoding: 'utf8' }
    ).trim();
    if (!commit) throw error;
    console.log(`Khôi phục nguồn ảnh từ lịch sử Git: ${relativePath}`);
    return execFileSync('git', ['show', `${commit}:${relativePath}`], {
      cwd: projectRoot,
      encoding: 'buffer',
      maxBuffer: 10 * 1024 * 1024
    });
  }
}

async function prepareImage(sourcePath) {
  const source = await readSourceImage(sourcePath);
  const buffer = await sharp(source, {
    failOn: 'error',
    limitInputPixels: 40_000_000
  })
    .rotate()
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 24);
  return { buffer, hash };
}

async function main() {
  if (!isConfigured || !r2Client || !env.R2_CUSTOM_DOMAIN) {
    throw new Error('Cloudflare R2 chưa được cấu hình đầy đủ.');
  }
  const cdnHostname = new URL(cdnOrigin).hostname;
  await dns.lookup(cdnHostname).catch(() => {
    throw new Error(
      `Tên miền CDN ${cdnHostname} chưa có DNS. Hãy gắn custom domain vào R2 trước khi cập nhật sản phẩm.`
    );
  });

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, image')
    .order('created_at', { ascending: true });
  if (error) throw error;

  const migratedBySource = new Map();
  let migrated = 0;
  let alreadyOnR2 = 0;

  for (const product of products || []) {
    if (!product.image) continue;
    if (isR2Url(product.image)) {
      alreadyOnR2 += 1;
      continue;
    }

    let uploaded = migratedBySource.get(product.image);
    if (!uploaded) {
      const sourcePath = localImagePath(product.image);
      const { buffer, hash } = await prepareImage(sourcePath);
      const key = `catalog/products/${hash}.webp`;
      const url = publicUrlFor(key);

      await r2Client.send(new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
        Metadata: { owner: 'system-migration', folder: 'products' }
      }));

      const { error: assetError } = await supabase.from('image_assets').upsert({
        owner_id: 'system-migration',
        object_key: key,
        public_url: url,
        purpose: 'products',
        mime_type: 'image/webp',
        byte_size: buffer.length,
        deleted_at: null
      }, { onConflict: 'object_key' });

      if (assetError) {
        await r2Client.send(new DeleteObjectCommand({
          Bucket: env.R2_BUCKET_NAME,
          Key: key
        })).catch(() => {});
        throw assetError;
      }

      uploaded = { key, url };
      migratedBySource.set(product.image, uploaded);
    }

    const { error: updateError } = await supabase
      .from('products')
      .update({ image: uploaded.url })
      .eq('id', product.id);
    if (updateError) throw updateError;

    migrated += 1;
    console.log(`Đã chuyển: ${product.name}`);
  }

  console.log(`Hoàn tất: ${migrated} sản phẩm được chuyển, ${alreadyOnR2} sản phẩm đã dùng R2.`);
}

main().catch(error => {
  console.error('Chuyển ảnh lên R2 thất bại:', error.message);
  process.exitCode = 1;
});
