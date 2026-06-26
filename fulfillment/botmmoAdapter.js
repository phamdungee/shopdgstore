const axios = require('axios');

const REQUEST_TIMEOUT_MS = 25000;
const PURCHASE_ENDPOINT = '/dashboard/cuahang/api_purchase.php';
const QUANTITIES_ENDPOINT = '/dashboard/cuahang/api_get_quantities.php';

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
  if (payload.status === true || payload.ket_qua === true || payload.success === true) return true;

  const status = plainStatus(payload.status || payload.ket_qua || payload.success || payload.message || payload.msg);
  return status === 'true' || status === 'success' || status.includes('thanh cong');
}

function messageFrom(payload, fallback) {
  if (!payload || typeof payload !== 'object') return fallback;
  return String(payload.msg || payload.message || payload.error || fallback);
}

function firstArray(...values) {
  return values.find(Array.isArray) || [];
}

function deliveryData(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;
  return firstArray(payload.data, payload.accounts, payload.account, payload.result, payload.keys) || payload.data || null;
}

function parseMoney(value) {
  const number = parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

function parseStock(value) {
  const number = parseInt(value, 10);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function normalizeQuantityItem(item) {
  const id = item.account_type_id ?? item.id ?? item.product_id ?? item.service_id ?? item.code;
  return {
    id,
    vendor_product_code: String(id ?? ''),
    name: String(item.name || item.title || `BotMMO ${id || 'package'}`),
    price: parseMoney(item.price ?? item.gia ?? item.amount),
    stock: parseStock(item.quantity ?? item.stock ?? item.soluong ?? item.available)
  };
}

function balanceFrom(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 0;
  return parseMoney(payload.balance ?? payload.sodu ?? payload.soduWeb ?? payload.money ?? payload.credit);
}

function createBotMmoAdapter(vendor) {
  const baseURL = String(vendor.api_url || '').replace(/\/+$/, '');
  const apiKey = vendor.api_key;
  const client = axios.create({
    baseURL,
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  });

  return {
    async buy(productCode, quantity) {
      const accountTypeId = Number(productCode);
      const buyQuantity = parseStock(quantity) || 1;
      const requestPayload = {
        api_key: apiKey,
        account_type_id: accountTypeId,
        quantity: buyQuantity
      };
      const response = await client.post(PURCHASE_ENDPOINT, requestPayload);
      const ok = successStatus(response.data);

      return {
        success: ok,
        data: ok ? deliveryData(response.data) : null,
        message: messageFrom(response.data, ok ? 'success' : 'BotMMO purchase failed'),
        raw: response.data || null,
        httpStatus: response.status,
        requestPayload: {
          method: 'POST',
          endpoint: PURCHASE_ENDPOINT,
          account_type_id: accountTypeId,
          quantity: buyQuantity
        }
      };
    },

    async getBalance() {
      const requestPayload = { api_key: apiKey };
      const response = await client.get(QUANTITIES_ENDPOINT, { params: requestPayload });
      const ok = successStatus(response.data);

      return {
        success: ok,
        data: ok ? balanceFrom(response.data) : 0,
        message: messageFrom(response.data, ok ? 'success' : 'BotMMO balance lookup failed'),
        raw: response.data || null,
        httpStatus: response.status,
        requestPayload: {
          method: 'GET',
          endpoint: QUANTITIES_ENDPOINT
        }
      };
    },

    async getList() {
      const requestPayload = { api_key: apiKey };
      const response = await client.get(QUANTITIES_ENDPOINT, { params: requestPayload });
      const ok = successStatus(response.data);
      const list = Array.isArray(response.data)
        ? response.data
        : firstArray(response.data && response.data.data, response.data && response.data.items, response.data && response.data.result);

      return {
        success: ok,
        data: ok ? list.map(normalizeQuantityItem) : [],
        message: messageFrom(response.data, ok ? 'success' : 'BotMMO list lookup failed'),
        raw: response.data || null,
        httpStatus: response.status,
        requestPayload: {
          method: 'GET',
          endpoint: QUANTITIES_ENDPOINT
        }
      };
    }
  };
}

module.exports = createBotMmoAdapter;
