const { useVendorAdapter } = require('./index');

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function firstValue(...values) {
  return values.find(value => value !== undefined && value !== null && String(value).trim() !== '');
}

function normalizeDeliveryData(value) {
  if (Array.isArray(value)) return value.map(item => String(item)).join('\n');
  if (value && typeof value === 'object') {
    const direct = firstValue(value.accounts, value.account, value.keys, value.key, value.data, value.result);
    if (direct !== undefined) return normalizeDeliveryData(direct);
    return JSON.stringify(value, null, 2);
  }
  return String(value || '').trim();
}

function failure(message, code, details = {}) {
  return {
    ok: false,
    code,
    message,
    responseData: details
  };
}

async function writeApiLog({ supabase, orderId, vendorId = null, requestPayload = null, responseData = null, httpStatus = null, success = false, errorMessage = null }) {
  if (!supabase || !orderId) return;

  try {
    await supabase
      .from('api_logs')
      .insert({
        store_order_id: orderId,
        vendor_id: vendorId,
        request_payload: requestPayload,
        response_data: responseData,
        http_status: httpStatus,
        success,
        error_message: errorMessage
      });
  } catch (err) {
    console.error('API log write warning:', err.message);
  }
}

async function localStockAdapter({ supabase, productSlug, variantName, quantity }) {
  try {
    const { data, error } = await supabase
      .from('product_stocks')
      .select('id, account_data')
      .eq('product_slug', productSlug)
      .eq('variant_name', variantName)
      .eq('is_sold', false)
      .limit(quantity);

    if (error) {
      return failure('Không đọc được kho nội bộ', 'LOCAL_STOCK_QUERY_FAILED', { error: error.message });
    }

    if (!data || data.length < quantity) {
      return failure('Kho nội bộ không đủ hàng', 'LOCAL_STOCK_OUT_OF_STOCK', {
        available: Array.isArray(data) ? data.length : 0,
        requested: quantity
      });
    }

    const delivery = data.map(item => item.account_data).join('\n');
    return {
      ok: true,
      vendor: 'local_stock',
      stockIds: data.map(item => item.id),
      deliveryText: `Cảm ơn bạn đã mua hàng! Dưới đây là tài khoản/key của bạn:\n\n${delivery}`,
      responseData: {
        source: 'local_stock',
        items: data.map(item => ({ id: item.id, account_data: item.account_data }))
      }
    };
  } catch (err) {
    return failure('Không đọc được kho nội bộ', 'LOCAL_STOCK_EXCEPTION', { error: err.message });
  }
}

function vendorConfig(product, variant) {
  const vendorId = firstValue(variant.vendor_id, product.vendor_id, variant.vendor, product.vendor);
  const envPrefix = vendorId ? `VENDOR_${normalizeKey(vendorId)}` : '';

  return {
    vendorId: vendorId || 'default_provider',
    apiUrl: firstValue(
      variant.vendor_api_url,
      product.vendor_api_url,
      envPrefix && process.env[`${envPrefix}_API_URL`],
      process.env.PROVIDER_API_URL
    ),
    apiKey: firstValue(
      variant.vendor_api_key,
      product.vendor_api_key,
      envPrefix && process.env[`${envPrefix}_API_KEY`],
      process.env.PROVIDER_API_KEY
    ),
    productCode: firstValue(
      variant.vendor_product_code,
      product.vendor_product_code,
      variant.provider_service_id,
      product.provider_service_id
    )
  };
}

