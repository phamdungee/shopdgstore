const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');
const { authMiddleware, adminMiddleware } = require('../middlewares/authMiddleware');
const { safeUser, moneyValue } = require('../services/storeService');

function firstDefined(...values) {
  return values.find(value => value !== undefined);
}

function hasAnyKey(object, keys) {
  return keys.some(key => Object.prototype.hasOwnProperty.call(object, key));
}

function normalizeText(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function normalizeNullableText(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeVendorId(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
}

function normalizeStock(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : null;
}

function normalizeApiCode(value) {
  const code = normalizeNullableText(value);
  if (!code) return null;
  const numericCode = Number(code);
  return Number.isFinite(numericCode) ? numericCode : code;
}

function normalizeVariants(value) {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      source = [];
    }
  }

  return (Array.isArray(source) ? source : [])
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const name = normalizeText(item && item.name);
      const price = Math.max(0, Math.floor(Number(item && item.price ? item.price : 0)));
      if (!name) return null;

      const vendorProductCode = normalizeNullableText(firstDefined(
        item.vendor_product_code,
        item.vendorProductCode,
        item.provider_service_id
      ));
      const variant = { name, price };

      if (vendorProductCode) {
        variant.vendor_product_code = vendorProductCode;
        variant.provider_service_id = normalizeApiCode(vendorProductCode);
      }

      const costPrice = firstDefined(item.cost_price, item.costPrice);
      if (costPrice !== undefined && costPrice !== null && String(costPrice).trim() !== '') {
        variant.cost_price = moneyValue(costPrice);
      }

      const vendorId = firstDefined(item.vendor_id, item.vendorId);
      if (vendorId !== undefined && vendorId !== null && String(vendorId).trim() !== '') {
        variant.vendor_id = normalizeVendorId(vendorId);
      }

      const stock = normalizeStock(item.stock);
      if (stock !== null) {
        variant.stock = stock;
      }

      return variant;
    })
    .filter(Boolean);
}

function productPayload(body, options = {}) {
  const payload = {
    cat: normalizeText(body.cat),
    icon: normalizeText(body.icon, 'fa-box'),
    slug: normalizeText(body.slug),
    name: normalizeText(body.name),
    desc: normalizeText(body.desc),
    long_desc: normalizeText(firstDefined(body.long_desc, body.longDesc)),
    image: normalizeText(body.image),
    rate: normalizeText(body.rate, '5.0'),
    price: normalizeText(body.price, '0đ'),
    variants: normalizeVariants(body.variants)
  };

  const partial = options.partial === true;
  if (!partial || hasAnyKey(body, ['vendor_id', 'vendorId'])) {
    payload.vendor_id = normalizeVendorId(firstDefined(body.vendor_id, body.vendorId));
  }
  if (!partial || hasAnyKey(body, ['vendor_product_code', 'vendorProductCode'])) {
    payload.vendor_product_code = normalizeNullableText(firstDefined(body.vendor_product_code, body.vendorProductCode));
  }
  if (!partial || hasAnyKey(body, ['cost_price', 'costPrice'])) {
    payload.cost_price = moneyValue(firstDefined(body.cost_price, body.costPrice));
  }
  if (!partial || hasAnyKey(body, ['stock'])) {
    payload.stock = normalizeStock(body.stock);
  }

  return payload;
}

router.get('/dashboard', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, username, email, phone, full_name, role, balance, status, email_verified, avatar_url, created_at, last_login_at')
      .order('created_at', { ascending: false });

    if (usersError) {
      console.error('Admin users query error:', usersError);
      return res.status(500).json({ ok: false, message: 'Không lấy được danh sách tài khoản' });
    }

    let loginLogs = [];
    try {
      const { data, error } = await supabase
        .from('login_logs')
        .select('id, username_or_email, ip_address, success, reason, created_at')
        .order('created_at', { ascending: false })
        .limit(8);
      if (error) {
        console.error('Admin login_logs query warning:', error.message);
      } else {
        loginLogs = data || [];
      }
    } catch (err) {
      console.error('Admin login_logs query warning:', err.message);
    }

    const safeUsers = (users || []).map(safeUser);
    const stats = safeUsers.reduce((acc, user) => {
      acc.totalUsers += 1;
      acc.totalBalance += Number(user.balance || 0);
      if (user.role === 'admin') acc.adminUsers += 1;
      if (user.status === 'active') acc.activeUsers += 1;
      if (user.status && user.status !== 'active') acc.lockedUsers += 1;
      return acc;
    }, {
      totalUsers: 0,
      activeUsers: 0,
      lockedUsers: 0,
      adminUsers: 0,
      totalBalance: 0
    });

    return res.json({
      ok: true,
      stats,
      users: safeUsers,
      loginLogs
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi tải dashboard admin' });
  }
});

