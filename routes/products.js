const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const supabase = require('../config/supabase');
const { authMiddleware, adminMiddleware } = require('../middlewares/authMiddleware');
const { normalizeString } = require('../services/storeService');
const verifyTurnstile = require('../middlewares/turnstileMiddleware');

const PRODUCT_TEXT_FIELDS = [
  'cat',
  'icon',
  'slug',
  'name',
  'desc',
  'long_desc',
  'image',
  'vendor_product_code',
  'delivery_type',
  'fallback_mode'
];

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function parseNumericField(value, fieldName) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    const error = new Error(`${fieldName} phải là số hợp lệ`);
    error.statusCode = 400;
    throw error;
  }
  return parsed;
}

function parseIntField(value, fieldName) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    const error = new Error(`${fieldName} phải là số nguyên hợp lệ`);
    error.statusCode = 400;
    throw error;
  }
  return Math.max(0, parsed);
}

function normalizeVariants(value) {
  let variants = value;
  if (typeof variants === 'string') {
    try {
      variants = JSON.parse(variants);
    } catch {
      const error = new Error('variants phải là JSON array hợp lệ');
      error.statusCode = 400;
      throw error;
    }
  }

  if (variants === null || variants === undefined || variants === '') return [];
  if (!Array.isArray(variants)) {
    const error = new Error('variants phải là array');
    error.statusCode = 400;
    throw error;
  }

  return variants
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      name: String(item.name || '').trim(),
      price: parseNumericField(item.price, 'variants.price') || 0,
      vendor_product_code: String(item.vendor_product_code || item.provider_service_id || '').trim(),
      cost_price: parseNumericField(item.cost_price, 'variants.cost_price') || 0,
      stock: parseIntField(item.stock, 'variants.stock') || 0,
      delivery_type: String(item.delivery_type || item.deliveryType || 'hybrid').trim(),
      fallback_mode: String(item.fallback_mode || item.fallbackMode || 'api_when_out_of_stock').trim()
    }))
    .filter(item => item.name);
}

function productUpdatePayload(body) {
  const payload = {};

  for (const field of PRODUCT_TEXT_FIELDS) {
    if (hasOwn(body, field)) {
      payload[field] = String(body[field] ?? '').trim();
    }
  }

  if (hasOwn(body, 'price')) payload.price = parseNumericField(body.price, 'price');
  if (hasOwn(body, 'cost_price')) payload.cost_price = parseNumericField(body.cost_price, 'cost_price');
  if (hasOwn(body, 'rate')) payload.rate = parseNumericField(body.rate, 'rate');
  if (hasOwn(body, 'stock')) payload.stock_cache = parseIntField(body.stock, 'stock');
  if (hasOwn(body, 'vendor_id')) payload.vendor_id = parseIntField(body.vendor_id, 'vendor_id');
  if (hasOwn(body, 'variants')) payload.variants = normalizeVariants(body.variants);

  return payload;
}

router.get('/', async (req, res) => {
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select('*, product_variants(*)')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Fetch products error:', error);
      return res.status(500).json({ ok: false, message: 'Không lấy được danh sách sản phẩm' });
    }

    const formattedProducts = (products || []).map(p => ({
      ...p,
      variants: (p.product_variants || []).map(v => ({
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
      stock: p.stock_cache
    }));

    return res.json({ ok: true, products: formattedProducts });
  } catch (err) {
    console.error('Products fetch error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi lấy danh sách sản phẩm' });
  }
});

// GET /api/products/:slug - Lấy chi tiết sản phẩm theo slug (Public)
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = normalizeString(req.params.id);
    const payload = productUpdatePayload(req.body || {});
    const variants = payload.variants;
    delete payload.variants;

    if (!id) {
      return res.status(400).json({ ok: false, message: 'Thiếu ID sản phẩm' });
    }

    const { data: product, error } = await supabase
      .from('products')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('Update product error:', error);
      return res.status(500).json({ ok: false, message: 'Không cập nhật được sản phẩm' });
    }

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
            delivery_type: v.delivery_type || product.delivery_type || 'hybrid',
            fallback_mode: v.fallback_mode || product.fallback_mode || 'api_when_out_of_stock'
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

    return res.json({ ok: true, product: formatted });
  } catch (err) {
    console.error('Product update error:', err);
    return res.status(err.statusCode || 500).json({
      ok: false,
      message: err.message || 'Lỗi server khi cập nhật sản phẩm'
    });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const slug = normalizeString(req.params.slug);
    const { data: product, error } = await supabase
      .from('products')
      .select('*, product_variants(*)')
      .eq('slug', slug)
      .single();

    if (error || !product) {
      console.error('Fetch product detail error:', error);
      return res.status(404).json({ ok: false, message: 'Không tìm thấy sản phẩm' });
    }

    const formatted = {
      ...product,
      variants: (product.product_variants || []).map(v => ({
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
      stock: product.stock_cache
    };

    return res.json({ ok: true, product: formatted });
  } catch (err) {
    console.error('Product detail error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi lấy chi tiết sản phẩm' });
  }
});

