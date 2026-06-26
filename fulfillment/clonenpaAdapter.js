const axios = require('axios');

const REQUEST_TIMEOUT_MS = 25000;

function plainStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function successStatus(payload) {
  if (Array.isArray(payload)) return true;
  if (!payload || typeof payload !== 'object') return false;
  if (payload.status === true || payload.success === true) return true;

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
  return parseMoney(payload.balance ?? payload.sodu ?? payload.soduWeb ?? payload.money ?? payload.credit ?? payload.amount);
}

function createCloneNpaAdapter(vendor) {
  const baseURL = String(vendor.api_url || '').replace(/\/+$/, '');
  const apiKey = vendor.api_key;
  
  const client = axios.create({
    baseURL,
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      Accept: 'application/json'
    }
  });

  return {
    async buy(productCode, quantity) {
      const buyQuantity = parseStock(quantity) || 1;
      
      // Submit as form data (x-www-form-urlencoded) for compatibility with clone site APIs
      const params = new URLSearchParams();
      params.append('action', 'buyProduct');
      params.append('id', String(productCode));
      params.append('amount', String(buyQuantity));
      params.append('api_key', apiKey);

      const response = await client.post('/api/buy_product', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const ok = successStatus(response.data);
      const accounts = ok && response.data ? (response.data.data || response.data.accounts || response.data.result) : null;

      return {
        success: ok,
        data: Array.isArray(accounts) ? accounts : null,
        message: messageFrom(response.data, ok ? 'success' : 'CloneNPA purchase failed'),
        raw: response.data || null,
        httpStatus: response.status,
        requestPayload: {
          method: 'POST',
          endpoint: '/api/buy_product',
          action: 'buyProduct',
          id: productCode,
          amount: buyQuantity
        }
      };
    },

    async getBalance() {
      const response = await client.get('/api/profile.php', {
        params: { api_key: apiKey }
      });
      const ok = successStatus(response.data);

      return {
        success: ok,
        data: ok ? balanceFrom(response.data) : 0,
        message: messageFrom(response.data, ok ? 'success' : 'CloneNPA balance lookup failed'),
        raw: response.data || null,
        httpStatus: response.status,
        requestPayload: {
          method: 'GET',
          endpoint: '/api/profile.php'
        }
      };
    },

    async getList() {
      const response = await client.get('/api/products.php', {
        params: { api_key: apiKey }
      });
      const ok = successStatus(response.data);
      
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
          endpoint: '/api/products.php'
        }
      };
    }
  };
}

module.exports = createCloneNpaAdapter;
