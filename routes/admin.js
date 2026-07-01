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

      const deliveryType = firstDefined(item.delivery_type, item.deliveryType);
      if (deliveryType) {
        variant.delivery_type = deliveryType;
      }

      const fallbackMode = firstDefined(item.fallback_mode, item.fallbackMode);
      if (fallbackMode) {
        variant.fallback_mode = fallbackMode;
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
    price: moneyValue(body.price) || 0,
    variants: normalizeVariants(body.variants)
  };

  const partial = options.partial === true;
  if (!partial || hasAnyKey(body, ['stock'])) {
    payload.stock_cache = normalizeStock(body.stock);
  }
  if (!partial || hasAnyKey(body, ['delivery_type', 'deliveryType'])) {
    payload.delivery_type = normalizeText(firstDefined(body.delivery_type, body.deliveryType), 'hybrid');
  }
  if (!partial || hasAnyKey(body, ['fallback_mode', 'fallbackMode'])) {
    payload.fallback_mode = normalizeText(firstDefined(body.fallback_mode, body.fallbackMode), 'api_when_out_of_stock');
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
    const variants = payload.variants || [];
    delete payload.variants;

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

    // Insert variants
    if (variants.length > 0) {
      const { error: variantsErr } = await supabase
        .from('product_variants')
        .insert(variants.map(v => ({
          product_id: newProduct.id,
          name: v.name,
          price: v.price,
          cost_price: v.cost_price || 0,
          vendor_product_code: v.vendor_product_code || null,
          vendor_id: v.vendor_id || null,
          delivery_type: v.delivery_type || newProduct.delivery_type || 'hybrid',
          fallback_mode: v.fallback_mode || newProduct.fallback_mode || 'api_when_out_of_stock'
        })));
      if (variantsErr) {
        console.error('Create variants error:', variantsErr.message);
      }
    }

    // Fetch product with variants
    const { data: freshProduct } = await supabase
      .from('products')
      .select('*, product_variants(*)')
      .eq('id', newProduct.id)
      .single();

    const formatted = {
      ...freshProduct,
      variants: (freshProduct.product_variants || []).map(v => ({
        id: v.id,
        name: v.name,
        price: v.price,
        cost_price: v.cost_price,
        stock: v.stock_cache,
        vendor_product_code: v.vendor_product_code,
        vendor_id: v.vendor_id,
        delivery_type: v.delivery_type,
        fallback_mode: v.fallback_mode
      })),
      stock: freshProduct.stock_cache
    };

    return res.status(201).json({ ok: true, message: 'Thêm sản phẩm thành công', product: formatted });
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
    const variants = updatePayload.variants;
    delete updatePayload.variants;

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

    // Update variants if passed
    if (variants !== undefined) {
      // Delete old variants
      await supabase
        .from('product_variants')
        .delete()
        .eq('product_id', id);

      // Insert new variants
      if (variants.length > 0) {
        const { error: variantsErr } = await supabase
          .from('product_variants')
          .insert(variants.map(v => ({
            product_id: id,
            name: v.name,
            price: v.price,
            cost_price: v.cost_price || 0,
            vendor_product_code: v.vendor_product_code || null,
            vendor_id: v.vendor_id || null,
            delivery_type: v.delivery_type || updatedProduct.delivery_type || 'hybrid',
            fallback_mode: v.fallback_mode || updatedProduct.fallback_mode || 'api_when_out_of_stock'
          })));
        if (variantsErr) {
          console.error('Update variants error:', variantsErr.message);
        }
      }
    }

    // Fetch product with variants
    const { data: freshProduct } = await supabase
      .from('products')
      .select('*, product_variants(*)')
      .eq('id', id)
      .single();

    const formatted = {
      ...freshProduct,
      variants: (freshProduct.product_variants || []).map(v => ({
        id: v.id,
        name: v.name,
        price: v.price,
        cost_price: v.cost_price,
        stock: v.stock_cache,
        vendor_product_code: v.vendor_product_code,
        vendor_id: v.vendor_id,
        delivery_type: v.delivery_type,
        fallback_mode: v.fallback_mode
      })),
      stock: freshProduct.stock_cache
    };

    return res.json({ ok: true, message: 'Cập nhật sản phẩm thành công', product: formatted });
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

// ==========================================
// NEW ROUTE ADDITIONS: VENDORS & WAREHOUSING
// ==========================================

router.get('/dashboard-stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { count: activeItemsCount } = await supabase
      .from('inventory_items')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'available');

    const { count: reservedCount } = await supabase
      .from('inventory_items')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'reserved');

    const { count: pendingOrders } = await supabase
      .from('store_orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { count: processingOrders } = await supabase
      .from('store_orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'processing');

    const { count: completedOrders } = await supabase
      .from('store_orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed');

    const { count: failedOrders } = await supabase
      .from('store_orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed');

    const { count: refundedOrders } = await supabase
      .from('store_orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'refunded');

    const { count: queuedJobs } = await supabase
      .from('order_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'queued');

    const { count: processingJobs } = await supabase
      .from('order_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'processing');

    const { count: failedJobs } = await supabase
      .from('order_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed');

    const { data: lowStockVariants } = await supabase
      .from('product_variants')
      .select('id, name, stock_cache, products(name)')
      .lt('stock_cache', 10);

    const formattedLowStock = (lowStockVariants || []).map(v => ({
      id: v.id,
      variant_name: v.name,
      product_name: v.products?.name || 'Sản phẩm',
      stock: v.stock_cache
    }));

    const { data: vendors } = await supabase
      .from('vendors')
      .select('id, name, status, response_time_ms, cached_balance');

    const onlineVendors = (vendors || []).filter(v => v.status === 'active').length;

    return res.json({
      ok: true,
      stats: {
        totalStock: activeItemsCount || 0,
        reserved: reservedCount || 0,
        onlineVendors,
        totalVendors: vendors?.length || 0,
        lowStock: formattedLowStock,
        pendingOrders: pendingOrders || 0,
        processingOrders: processingOrders || 0,
        completedOrders: completedOrders || 0,
        failedOrders: failedOrders || 0,
        refundedOrders: refundedOrders || 0,
        queuedJobs: queuedJobs || 0,
        processingJobs: processingJobs || 0,
        failedJobs: failedJobs || 0
      }
    });
  } catch (err) {
    console.error('Fetch dashboard stats error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi lấy thống kê dashboard' });
  }
});

router.get('/vendors', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { data: vendors, error } = await supabase
      .from('vendors')
      .select('*')
      .order('id', { ascending: true });
    if (error) throw error;

    const { data: catalogCounts } = await supabase
      .from('vendor_catalogs')
      .select('vendor_id')
      .neq('status', 'deleted');

    const countsMap = {};
    if (catalogCounts) {
      catalogCounts.forEach(c => {
        countsMap[c.vendor_id] = (countsMap[c.vendor_id] || 0) + 1;
      });
    }

    const merged = (vendors || []).map(v => ({
      ...v,
      catalog_count: countsMap[v.id] || 0
    }));

    return res.json({ ok: true, vendors: merged });
  } catch (err) {
    console.error('Fetch vendors error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi lấy danh sách nhà cung cấp' });
  }
});