async function loadVendorConfig({ supabase, product, variant }) {
  const config = vendorConfig(product, variant);
  const numericVendorId = Number(config.vendorId);

  if (!supabase || !Number.isFinite(numericVendorId) || numericVendorId <= 0) {
    return { config, vendorRecord: null };
  }

  try {
    const { data: vendor, error } = await supabase
      .from('vendors')
      .select('id, name, api_url, api_key, cached_balance, low_balance_threshold, status, adapter_key, metadata')
      .eq('id', numericVendorId)
      .maybeSingle();

    if (error) {
      return { config, vendorRecord: null, error };
    }

    if (!vendor) {
      return { config, vendorRecord: null };
    }

    config.vendorDbId = vendor.id;
    config.vendorName = vendor.name;
    config.apiUrl = firstValue(variant.vendor_api_url, product.vendor_api_url, vendor.api_url, config.apiUrl);
    config.apiKey = firstValue(variant.vendor_api_key, product.vendor_api_key, vendor.api_key, config.apiKey);
    config.status = vendor.status;
    config.adapterKey = vendor.adapter_key;

    return {
      config,
      vendorRecord: {
        ...vendor,
        api_url: config.apiUrl,
        api_key: config.apiKey
      }
    };
  } catch (error) {
    return { config, vendorRecord: null, error };
  }
}

async function apiVendorAdapter({ supabase, product, variant, quantity, orderCode, orderId }) {
  const { config, vendorRecord, error: vendorLookupError } = await loadVendorConfig({ supabase, product, variant });

  if (!config.productCode) {
    return failure('Vendor product code is missing', 'VENDOR_PRODUCT_CODE_MISSING', {
      vendorId: config.vendorId
    });
  }

  if (vendorLookupError) {
    return failure('Vendor lookup failed', 'VENDOR_LOOKUP_FAILED', {
      vendorId: config.vendorId,
      error: vendorLookupError.message
    });
  }

  if (!vendorRecord) {
    return failure('Vendor record not found', 'VENDOR_NOT_FOUND', {
      vendorId: config.vendorId
    });
  }

  const requestPayload = {
    action: 'buy',
    vendor_id: vendorRecord.id,
    adapter_key: vendorRecord.adapter_key,
    product_code: config.productCode,
    quantity,
    order_code: orderCode
  };

  try {
    const adapter = useVendorAdapter(vendorRecord);
    const result = await adapter.buy(config.productCode, quantity);
    const delivery = normalizeDeliveryData(result.data);
    const logPayload = result.requestPayload || requestPayload;

    if (!result.success || !delivery) {
      await writeApiLog({
        supabase,
        orderId,
        vendorId: vendorRecord.id,
        requestPayload: logPayload,
        responseData: result.raw || result,
        httpStatus: result.httpStatus || null,
        success: false,
        errorMessage: result.message || 'Vendor returned failed payload'
      });

      return failure('Vendor purchase failed or out of stock', 'VENDOR_PURCHASE_FAILED', {
        vendorId: vendorRecord.id,
        adapterKey: vendorRecord.adapter_key,
        response: result.raw || result
      });
    }

    await writeApiLog({
      supabase,
      orderId,
      vendorId: vendorRecord.id,
      requestPayload: logPayload,
      responseData: result.raw || result,
      httpStatus: result.httpStatus || null,
      success: true
    });

    return {
      ok: true,
      vendor: vendorRecord.name || vendorRecord.adapter_key || String(vendorRecord.id),
      deliveryText: delivery,
      responseData: {
        source: 'vendor_api',
        vendorId: vendorRecord.id,
        adapterKey: vendorRecord.adapter_key,
        productCode: config.productCode,
        response: result.raw || result
      }
    };
  } catch (error) {
    await writeApiLog({
      supabase,
      orderId,
      vendorId: vendorRecord ? vendorRecord.id : null,
      requestPayload,
      responseData: error.response && error.response.data ? error.response.data : null,
      httpStatus: error.response && error.response.status ? error.response.status : null,
      success: false,
      errorMessage: error.message
    });

    return failure('Vendor API request failed', 'VENDOR_TIMEOUT_OR_NETWORK_ERROR', {
      vendorId: vendorRecord ? vendorRecord.id : config.vendorId,
      adapterKey: vendorRecord ? vendorRecord.adapter_key : null,
      error: error.message,
      response: error.response && error.response.data
    });
  }
}

async function fulfillOrder(context) {
  const localResult = await localStockAdapter(context);
  if (localResult.ok) return localResult;

  const apiResult = await apiVendorAdapter(context);
  if (apiResult.ok) return apiResult;

  return {
    ...apiResult,
    fallback: localResult
  };
}

module.exports = {
  fulfillOrder
};
