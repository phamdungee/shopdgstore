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
  if (payload.status === true || payload.success === true || payload.order) return true;
  if (payload.error) return false;

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
  return Number.isFinite(number) ? Math.max(0, number) : 99999;
}

function normalizeProductItem(item) {
  const id = item.service ?? item.id ?? item.product_id ?? item.service_id ?? item.code;
  return {
    id,
    vendor_product_code: String(id ?? ''),
    name: String(item.name || item.title || item.product_name || `TramMMO ${id || 'package'}`),
    price: parseMoney(item.rate ?? item.price ?? item.gia),
    stock: parseStock(item.max ?? item.stock ?? item.quantity ?? 99999)
  };
}

function balanceFrom(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 0;
  return parseMoney(payload.balance ?? payload.sodu ?? payload.soduWeb ?? payload.money ?? payload.credit);
}

function createTramMmoAdapter(vendor) {
  const baseURL = String(vendor.api_url || 'https://trammmo.com/api/v2').replace(/\/+$/, '');
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
      const buyQuantity = parseInt(quantity, 10) || 1;
      
      const params = new URLSearchParams();
      params.append('key', apiKey);
      params.append('action', 'add');
      params.append('service', String(productCode));
      params.append('quantity', String(buyQuantity));
      params.append('link', 'https://dgstore.local/order'); // safe fallback/placeholder link for SMM API

      const response = await client.post('', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const ok = successStatus(response.data);
      const orderId = ok && response.data ? (response.data.order || response.data.order_id) : null;

      return {
        success: ok,
        data: orderId ? [String(orderId)] : null,
        message: messageFrom(response.data, ok ? 'success' : 'TramMMO purchase failed'),
        raw: response.data || null,
        httpStatus: response.status,
        requestPayload: {
          method: 'POST',
          endpoint: '/',
          action: 'add',
          service: productCode,
          quantity: buyQuantity,
          link: 'https://dgstore.local/order'
        }
      };
    },

    async getBalance() {
      const params = new URLSearchParams();
      params.append('key', apiKey);
      params.append('action', 'balance');

      const response = await client.post('', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      const ok = successStatus(response.data);

      return {
        success: ok,
        data: ok ? balanceFrom(response.data) : 0,
        message: messageFrom(response.data, ok ? 'success' : 'TramMMO balance lookup failed'),
        raw: response.data || null,
        httpStatus: response.status,
        requestPayload: {
          method: 'POST',
          endpoint: '/',
          action: 'balance'
        }
      };
    },

    async getList() {
      const params = new URLSearchParams();
      params.append('key', apiKey);
      params.append('action', 'services');

      const response = await client.post('', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      const ok = successStatus(response.data);
      let list = [];
      if (ok && response.data) {
        list = Array.isArray(response.data) ? response.data : Object.values(response.data);
      }

      return {
        success: ok,
        data: ok ? list.map(normalizeProductItem) : [],
        message: messageFrom(response.data, ok ? 'success' : 'TramMMO list lookup failed'),
        raw: response.data || null,
        httpStatus: response.status,
        requestPayload: {
          method: 'POST',
          endpoint: '/',
          action: 'services'
        }
      };
    }
  };
}

module.exports = createTramMmoAdapter;
