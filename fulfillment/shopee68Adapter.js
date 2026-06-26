const axios = require('axios');

const REQUEST_TIMEOUT_MS = 20000;

function successStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  const asciiStatus = status.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return status === 'success' || asciiStatus.includes('thanh cong');
}

function vendorClient(vendor) {
  const baseURL = String(vendor.api_url || '').replace(/\/+$/, '');
  if (!baseURL) {
    throw new Error('Shopee68 vendor is missing api_url');
  }

  return axios.create({
    baseURL,
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${vendor.api_key}`,
      Accept: 'application/json'
    }
  });
}

function normalizeResponse(payload, dataSelector, defaultMessage) {
  const ok = successStatus(payload && payload.status);
  return {
    success: ok,
    data: ok ? dataSelector(payload) : null,
    message: String((payload && (payload.msg || payload.message)) || defaultMessage || (ok ? 'success' : 'failed')),
    raw: payload || null
  };
}

function createShopee68Adapter(vendor) {
  const client = vendorClient(vendor);

  return {
    async buy(productCode, quantity) {
      const response = await client.get('/BResource.php', {
        params: {
          id: productCode,
          amount: quantity
        }
      });

      const normalized = normalizeResponse(
        response.data,
        payload => Array.isArray(payload.data) ? payload.data : [],
        'Shopee68 purchase failed'
      );

      return {
        ...normalized,
        httpStatus: response.status,
        requestPayload: {
          method: 'GET',
          endpoint: '/BResource.php',
          id: productCode,
          amount: quantity
        }
      };
    },

    async getBalance() {
      const response = await client.get('/GetBalance.php');
      const normalized = normalizeResponse(
        response.data,
        payload => Number(payload.balance || 0),
        'Shopee68 balance lookup failed'
      );

      return {
        ...normalized,
        httpStatus: response.status,
        requestPayload: {
          method: 'GET',
          endpoint: '/GetBalance.php'
        }
      };
    },

    async getList() {
      const response = await client.get('/ListResource.php');
      const normalized = normalizeResponse(
        response.data,
        payload => Array.isArray(payload.data) ? payload.data : [],
        'Shopee68 resource list lookup failed'
      );

      return {
        ...normalized,
        httpStatus: response.status,
        requestPayload: {
          method: 'GET',
          endpoint: '/ListResource.php'
        }
      };
    }
  };
}

module.exports = createShopee68Adapter;

