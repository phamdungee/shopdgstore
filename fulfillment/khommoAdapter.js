const axios = require('axios');

const REQUEST_TIMEOUT_MS = 25000;
const DEFAULT_BASE_URL = 'https://api.khommo.vn/api/partner/v1';

function plainStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function successStatus(payload, action) {
  if (!payload || typeof payload !== 'object') return false;

  // Direct boolean / ok check
  if (payload.ok === true || payload.status === 'success' || payload.status === true || payload.success === true) return true;
  if (payload.ok === false || payload.error || payload.err) return false;

  // KhoMMO order statuses: COMPLETED, PROCESSING, SUCCESS
  const rawStatus = String(payload.status || payload.state || '').toUpperCase();
  if (['COMPLETED', 'PROCESSING', 'SUCCESS', 'PENDING'].includes(rawStatus)) return true;

  if (action === 'balance') {
    return (
      payload.balance !== undefined ||
      payload.vnd !== undefined ||
      payload.credit !== undefined ||
      payload.username !== undefined ||
      (payload.data && (
        payload.data.balance !== undefined ||
        payload.data.vnd !== undefined ||
        payload.data.credit !== undefined ||
        payload.data.username !== undefined
      ))
    );
  }

  if (action === 'services') {
    return Array.isArray(payload) || Array.isArray(payload.data) || Array.isArray(payload.products) || Array.isArray(payload.items);
  }

  const statusStr = plainStatus(payload.status || payload.message || payload.msg);
  return statusStr === 'true' || statusStr === 'success' || statusStr.includes('thanh cong');
}

function messageFrom(payload, fallback) {
  if (!payload || typeof payload !== 'object') return fallback;
  return String(payload.message || payload.msg || payload.error || payload.err || fallback);
}

function firstArray(...values) {
  return values.find(Array.isArray) || [];
}

function deliveryData(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;

  if (payload.deliveryContent !== undefined) return payload.deliveryContent;
  if (payload.content !== undefined) return payload.content;

  const dataObj = payload.data || payload;
  if (dataObj && typeof dataObj === 'object') {
    if (dataObj.deliveryContent !== undefined) return dataObj.deliveryContent;
    if (dataObj.content !== undefined) return dataObj.content;
  }

  return firstArray(payload.data, payload.accounts, payload.items, payload.result, payload.keys) || payload.data || null;
}