router.post('/vendors', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, api_url, api_key, adapter_key, status } = req.body;
    const { data, error } = await supabase
      .from('vendors')
      .insert({ name, api_url, api_key, adapter_key, status: status || 'active' })
      .select('*')
      .single();
    if (error) throw error;
    return res.status(201).json({ ok: true, message: 'Thêm nhà cung cấp thành công', vendor: data });
  } catch (err) {
    console.error('Create vendor error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi tạo nhà cung cấp' });
  }
});

router.put('/vendors/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const { name, api_url, api_key, adapter_key, status } = req.body;
    const { data, error } = await supabase
      .from('vendors')
      .update({ name, api_url, api_key, adapter_key, status })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return res.json({ ok: true, message: 'Cập nhật nhà cung cấp thành công', vendor: data });
  } catch (err) {
    console.error('Update vendor error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi cập nhật nhà cung cấp' });
  }
});

router.delete('/vendors/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const { error } = await supabase
      .from('vendors')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return res.json({ ok: true, message: 'Xóa nhà cung cấp thành công' });
  } catch (err) {
    console.error('Delete vendor error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi xóa nhà cung cấp' });
  }
});

function parseAxiosError(err) {
  if (err.response) {
    const status = err.response.status;
    let details = '';
    if (err.response.data) {
      details = typeof err.response.data === 'object' 
        ? JSON.stringify(err.response.data) 
        : String(err.response.data);
    }
    if (status === 401) return `401 Unauthorized - API Key không đúng hoặc hết hạn. NCC trả về: ${details}`;
    if (status === 403) return `403 Forbidden - Bị chặn truy cập hoặc IP không hợp lệ. NCC trả về: ${details}`;
    if (status === 404) return `404 Not Found - Đường dẫn endpoint sai hoặc không tồn tại.`;
    return `NCC báo lỗi HTTP ${status}: ${details.substring(0, 150)}`;
  }
  if (err.code === 'ECONNABORTED' || err.message.toLowerCase().includes('timeout')) {
    return 'Lỗi timeout kết nối đến NCC (quá 20-25 giây).';
  }
  return err.message || 'Lỗi kết nối không xác định.';
}

