const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const supabase = require('../config/supabase');
const { authMiddleware } = require('../middlewares/authMiddleware');
const env = require('../config/env');
const { r2Client, isConfigured: isR2Configured } = require('../config/r2');

const router = express.Router();
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const allowedFolders = new Set(['avatars', 'products', 'banners', 'categories']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    callback(null, allowedMimeTypes.has(file.mimetype));
  }
}).single('image');

function publicUrlFor(key) {
  const domain = String(env.R2_CUSTOM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${domain}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function runUpload(req, res) {
  return new Promise((resolve, reject) => {
    upload(req, res, error => error ? reject(error) : resolve());
  });
}

async function normalizeImage(file, folder) {
  const sharp = require('sharp');
  const image = sharp(file.buffer, { failOn: 'error', limitInputPixels: 40_000_000 });
  const metadata = await image.metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new Error('Định dạng ảnh không hợp lệ.');
  if (!metadata.width || !metadata.height || metadata.width > 8000 || metadata.height > 8000) {
    throw new Error('Kích thước ảnh không hợp lệ.');
  }
  const maxEdge = folder === 'avatars' ? 1024 : 2400;
  const buffer = await image
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: folder === 'avatars' ? 82 : 86 })
    .toBuffer();
  return { buffer, width: metadata.width, height: metadata.height };
}

router.post('/upload', authMiddleware, async (req, res) => {
  try {
    await runUpload(req, res);
    if (!req.file) return res.status(400).json({ ok: false, message: 'Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.' });
    if (!isR2Configured || !r2Client || !env.R2_CUSTOM_DOMAIN) {
      return res.status(503).json({ ok: false, message: 'Kho ảnh Cloudflare R2 chưa được cấu hình.' });
    }

    const folder = String(req.query.folder || 'avatars').toLowerCase();
    if (!allowedFolders.has(folder)) return res.status(400).json({ ok: false, message: 'Thư mục ảnh không hợp lệ.' });
    const isAdmin = req.user.role === 'admin';
    if (folder !== 'avatars' && !isAdmin) return res.status(403).json({ ok: false, message: 'Bạn không có quyền tải loại ảnh này.' });
    if (folder === 'avatars' && req.file.size > 2 * 1024 * 1024) {
      return res.status(400).json({ ok: false, message: 'Ảnh đại diện không được vượt quá 2 MB.' });
    }

    const normalized = await normalizeImage(req.file, folder);
    const ownerSegment = folder === 'avatars' ? `users/${req.user.userId}` : 'catalog';
    const key = `${ownerSegment}/${folder}/${crypto.randomUUID()}.webp`;
    const url = publicUrlFor(key);

    await r2Client.send(new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: normalized.buffer,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
      Metadata: { owner: String(req.user.userId), folder }
    }));

    const { data: asset, error: dbError } = await supabase
      .from('image_assets')
      .insert({
        owner_id: req.user.userId,
        object_key: key,
        public_url: url,
        purpose: folder,
        mime_type: 'image/webp',
        byte_size: normalized.buffer.length
      })
      .select('id, object_key, public_url, purpose, created_at')
      .single();

    if (dbError || !asset) {
      await r2Client.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key })).catch(() => {});
      console.error('[Upload] Could not persist image metadata:', dbError);
      return res.status(500).json({ ok: false, message: 'Không thể lưu thông tin ảnh.' });
    }

    return res.status(201).json({
      ok: true,
      message: 'Tải ảnh thành công.',
      assetId: asset.id,
      key: asset.object_key,
      url: asset.public_url
    });
  } catch (error) {
    const clientError = error instanceof multer.MulterError || /ảnh|image|format|size|pixel/i.test(error.message);
    console.error('[Upload] Error:', error.message);
    return res.status(clientError ? 400 : 500).json({ ok: false, message: clientError ? error.message : 'Không thể tải ảnh lúc này.' });
  }
});

router.delete('/uploads/:id', authMiddleware, async (req, res) => {
  try {
    const { data: asset, error } = await supabase
      .from('image_assets')
      .select('id, owner_id, object_key, public_url, purpose')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!asset) return res.status(404).json({ ok: false, message: 'Không tìm thấy ảnh.' });
    if (String(asset.owner_id) !== String(req.user.userId) && req.user.role !== 'admin') {
      return res.status(403).json({ ok: false, message: 'Bạn không có quyền xóa ảnh này.' });
    }

    await r2Client.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: asset.object_key }));
    const deletedAt = new Date().toISOString();
    const { error: markError } = await supabase.from('image_assets').update({ deleted_at: deletedAt }).eq('id', asset.id);
    if (markError) throw markError;
    if (asset.purpose === 'avatars') {
      await supabase.from('users').update({ avatar_url: null }).eq('id', asset.owner_id).eq('avatar_url', asset.public_url);
    }
    return res.json({ ok: true, message: 'Đã xóa ảnh.' });
  } catch (error) {
    console.error('[Upload delete] Error:', error.message);
    return res.status(500).json({ ok: false, message: 'Không thể xóa ảnh lúc này.' });
  }
});

module.exports = router;