const fs = require('fs');
const path = require('path');
const reviewsFilePath = path.join(__dirname, '../config/reviews.json');

// Helper to read reviews
function readReviewsFile() {
  try {
    if (!fs.existsSync(reviewsFilePath)) {
      return [];
    }
    const raw = fs.readFileSync(reviewsFilePath, 'utf8');
    const data = JSON.parse(raw);
    return data.reviews || [];
  } catch (err) {
    console.error('Error reading reviews file:', err);
    return [];
  }
}

// Helper to write reviews
function writeReviewsFile(reviews) {
  try {
    const dir = path.dirname(reviewsFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(reviewsFilePath, JSON.stringify({ reviews }, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing reviews file:', err);
    return false;
  }
}

// GET /api/products/:slug/reviews - Get reviews list for a product slug
router.get('/:slug/reviews', async (req, res) => {
  try {
    const slug = normalizeString(req.params.slug);
    const reviews = readReviewsFile();
    const productReviews = reviews.filter(r => r.productSlug === slug)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Calculate average rating
    let avgRating = 5.0;
    if (productReviews.length > 0) {
      const sum = productReviews.reduce((acc, r) => acc + Number(r.rating || 5), 0);
      avgRating = Number((sum / productReviews.length).toFixed(1));
    }

    // Check optional authentication and check if the user has purchased
    let hasPurchased = false;
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (payload?.userId) {
          const { count, error } = await supabase
            .from('store_orders')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', payload.userId)
            .eq('product_slug', slug)
            .eq('status', 'completed');
          
          if (!error && count > 0) {
            hasPurchased = true;
          }
        }
      } catch (jwtErr) {
        // ignore invalid token in public GET route
      }
    }

    // Only return the 3 newest reviews
    const displayedReviews = productReviews.slice(0, 3);

    return res.json({ ok: true, reviews: displayedReviews, avgRating, hasPurchased });
  } catch (err) {
    console.error('Error fetching reviews:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi lấy đánh giá sản phẩm' });
  }
});

// POST /api/products/:slug/reviews - Submit a review (Auth required)
router.post('/:slug/reviews', authMiddleware, async (req, res) => {
  try {
    const slug = normalizeString(req.params.slug);
    const { rating, comment } = req.body;
    const username = req.user?.username || 'Khách ẩn danh';
    const userId = req.user?.userId;

    const parsedRating = Number(rating);
    if (!parsedRating || parsedRating < 1 || parsedRating > 5) {
      return res.status(400).json({ ok: false, message: 'Số sao đánh giá phải từ 1 đến 5' });
    }

    // Check if user has purchased the product
    const { count, error } = await supabase
      .from('store_orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('product_slug', slug)
      .eq('status', 'completed');

    const hasPurchased = !error && count > 0;
    const cleanComment = (comment || '').trim();

    if (!hasPurchased && cleanComment !== '') {
      return res.status(400).json({ ok: false, message: 'Chỉ khách hàng đã mua sản phẩm mới được gửi bình luận đánh giá.' });
    }

    const reviews = readReviewsFile();
    
    const newReview = {
      id: String(Date.now() + Math.random().toString(36).substr(2, 5)),
      productSlug: slug,
      username,
      rating: parsedRating,
      comment: cleanComment,
      createdAt: new Date().toISOString()
    };

    reviews.push(newReview);
    writeReviewsFile(reviews);

    return res.json({ ok: true, review: newReview, message: 'Đánh giá thành công!' });
  } catch (err) {
    console.error('Error submitting review:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi gửi đánh giá' });
  }
});

module.exports = router;