async function logApiCall(vendorId, requestPayload, responsePayload, httpStatus, responseTimeMs, success, errorMessage) {
  try {
    await supabase
      .from('api_logs')
      .insert({
        vendor_id: vendorId,
        request_payload: requestPayload || {},
        response_payload: responsePayload || {},
        http_status: httpStatus || 500,
        response_time_ms: responseTimeMs,
        success: success,
        error_message: errorMessage || null
      });
  } catch (logErr) {
    console.error('Failed to save API log:', logErr.message);
  }
}

router.post('/vendors/sync/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const id = req.params.id;
  try {
    // 1. Double sync guard: Set status to 'syncing'
    const { data: currentVendor, error: checkErr } = await supabase
      .from('vendors')
      .select('sync_status, last_sync_at')
      .eq('id', id)
      .maybeSingle();

    if (currentVendor && currentVendor.sync_status === 'syncing') {
      const lastSync = new Date(currentVendor.last_sync_at || 0).getTime();
      const now = Date.now();
      // Allow sync if last sync started more than 2 minutes ago (stuck guard)
      if (now - lastSync < 120000) {
        return res.status(409).json({ ok: false, message: 'Nhà cung cấp này đang được đồng bộ, xin vui lòng đợi.' });
      }
    }

    await supabase
      .from('vendors')
      .update({ sync_status: 'syncing', last_sync_at: new Date().toISOString() })
      .eq('id', id);

    const { data: vendor, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !vendor) {
      return res.status(404).json({ ok: false, message: 'Không tìm thấy nhà cung cấp' });
    }

    const { useVendorAdapter } = require('../fulfillment');
    const adapter = useVendorAdapter(vendor);

    const startTime = Date.now();
    
    // Fetch products catalog
    let result;
    try {
      result = await adapter.getList();
    } catch (listErr) {
      const latency = Date.now() - startTime;
      const parsedErr = parseAxiosError(listErr);
      
      await logApiCall(
        id,
        { method: 'GET/POST', action: 'services', endpoint: vendor.api_url },
        listErr.response?.data || null,
        listErr.response?.status || 500,
        latency,
        false,
        parsedErr
      );

      await supabase
        .from('vendors')
        .update({
          sync_status: 'failed',
          sync_error: parsedErr,
          response_time_ms: latency
        })
        .eq('id', id);

      return res.status(502).json({ ok: false, message: parsedErr });
    }

    // Save log for getList success
    await logApiCall(
      id,
      result.requestPayload || { method: 'GET/POST', action: 'services' },
      result.raw || result.data,
      result.httpStatus || 200,
      Date.now() - startTime,
      result.success,
      result.success ? null : result.message
    );

    if (!result.success || !Array.isArray(result.data)) {
      const latency = Date.now() - startTime;
      await supabase
        .from('vendors')
        .update({
          sync_status: 'failed',
          sync_error: result.message || 'Lỗi API danh sách dịch vụ',
          response_time_ms: latency
        })
        .eq('id', id);

      return res.status(502).json({ ok: false, message: result.message || 'Không lấy được danh sách từ nhà cung cấp' });
    }

    // Fetch account balance
    let balance = 0;
    const balanceStartTime = Date.now();
    try {
      const balanceResult = await adapter.getBalance();
      const balanceLatency = Date.now() - balanceStartTime;

      await logApiCall(
        id,
        balanceResult.requestPayload || { method: 'GET/POST', action: 'balance' },
        balanceResult.raw || balanceResult.data,
        balanceResult.httpStatus || 200,
        balanceLatency,
        balanceResult.success,
        balanceResult.success ? null : balanceResult.message
      );

      if (balanceResult.success) {
        balance = balanceResult.data || 0;
      } else {
        const errMsg = balanceResult.message || 'Lỗi API lấy số dư';
        await supabase
          .from('vendors')
          .update({
            sync_status: 'failed',
            sync_error: errMsg
          })
          .eq('id', id);
        return res.status(502).json({ ok: false, message: errMsg });
      }
    } catch (balErr) {
      const balanceLatency = Date.now() - balanceStartTime;
      const parsedErr = parseAxiosError(balErr);

      await logApiCall(
        id,
        { method: 'GET/POST', action: 'balance', endpoint: vendor.api_url },
        balErr.response?.data || null,
        balErr.response?.status || 500,
        balanceLatency,
        false,
        parsedErr
      );

      await supabase
        .from('vendors')
        .update({
          sync_status: 'failed',
          sync_error: parsedErr
        })
        .eq('id', id);

      return res.status(502).json({ ok: false, message: parsedErr });
    }

    const latency = Date.now() - startTime;

    // 2. Fetch existing catalogs to calculate updates & perform upsert
    const { data: existingCatalogs } = await supabase
      .from('vendor_catalogs')
      .select('service_code, status')
      .eq('vendor_id', id);

    const existingMap = new Map((existingCatalogs || []).map(c => [c.service_code, c.status]));
    const syncedServiceCodes = new Set();

    let newCount = 0;
    let updatedCount = 0;
    let disabledCount = 0;

    const catalogsToUpsert = result.data.map(item => {
      const serviceCode = String(item.vendor_product_code || item.id);
      syncedServiceCodes.add(serviceCode);

      const stockQty = Number(item.stock) || 0;
      const status = stockQty === 0 ? 'inactive' : 'active';

      if (!existingMap.has(serviceCode)) {
        newCount++;
      } else {
        updatedCount++;
      }

      return {
        vendor_id: vendor.id,
        service_code: serviceCode,
        service_name: String(item.name || ''),
        price: Number(item.price || 0),
        original_price: Number(item.original_price || item.price || 0),
        stock: stockQty,
        min_quantity: Number(item.min_quantity || 1),
        max_quantity: Number(item.max_quantity || 1),
        category: item.category || null,
        status: status,
        raw_data: item,
        synced_at: new Date().toISOString()
      };
    });

    // Handle inactive/deleted items
    const catalogsToDeactivate = [];
    for (const [code, status] of existingMap.entries()) {
      if (!syncedServiceCodes.has(code)) {
        if (status !== 'inactive' && status !== 'deleted') {
          catalogsToDeactivate.push({
            vendor_id: vendor.id,
            service_code: code,
            status: 'inactive'
          });
          disabledCount++;
        }
      }
    }

    // Execute batch upserts
    if (catalogsToUpsert.length > 0) {
      const { error: upsertErr } = await supabase
        .from('vendor_catalogs')
        .upsert(catalogsToUpsert, { onConflict: 'vendor_id,service_code' });
      if (upsertErr) throw upsertErr;
    }

    if (catalogsToDeactivate.length > 0) {
      const { error: deactivateErr } = await supabase
        .from('vendor_catalogs')
        .upsert(catalogsToDeactivate, { onConflict: 'vendor_id,service_code' });
      if (deactivateErr) throw deactivateErr;
    }

    // 3. Update sync success metadata
    await supabase
      .from('vendors')
      .update({
        sync_status: 'success',
        sync_error: null,
        last_sync_at: new Date().toISOString(),
        response_time_ms: latency,
        cached_balance: balance
      })
      .eq('id', id);

    return res.json({
      ok: true,
      message: `Đồng bộ thành công!`,
      summary: {
        success: true,
        vendor: vendor.name,
        total: catalogsToUpsert.length,
        new: newCount,
        updated: updatedCount,
        disabled: disabledCount,
        latency,
        balance,
        time: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Sync catalog error:', err);
    await supabase
      .from('vendors')
      .update({
        sync_status: 'failed',
        sync_error: err.message
      })
      .eq('id', id);
    return res.status(500).json({ ok: false, message: `Lỗi server: ${err.message}` });
  }
});

router.get('/vendors/catalog/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const { data, error } = await supabase
      .from('vendor_catalogs')
      .select('service_code, service_name, price, stock, status, category, synced_at')
      .eq('vendor_id', id)
      .order('service_name', { ascending: true });
    if (error) throw error;
    const catalog = (data || []).map(item => ({
      ...item,
      name: item.service_name
    }));
    return res.json({ ok: true, catalog });
  } catch (err) {
    console.error('Fetch vendor catalog error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi lấy danh sách catalog đã đồng bộ' });
  }
});