router.post('/products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const payload = productPayload(req.body);

    if (!payload.cat || !payload.slug || !payload.name) {
      return res.status(400).json({ ok: false, message: 'Thiếu thông tin danh mục, slug hoặc tên sản phẩm' });
    }

    const { data: newProduct, error } = await supabase
      .from('products')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      console.error('Create product error:', error);
      return res.status(500).json({ ok: false, message: 'Không tạo được sản phẩm, có thể slug đã tồn tại' });
    }

    return res.status(201).json({ ok: true, message: 'Thêm sản phẩm thành công', product: newProduct });
  } catch (err) {
    console.error('Admin create product error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi thêm sản phẩm' });
  }
});

// PUT /api/admin/products/:id - Cập nhật sản phẩm (Admin)
router.put('/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const updatePayload = productPayload(req.body, { partial: true });

    if (!updatePayload.cat || !updatePayload.slug || !updatePayload.name) {
      return res.status(400).json({ ok: false, message: 'Thiếu thông tin danh mục, slug hoặc tên sản phẩm' });
    }

    const { data: updatedProduct, error } = await supabase
      .from('products')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('Update product error:', error);
      return res.status(500).json({ ok: false, message: 'Không cập nhật được sản phẩm' });
    }

    return res.json({ ok: true, message: 'Cập nhật sản phẩm thành công', product: updatedProduct });
  } catch (err) {
    console.error('Admin update product error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi cập nhật sản phẩm' });
  }
});

// DELETE /api/admin/products/:id - Xóa sản phẩm (Admin)
router.delete('/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete product error:', error);
      return res.status(500).json({ ok: false, message: 'Không xóa được sản phẩm' });
    }

    return res.json({ ok: true, message: 'Xóa sản phẩm thành công' });
  } catch (err) {
    console.error('Admin delete product error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi xóa sản phẩm' });
  }
});

// GET /api/admin/images - Lấy danh sách tệp ảnh trong assets/img/ảnh sản phẩm (Admin)
router.get('/images', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const fs = require('fs');
    const dirPath = path.join(__dirname, '..', 'assets', 'img', 'ảnh sản phẩm');
    if (!fs.existsSync(dirPath)) {
      return res.json({ ok: true, images: [] });
    }
    const files = fs.readdirSync(dirPath);
    const images = files
      .filter(file => /\.(png|jpe?g|gif|svg|webp)$/i.test(file))
      .map(file => `assets/img/ảnh sản phẩm/${file}`);
    
    return res.json({ ok: true, images });
  } catch (err) {
    console.error('List images error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi lấy danh sách ảnh' });
  }
});

// GET /api/admin/announcement/public - Public announcement endpoint
const ANNOUNCEMENT_FILE = path.join(__dirname, '..', 'config', 'announcement.json');

function getAnnouncementData() {
  try {
    if (fs.existsSync(ANNOUNCEMENT_FILE)) {
      const data = fs.readFileSync(ANNOUNCEMENT_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading announcement file:', err);
  }
  return { title: 'Thông báo', content: '', active: false, updatedAt: 0 };
}

router.get('/announcement/public', (req, res) => {
  const ann = getAnnouncementData();
  return res.json({ ok: true, announcement: ann });
});

// POST /api/admin/announcement - Update announcement (Admin only)
router.post('/announcement', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, content, active } = req.body;
    const ann = {
      title: title || 'Thông báo',
      content: content || '',
      active: !!active,
      updatedAt: Date.now()
    };
    fs.writeFileSync(ANNOUNCEMENT_FILE, JSON.stringify(ann, null, 2), 'utf8');
    return res.json({ ok: true, message: 'Cập nhật thông báo thành công', announcement: ann });
  } catch (err) {
    console.error('Save announcement error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi lưu thông báo' });
  }
});

module.exports = router;
