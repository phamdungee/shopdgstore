const axios = require('axios');

const REQUEST_TIMEOUT_MS = 25000;

function plainStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function successStatus(payload, action) {
  if (Array.isArray(payload)) return true;
  if (!payload || typeof payload !== 'object') return false;
  if (payload.status === true || payload.success === true) return true;
  if (payload.error || payload.err) return false;

  if (action === 'balance') {
    return payload.balance !== undefined || payload.sodu !== undefined || payload.amount !== undefined
      || (payload.data && payload.data.money !== undefined);
  }
  if (action === 'services') {
    return Array.isArray(payload) || payload.products !== undefined || payload.categories !== undefined || payload.data !== undefined;
  }

  const status = plainStatus(payload.status || payload.success || payload.message || payload.msg);
  return status === 'true' || status === 'success' || status.includes('thanh cong');
}

function messageFrom(payload, fallback) {
  if (!payload || typeof payload !== 'object') return fallback;
  return String(payload.msg || payload.message || payload.error || fallback);
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
  const id = item.id ?? item.product_id ?? item.service_id ?? item.code;
  return {
    id,
    vendor_product_code: String(id ?? ''),
    name: String(item.name || item.title || item.product_name || `CloneNPA ${id || 'package'}`),
    price: parseMoney(item.price ?? item.gia),
    stock: parseStock(item.amount ?? item.stock ?? item.quantity ?? item.soluong ?? item.available)
  };
}

function balanceFrom(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 0;
  // Check top-level keys first, then nested data object (e.g. CloneNPA: { data: { money: "8060.00" } })
  const topLevel = payload.balance ?? payload.sodu ?? payload.soduWeb ?? payload.money ?? payload.credit ?? payload.amount;
  if (topLevel !== undefined && topLevel !== null) return parseMoney(topLevel);
  if (payload.data && typeof payload.data === 'object') {
    return parseMoney(payload.data.money ?? payload.data.balance ?? payload.data.sodu ?? payload.data.credit ?? payload.data.amount);
  }
  return 0;
}

function resolveUrl(api_url, path) {
  const base = String(api_url || '').replace(/\/+$/, '');
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

function createCloneNpaAdapter(vendor) {
  const baseURL = String(vendor.api_url || '').replace(/\/+$/, '');
  const apiKey = vendor.api_key;
  
  const client = axios.create({
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      Accept: 'application/json'
    }
  });

  return {
    async buy(productCode, quantity) {
      const buyQuantity = parseStock(quantity) || 1;
      
      const params = new URLSearchParams();
      params.append('action', 'buyProduct');
      params.append('id', String(productCode));
      params.append('amount', String(buyQuantity));
      params.append('api_key', apiKey);

      const url = resolveUrl(baseURL, '/api/buy_product');
      const response = await client.post(url, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const ok = successStatus(response.data, 'buy');
      const accounts = ok && response.data ? (response.data.data || response.data.accounts || response.data.result) : null;

      return {
        success: ok,
        data: Array.isArray(accounts) ? accounts : null,
        message: messageFrom(response.data, ok ? 'success' : 'CloneNPA purchase failed'),
        raw: response.data || null,
        httpStatus: response.status,
        requestPayload: {
          method: 'POST',
          endpoint: url,
          action: 'buyProduct',
          id: productCode,
          amount: buyQuantity
        }
      };
    },

    async getBalance() {
      const url = resolveUrl(baseURL, '/api/profile.php');
      const response = await client.get(url, {
        params: { api_key: apiKey }
      });
      const ok = successStatus(response.data, 'balance');

      return {
        success: ok,
        data: ok ? balanceFrom(response.data) : 0,
        message: messageFrom(response.data, ok ? 'success' : 'CloneNPA balance lookup failed'),
        raw: response.data || null,
        httpStatus: response.status,
        requestPayload: {
          method: 'GET',
          endpoint: url
        }
      };
    },

    async getList() {
      const url = resolveUrl(baseURL, '/api/products.php');
      const response = await client.get(url, {
        params: { api_key: apiKey }
      });
      const ok = successStatus(response.data, 'services');
      
      let list = [];
      if (ok && response.data) {
        if (Array.isArray(response.data)) {
          list = response.data;
        } else if (response.data.products && Array.isArray(response.data.products)) {
          list = response.data.products;
        } else if (response.data.categories && Array.isArray(response.data.categories)) {
          for (const cat of response.data.categories) {
            if (cat && Array.isArray(cat.products)) {
              list.push(...cat.products);
            }
          }
        } else if (Array.isArray(response.data.data)) {
          list = response.data.data;
          if (list.length > 0 && list[0].products) {
            const nested = [];
            for (const cat of list) {
              if (cat && Array.isArray(cat.products)) {
                nested.push(...cat.products);
              }
            }
            list = nested;
          }
        } else {
          const keys = Object.keys(response.data);
          for (const key of keys) {
            const item = response.data[key];
            if (Array.isArray(item)) {
              if (item.length > 0 && item[0].products) {
                for (const cat of item) {
                  if (cat && Array.isArray(cat.products)) {
                    list.push(...cat.products);
                  }
                }
              } else {
                list.push(...item);
              }
            }
          }
        }
      }

      return {
        success: ok,
        data: ok ? list.map(normalizeProductItem) : [],
        message: messageFrom(response.data, ok ? 'success' : 'CloneNPA list lookup failed'),
        raw: response.data || null,
        httpStatus: response.status,
        requestPayload: {
          method: 'GET',
          endpoint: url
        }
      };
    }
  };
}

module.exports = createCloneNpaAdapter;