router.post('/vendors/reset-circuit/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const { resetCircuitBreaker } = require('../fulfillment/vendorRouter');
    resetCircuitBreaker(id);
    
    // Reset stuck sync status in the database
    await supabase
      .from('vendors')
      .update({ sync_status: 'failed', sync_error: 'Đã reset thủ công bằng Circuit Breaker' })
      .eq('id', id);

    return res.json({ ok: true, message: 'Đã thiết lập lại trạng thái kết nối cho nhà cung cấp và giải phóng trạng thái đồng bộ' });
  } catch (err) {
    console.error('Reset circuit error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi reset circuit breaker' });
  }
});

router.get('/vendors/test/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const { data: vendor, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !vendor) {
      return res.status(404).json({ ok: false, message: 'Không tìm thấy nhà cung cấp' });
    }

    const startTime = Date.now();
    let success = false;
    let balance = 0;
    let message = '';
    let httpStatus = 200;


      const { useVendorAdapter } = require('../fulfillment');
      const adapter = useVendorAdapter(vendor);
      const result = await adapter.getBalance();
      
      const latency = Date.now() - startTime;
      success = result.success;
      balance = result.data || 0;
      message = result.message;
      httpStatus = result.httpStatus || 200;

      // Cập nhật số dư và latency vào database
      if (success) {
        await supabase
          .from('vendors')
          .update({
            cached_balance: balance,
            response_time_ms: latency
          })
          .eq('id', id);
      }

      return res.json({
        ok: success,
        success,
        balance,
        latency,
        httpStatus,
        message
      });
  } catch (err) {
    console.error('Test vendor API error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi kiểm tra kết nối API' });
  }
});

