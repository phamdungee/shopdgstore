const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { PutObjectCommand } = require('@aws-sdk/client-s3');

const { authMiddleware } = require('../middlewares/authMiddleware');
const env = require('../config/env');
const { r2Client, isConfigured: isR2Configured } = require('../config/r2');

let sharp = null;
try {
  sharp = require('sharp');
} catch (err) {
  console.warn('[Upload Router] Sharp could not be loaded. Images will be saved without WebP conversion.');
}

// Multer memory storage configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận các định dạng ảnh: JPEG, PNG, WEBP, GIF, SVG.'));
    }
  }
}).single('image');

router.post('/upload', authMiddleware, (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ ok: false, message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ ok: false, message: 'Vui lòng chọn một tệp ảnh để tải lên.' });
    }

    try {
      const userRole = req.user?.role || 'user'; // 'admin', 'seller', 'user'
      
      const ALLOWED_FOLDERS = {
        admin: ['products', 'avatars', 'banners', 'categories'],
        seller: ['products', 'avatars', 'banners', 'categories'],
        user: ['avatars']
      };

      const permittedFolders = ALLOWED_FOLDERS[userRole] || ALLOWED_FOLDERS.user;
      let folder = permittedFolders[0] || 'avatars';
      if (req.query.folder && permittedFolders.includes(req.query.folder)) {
        folder = req.query.folder;
      }

      // Specific size limits by folder
      const maxAvatarSize = 2 * 1024 * 1024; // 2MB
      if (folder === 'avatars' && req.file.size > maxAvatarSize) {
        return res.status(400).json({ ok: false, message: 'Ảnh đại diện (avatar) không được vượt quá 2MB.' });
      }

      let fileBuffer = req.file.buffer;
      let filename = uuidv4();
      let extension = path.extname(req.file.originalname).toLowerCase() || '.png';
      let mimeType = req.file.mimetype;

      // Convert JPEG/PNG to WebP if sharp is available
      if (sharp && ['image/jpeg', 'image/png'].includes(mimeType)) {
        try {
          fileBuffer = await sharp(fileBuffer).webp({ quality: 85 }).toBuffer();
          extension = '.webp';
          mimeType = 'image/webp';
        } catch (sharpError) {
          console.error('[Upload Router] Sharp conversion error, uploading original:', sharpError.message);
        }
      }

      const key = `${folder}/${filename}${extension}`;

      if (isR2Configured && r2Client) {
        // Upload to Cloudflare R2
        const uploadParams = {
          Bucket: env.R2_BUCKET_NAME,
          Key: key,
          Body: fileBuffer,
          ContentType: mimeType,
        };

        await r2Client.send(new PutObjectCommand(uploadParams));

        const publicUrl = `https://${env.R2_CUSTOM_DOMAIN || 'cdn.otuck.vn'}/${key}`;
        return res.json({
          ok: true,
          message: 'Tải ảnh lên Cloudflare R2 thành công.',
          url: publicUrl,
          key: key
        });
      } else {
        // Fallback to local storage if R2 is not configured
        console.log('[Upload Router] R2 is not configured. Saving file to local storage.');
        const localDir = path.join(__dirname, '..', 'assets', 'img', 'ảnh sản phẩm');
        
        if (!fs.existsSync(localDir)) {
          fs.mkdirSync(localDir, { recursive: true });
        }

        const localFilePath = path.join(localDir, `${filename}${extension}`);
        fs.writeFileSync(localFilePath, fileBuffer);

        const localUrl = `/assets/img/ảnh sản phẩm/${filename}${extension}`;
        return res.json({
          ok: true,
          message: 'Tải ảnh lên máy chủ cục bộ thành công (R2 chưa cấu hình).',
          url: localUrl,
          key: `local/${filename}${extension}`
        });
      }
    } catch (uploadErr) {
      console.error('[Upload Router] Upload error:', uploadErr);
      return res.status(500).json({ ok: false, message: 'Lỗi máy chủ khi xử lý và tải ảnh lên.' });
    }
  });
});

module.exports = router;
