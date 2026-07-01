const axios = require('axios');

const REQUEST_TIMEOUT_MS = 20000;

function successStatus(payload, action) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.status === 'success' || payload.status === true || payload.success === true) return true;
  if (action === 'balance') return payload.balance !== undefined;
  if (action === 'services') return Array.isArray(payload.data) || payload.data !== undefined;
  return false;
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

function createShopee68Adapter(vendor) {
  const baseURL = String(vendor.api_url || '').replace(/\/+$/, '');
  const apiKey = vendor.api_key;
  
  const client = axios.create({
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json'
    }
  });

  return {
    async buy(productCode, quantity) {
      const url = resolveUrl(baseURL, '/BResource.php');
      const response = await client.get(url, {
        params: {
          id: productCode,
          amount: quantity
        }
      });

      const ok = successStatus(response.data, 'buy');
      const dataVal = ok && response.data ? (Array.isArray(response.data.data) ? response.data.data : []) : null;

      return {
        success: ok,
        data: dataVal,
        message: String((response.data && (response.data.msg || response.data.message)) || (ok ? 'success' : 'Shopee68 purchase failed')),
        raw: response.data || null,
        httpStatus: response.status,
        requestPayload: {
          method: 'GET',
          endpoint: url,
          id: productCode,
          amount: quantity
        }
      };
    },

    async getBalance() {
      const url = resolveUrl(baseURL, '/GetBalance.php');
      const response = await client.get(url);
      const ok = successStatus(response.data, 'balance');

      return {
        success: ok,
        data: ok ? Number(response.data.balance || 0) : 0,
        message: String((response.data && (response.data.msg || response.data.message)) || (ok ? 'success' : 'Shopee68 balance lookup failed')),
        raw: response.data || null,
        httpStatus: response.status,
        requestPayload: {
          method: 'GET',
          endpoint: url
        }
      };
    },

    async getList() {
      const url = resolveUrl(baseURL, '/ListResource.php');
      const response = await client.get(url);
      const ok = successStatus(response.data, 'services');
      const dataVal = ok && response.data ? (Array.isArray(response.data.data) ? response.data.data : []) : [];

      return {
        success: ok,
        data: dataVal,
        message: String((response.data && (response.data.msg || response.data.message)) || (ok ? 'success' : 'Shopee68 resource list lookup failed')),
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

module.exports = createShopee68Adapter;