router.get('/vendor-products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vendor_products')
      .select('*, vendors(name), products(name), product_variants(name)')
      .order('priority', { ascending: true });
    if (error) throw error;
    return res.json({ ok: true, mappings: data || [] });
  } catch (err) {
    console.error('Fetch vendor mappings error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi lấy danh sách mapping API' });
  }
});

router.post('/vendor-products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { vendor_id, product_id, variant_id, vendor_product_code, priority, enabled } = req.body;
    const { data, error } = await supabase
      .from('vendor_products')
      .upsert({
        vendor_id,
        product_id,
        variant_id,
        vendor_product_code,
        priority: priority || 1,
        enabled: enabled !== false
      }, { onConflict: 'vendor_id,product_id,variant_id' })
      .select('*');
    if (error) throw error;
    return res.json({ ok: true, message: 'Lưu mapping API thành công', mapping: data?.[0] });
  } catch (err) {
    console.error('Save vendor mapping error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi lưu mapping API' });
  }
});

router.delete('/vendor-products/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const { error } = await supabase
      .from('vendor_products')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return res.json({ ok: true, message: 'Xóa mapping API thành công' });
  } catch (err) {
    console.error('Delete vendor mapping error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi xóa mapping API' });
  }
});

router.post('/inventory/preview', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { content_raw } = req.body;
    if (!content_raw) {
      return res.status(400).json({ ok: false, message: 'Nội dung nhập kho trống' });
    }

    const lines = content_raw.split('\n').map(l => l.trim()).filter(Boolean);
    const report = {
      valid: [],
      invalidCount: 0,
      duplicateInFileCount: 0,
      duplicateInDbCount: 0,
      totalLines: lines.length
    };

    const seenInFile = new Set();

    for (const line of lines) {
      const parts = line.split('|');
      let contentJson = null;

      if (parts.length >= 2) {
        contentJson = { email: parts[0].trim(), password: parts[1].trim() };
      } else if (line.length >= 4) {
        contentJson = { key: line };
      }

      if (!contentJson) {
        report.invalidCount++;
        continue;
      }

      if (seenInFile.has(line)) {
        report.duplicateInFileCount++;
        continue;
      }
      seenInFile.add(line);

      const crypto = require('crypto');
      const contentHash = crypto.createHash('md5').update(JSON.stringify(contentJson)).digest('hex');

      const { data: dbMatches } = await supabase
        .from('inventory_items')
        .select('id')
        .eq('content_hash', contentHash)
        .neq('status', 'deleted')
        .limit(1);

      if (dbMatches && dbMatches.length > 0) {
        report.duplicateInDbCount++;
        continue;
      }

      report.valid.push({
        line,
        content: contentJson
      });
    }

    return res.json({ ok: true, report });
  } catch (err) {
    console.error('Inventory preview error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi xem trước nhập kho' });
  }
});

