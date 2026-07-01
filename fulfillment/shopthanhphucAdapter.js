const axios = require('axios');

const REQUEST_TIMEOUT_MS = 25000;

function parseMoney(value) {
  const number = parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

function parseStock(value) {
  const number = parseInt(value, 10);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function normalizeProduct(plan, product) {
  return {
    id: plan.id,
    vendor_product_code: String(plan.id),
    name: `${product.name} - ${plan.name}`,
    price: parseMoney(plan.final_price || plan.sale_price || plan.price),
    stock: parseStock(plan.stock_count)
  };
}

function createShopThanhPhucAdapter(vendor) {
  // Vì API yêu cầu cả API Key và API Secret, ta có thể lưu chúng trong vendor.api_key bằng cách nối với nhau bởi dấu `|`
  // Ví dụ: sk_live_xxx|sk_secret_yyy
  // Hoặc truyền qua thuộc tính riêng nếu database đã được update.
  let apiKey = vendor.api_key || '';
  let apiSecret = vendor.api_secret || '';
  
  if (apiKey.includes('|')) {
    const parts = apiKey.split('|');
    apiKey = parts[0];
    apiSecret = parts[1];
  }

  const baseURL = (vendor.api_url || 'https://shopthanhphuc.online/api/v1').replace(/\/+$/, '');
  
  const client = axios.create({
    baseURL,
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      'X-API-Secret': apiSecret
    }
  });

  return {
    async buy(productCode, quantity, extraData = {}) {
      const planId = Number(productCode);
      const buyQuantity = parseStock(quantity) || 1;
      
      const requestPayload = {
        items: [
          {
            plan_id: planId,
            quantity: buyQuantity,
            fields: extraData.fields || {}
          }
        ],
        coupon_code: extraData.coupon_code || ''
      };
      
      try {
        const response = await client.post('/orders/create', requestPayload);
        const data = response.data;
        const ok = data.success === true;
        
        let deliveryData = null;
        let transId = null;
        if (ok && data.data && data.data.orders && data.data.orders.length > 0) {
           transId = data.data.orders[0].trans_id;
           // Truy vấn trạng thái đơn hàng để lấy dữ liệu giao hàng ngay lập tức
           try {
             const statusRes = await client.get(`/orders/status?trans_id=${transId}`);
             if (statusRes.data.success && statusRes.data.data.delivery) {
                deliveryData = statusRes.data.data.delivery.items;
             }
           } catch (e) {
             // Bỏ qua lỗi nếu query status thất bại
           }
        }

        return {
          success: ok,
          data: deliveryData || (transId ? { trans_id: transId } : null),
          message: data.message || (ok ? 'success' : 'Purchase failed'),
          raw: data,
          httpStatus: response.status,
          requestPayload: {
            method: 'POST',
            endpoint: baseURL + '/orders/create',
            payload: requestPayload
          }
        };
      } catch (error) {
        return {
          success: false,
          data: null,
          message: error.response?.data?.message || error.message,
          raw: error.response?.data || null,
          httpStatus: error.response?.status || 500,
          requestPayload: {
            method: 'POST',
            endpoint: baseURL + '/orders/create'
          }
        };
      }
    },

    async getBalance() {
      try {
        const response = await client.get('/account/balance');
        const data = response.data;
        const ok = data.success === true;

        return {
          success: ok,
          data: ok && data.data && data.data.balance ? parseMoney(data.data.balance.current) : 0,
          message: data.message || (ok ? 'success' : 'Balance lookup failed'),
          raw: data,
          httpStatus: response.status,
          requestPayload: {
            method: 'GET',
            endpoint: baseURL + '/account/balance'
          }
        };
      } catch (error) {
         return {
          success: false,
          data: 0,
          message: error.response?.data?.message || error.message,
          raw: error.response?.data || null,
          httpStatus: error.response?.status || 500,
          requestPayload: {
            method: 'GET',
            endpoint: baseURL + '/account/balance'
          }
        };
      }
    },

    async getList() {
      try {
        // Có thể lặp qua nhiều page nếu cần thiết, ở đây lấy danh sách mặc định
        const response = await client.get('/products/list?limit=100');
        const data = response.data;
        const ok = data.success === true;
        
        let items = [];
        if (ok && data.data && data.data.products) {
          data.data.products.forEach(product => {
             if (product.plans) {
               product.plans.forEach(plan => {
                 items.push(normalizeProduct(plan, product));
               });
             }
          });
        }

        return {
          success: ok,
          data: items,
          message: data.message || (ok ? 'success' : 'List lookup failed'),
          raw: data,
          httpStatus: response.status,
          requestPayload: {
            method: 'GET',
            endpoint: baseURL + '/products/list'
          }
        };
      } catch (error) {
        return {
          success: false,
          data: [],
          message: error.response?.data?.message || error.message,
          raw: error.response?.data || null,
          httpStatus: error.response?.status || 500,
          requestPayload: {
            method: 'GET',
            endpoint: baseURL + '/products/list'
          }
        };
      }
    }
  };
}

module.exports = createShopThanhPhucAdapter;