function parseMoney(value) {
  const number = parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

function parseStock(value) {
  const number = parseInt(value, 10);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function normalizeProductItem(item) {
  const id = item.id ?? item.productId ?? item.code ?? item.product_id;
  return {
    id,
    vendor_product_code: String(id ?? ''),
    name: String(item.name || item.title || item.productName || `KhoMMO ${id || 'Product'}`),
    price: parseMoney(item.price ?? item.gia ?? item.amount ?? item.cost),
    stock: parseStock(item.stock ?? item.tonkho ?? item.quantity ?? item.available ?? item.soluong),
    paymentMode: String(item.paymentMode || item.payment_mode || 'VND').toUpperCase()
  };
}

function balanceFrom(payload) {
  if (!payload || typeof payload !== 'object') return 0;
  const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  return parseMoney(data.vnd ?? data.balance ?? data.credit ?? data.sodu ?? 0);
}

function cleanBaseUrl(url) {
  let base = String(url || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  // Clean trailing endpoints if user pasted full path in vendor config
  base = base.replace(/\/(me|products|orders)$/i, '');
  return base || DEFAULT_BASE_URL;
}

function resolveUrl(api_url, path) {
  const base = cleanBaseUrl(api_url);
  const cleanPath = String(path || '').replace(/^\/+/, '');

  if (!cleanPath) return base;

  const lowerBase = base.toLowerCase();
  const lowerPath = cleanPath.toLowerCase();

  if (lowerPath.startsWith('api/') && (lowerBase.endsWith('/api') || lowerBase.includes('/api/'))) {
    const pathWithoutApi = cleanPath.substring(4);
    return base + (pathWithoutApi ? '/' + pathWithoutApi : '');
  }

  return base + '/' + cleanPath;
}

function createKhommoAdapter(vendor) {
  const rawApiUrl = String(vendor.api_url || '').trim();
  const baseURL = cleanBaseUrl(rawApiUrl);

  // Clean API key (strip leading "Bearer " if user accidentally pasted it into api_key)
  let rawApiKey = String(vendor.api_key || '').trim();
  const apiKey = rawApiKey.replace(/^Bearer\s+/i, '').trim();

  const client = axios.create({
    timeout: REQUEST_TIMEOUT_MS,
    validateStatus: () => true, // Treat all HTTP status codes as valid so we can format error responses gracefully
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  });

  return {
    async buy(productCode, quantity, options = {}) {
      const productId = String(productCode || '').trim();
      const buyQuantity = parseStock(quantity) || 1;
      const paymentMode = String(options.paymentMode || (vendor.metadata && vendor.metadata.paymentMode) || 'VND').toUpperCase();

      const requestPayload = {
        productId,
        quantity: buyQuantity,
        paymentMode
      };

      const url = resolveUrl(baseURL, '/orders');

      try {
        const response = await client.post(url, requestPayload);
        const payload = response.data || {};

        const ok = response.status >= 200 && response.status < 300 && successStatus(payload, 'buy');
        const dataObj = payload.data && typeof payload.data === 'object' ? payload.data : payload;

        const orderNo = String(dataObj.orderNo || dataObj.order_no || dataObj.id || dataObj.code || '');
        const orderStatus = String(dataObj.status || dataObj.state || (ok ? 'COMPLETED' : 'FAILED')).toUpperCase();

        return {
          success: ok && orderStatus !== 'FAILED',
          orderNo,
          orderStatus,
          data: deliveryData(payload),
          message: messageFrom(payload, ok ? 'Đặt hàng KhoMMO thành công' : `Đặt hàng KhoMMO thất bại (HTTP ${response.status})`),
          raw: payload,
          httpStatus: response.status,
          requestPayload: {
            method: 'POST',
            endpoint: url,
            body: requestPayload
          }
        };
      } catch (err) {
        return {
          success: false,
          orderNo: '',
          orderStatus: 'FAILED',
          data: null,
          message: `Lỗi kết nối KhoMMO: ${err.message}`,
          raw: err.response ? err.response.data : null,
          httpStatus: err.response ? err.response.status : 500,
          requestPayload: {
            method: 'POST',
            endpoint: url,
            body: requestPayload
          }
        };
      }
    },

    async getBalance() {
      const url = resolveUrl(baseURL, '/me');

      try {
        const response = await client.get(url);
        const payload = response.data || {};
        const ok = response.status >= 200 && response.status < 300 && successStatus(payload, 'balance');

        return {
          success: ok,
          data: ok ? balanceFrom(payload) : 0,
          message: messageFrom(payload, ok ? 'Lấy số dư KhoMMO thành công' : `KhoMMO API (HTTP ${response.status}): ${messageFrom(payload, 'Lấy số dư thất bại')}`),
          raw: payload,
          httpStatus: response.status,
          requestPayload: {
            method: 'GET',
            endpoint: url
          }
        };
      } catch (err) {
        return {
          success: false,
          data: 0,
          message: `Lỗi kết nối KhoMMO: ${err.message}`,
          raw: err.response ? err.response.data : null,
          httpStatus: err.response ? err.response.status : 500,
          requestPayload: {
            method: 'GET',
            endpoint: url
          }
        };
      }
    },

    async getList(params = {}) {
      const queryParams = {
        page: params.page || 1,
        limit: params.limit || 100,
        ...(params.search ? { search: params.search } : {})
      };

      const url = resolveUrl(baseURL, '/products');

      try {
        const response = await client.get(url, { params: queryParams });
        const payload = response.data || {};
        const ok = response.status >= 200 && response.status < 300 && successStatus(payload, 'services');

        const rawList = Array.isArray(payload)
          ? payload
          : firstArray(
              payload.data,
              payload.products,
              payload.items,
              payload.result,
              payload.data && payload.data.items,
              payload.data && payload.data.products
            );

        return {
          success: ok,
          data: ok ? rawList.map(normalizeProductItem) : [],
          message: messageFrom(payload, ok ? 'Lấy danh sách KhoMMO thành công' : `KhoMMO API (HTTP ${response.status}): ${messageFrom(payload, 'Lấy danh sách thất bại')}`),
          raw: payload,
          httpStatus: response.status,
          requestPayload: {
            method: 'GET',
            endpoint: url,
            params: queryParams
          }
        };
      } catch (err) {
        return {
          success: false,
          data: [],
          message: `Lỗi kết nối KhoMMO: ${err.message}`,
          raw: err.response ? err.response.data : null,
          httpStatus: err.response ? err.response.status : 500,
          requestPayload: {
            method: 'GET',
            endpoint: url,
            params: queryParams
          }
        };
      }
    },

    async getOrder(orderNo) {
      const cleanOrderNo = String(orderNo || '').trim();
      const url = resolveUrl(baseURL, `/orders/${cleanOrderNo}`);

      try {
        const response = await client.get(url);
        const payload = response.data || {};
        const ok = response.status >= 200 && response.status < 300 && successStatus(payload, 'order');
        const dataObj = payload.data && typeof payload.data === 'object' ? payload.data : payload;

        return {
          success: ok,
          orderNo: cleanOrderNo,
          orderStatus: String(dataObj.status || dataObj.state || '').toUpperCase(),
          data: deliveryData(payload),
          message: messageFrom(payload, ok ? 'Lấy đơn hàng KhoMMO thành công' : `KhoMMO API (HTTP ${response.status}): ${messageFrom(payload, 'Lấy đơn hàng thất bại')}`),
          raw: payload,
          httpStatus: response.status,
          requestPayload: {
            method: 'GET',
            endpoint: url
          }
        };
      } catch (err) {
        return {
          success: false,
          orderNo: cleanOrderNo,
          orderStatus: 'FAILED',
          data: null,
          message: `Lỗi kết nối KhoMMO: ${err.message}`,
          raw: err.response ? err.response.data : null,
          httpStatus: err.response ? err.response.status : 500,
          requestPayload: {
            method: 'GET',
            endpoint: url
          }
        };
      }
    }
  };
}

module.exports = createKhommoAdapter;