router.post('/inventory/import', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { product_id, variant_id, content_raw, batch_name, supplier, note, import_price, duplicate_policy } = req.body;
    const userId = req.user?.userId;

    if (!product_id || !variant_id || !content_raw || !batch_name) {
      return res.status(400).json({ ok: false, message: 'Thiếu thông tin sản phẩm, phân loại, đợt nhập hoặc tài khoản' });
    }

    const lines = content_raw.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      return res.status(400).json({ ok: false, message: 'Nội dung nhập kho trống' });
    }

    const { data: batch, error: batchErr } = await supabase
      .from('inventory_batches')
      .insert({
        product_id,
        variant_id,
        name: batch_name,
        supplier: supplier || null,
        note: note || null,
        import_price: Number(import_price || 0),
        created_by: userId
      })
      .select('*')
      .single();

    if (batchErr || !batch) {
      console.error('Create batch error:', batchErr);
      return res.status(500).json({ ok: false, message: 'Không tạo được đợt nhập kho mới' });
    }

    const seenInFile = new Set();
    const itemsToInsert = [];
    const report = {
      successCount: 0,
      duplicateCount: 0,
      invalidCount: 0
    };

    const policy = duplicate_policy || 'skip';

    for (const line of lines) {
      const parts = line.split('|');
      let contentJson = null;

      if (parts.length >= 2) {
        contentJson = { email: parts[0].trim(), password: parts[1].trim() };
        if (parts.length >= 3) contentJson.phone = parts[2].trim();
        if (parts.length >= 4) contentJson.cookie = parts.slice(3).join('|').trim();
        contentJson.raw_text = line;
      } else if (line.length >= 4) {
        contentJson = { key: line, raw_text: line };
      }

      if (!contentJson) {
        report.invalidCount++;
        continue;
      }

      if (seenInFile.has(line)) {
        report.duplicateCount++;
        continue;
      }
      seenInFile.add(line);

      const crypto = require('crypto');
      const contentHash = crypto.createHash('md5').update(JSON.stringify(contentJson)).digest('hex');

      const { data: dbMatches } = await supabase
        .from('inventory_items')
        .select('id, status')
        .eq('content_hash', contentHash)
        .neq('status', 'deleted')
        .limit(1);

      const hasDbMatch = dbMatches && dbMatches.length > 0;

      if (hasDbMatch) {
        if (policy === 'skip') {
          report.duplicateCount++;
          continue;
        } else if (policy === 'replace') {
          await supabase
            .from('inventory_items')
            .update({
              cost_price: Number(import_price || 0),
              batch_id: batch.id,
              product_id,
              variant_id,
              status: 'available',
              content_hash: contentHash,
              updated_at: new Date().toISOString()
            })
            .eq('id', dbMatches[0].id);
          report.successCount++;
          continue;
        }
      }

      itemsToInsert.push({
        batch_id: batch.id,
        product_id,
        variant_id,
        content: contentJson,
        content_hash: contentHash,
        status: 'available',
        cost_price: Number(import_price || 0)
      });
      report.successCount++;
    }

    if (itemsToInsert.length > 0) {
      const { error: itemsErr } = await supabase
        .from('inventory_items')
        .insert(itemsToInsert);

      if (itemsErr) {
        console.error('Insert items error:', itemsErr);
        return res.status(500).json({ ok: false, message: 'Không lưu được các tài khoản vào kho' });
      }
    }

    return res.status(201).json({
      ok: true,
      message: `Nhập kho hoàn tất`,
      report
    });
  } catch (err) {
    console.error('Inventory import error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi nhập kho sản phẩm' });
  }
});

router.get('/inventory/items', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { product_id, variant_id, status } = req.query;
    let query = supabase
      .from('inventory_items')
      .select('*, products(name), product_variants(name), inventory_batches(name)');
    
    if (product_id) query = query.eq('product_id', product_id);
    if (variant_id) query = query.eq('variant_id', variant_id);
    if (status) query = query.eq('status', status);

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return res.json({ ok: true, items: data || [] });
  } catch (err) {
    console.error('Fetch inventory items error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi lấy tồn kho' });
  }
});

router.get('/inventory/batches', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('inventory_batches')
      .select('*, products(name), product_variants(name)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ ok: true, batches: data || [] });
  } catch (err) {
    console.error('Fetch batches error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi lấy đợt nhập kho' });
  }
});

router.get('/inventory/histories', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { data: histories, error } = await supabase
      .from('inventory_histories')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    const itemIds = [...new Set((histories || []).map(h => h.inventory_item_id).filter(Boolean))];
    let itemsMap = {};
    if (itemIds.length > 0) {
      const { data: items } = await supabase
        .from('inventory_items')
        .select('id, product_id, products(name), variant_id, product_variants(name)')
        .in('id', itemIds);
      if (items) {
        itemsMap = items.reduce((acc, item) => {
          acc[item.id] = item;
          return acc;
        }, {});
      }
    }
    
    const formatted = (histories || []).map(h => {
      const item = itemsMap[h.inventory_item_id];
      return {
        ...h,
        product_name: item?.products?.name || 'Sản phẩm',
        variant_name: item?.product_variants?.name || 'Phân loại'
      };
    });
    
    return res.json({ ok: true, histories: formatted });
  } catch (err) {
    console.error('Fetch histories error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi lấy lịch sử kho' });
  }
});

router.get('/api-logs', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('api_logs')
      .select('*, vendors(name), store_orders(order_code)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return res.json({ ok: true, logs: data || [] });
  } catch (err) {
    console.error('Fetch api-logs error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi lấy log API' });
  }
});

module.exports = router;
