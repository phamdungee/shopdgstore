const { useVendorAdapter } = require('./index');
const FormatService = require('../assets/js/formatService');

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

// Inventory content is imported with `raw_text`, which is the exact product
// data supplied by the admin. Use it for customer delivery without adding
// labels, emojis, metadata, or a second "raw data" section.
function originalInventoryData(content) {
  let value = content;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return value;
    }
  }

  if (value && typeof value === 'object') {
    if (typeof value.raw_text === 'string') return value.raw_text;
    if (value.fields && typeof value.fields === 'object') {
      return Object.values(value.fields).map(item => String(item ?? '')).join('|');
    }
  }

  return String(value ?? '').trim();
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

const vendorCircuitBreakers = new Map();

function isCircuitOpen(vendorId) {
  const cb = vendorCircuitBreakers.get(vendorId);
  if (!cb) return false;
  if (cb.disabledUntil && Date.now() < cb.disabledUntil) {
    return true; // Circuit is Open
  }
  return false;
}

function recordVendorSuccess(vendorId) {
  vendorCircuitBreakers.set(vendorId, { failureCount: 0, disabledUntil: null });
}

function recordVendorFailure(vendorId) {
  const cb = vendorCircuitBreakers.get(vendorId) || { failureCount: 0, disabledUntil: null };
  cb.failureCount += 1;
  if (cb.failureCount >= 10) {
    cb.disabledUntil = Date.now() + 120000; // Disable for 2 minutes
    console.warn(`[CircuitBreaker] 🚨 Vendor ${vendorId} triggered circuit breaker (10 failures). Disabled for 120s.`);
  }
  vendorCircuitBreakers.set(vendorId, cb);
}

async function loadSpecificVendorConfig({ supabase, vendorId, vendorProductCode }) {
  const envPrefix = vendorId ? `VENDOR_${normalizeKey(vendorId)}` : '';
  const config = {
    vendorId: vendorId || null,
    apiUrl: envPrefix && process.env[`${envPrefix}_API_URL`],
    apiKey: envPrefix && process.env[`${envPrefix}_API_KEY`],
    productCode: vendorProductCode
  };

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

    if (error || !vendor) {
      return { config, vendorRecord: null, error };
    }

    config.vendorDbId = vendor.id;
    config.vendorName = vendor.name;
    config.apiUrl = vendor.api_url || config.apiUrl;
    config.apiKey = vendor.api_key || config.apiKey;
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

async function apiVendorAdapterWithConfig({ supabase, vendorId, vendorProductCode, quantity, orderCode, orderId }) {
  const { config, vendorRecord, error: vendorLookupError } = await loadSpecificVendorConfig({ supabase, vendorId, vendorProductCode });

  if (!config.productCode) {
    return failure('Vendor product code is missing', 'VENDOR_PRODUCT_CODE_MISSING', { vendorId });
  }

  if (vendorLookupError || !vendorRecord) {
    return failure('Vendor lookup failed', 'VENDOR_LOOKUP_FAILED', { vendorId, error: vendorLookupError?.message });
  }

  const requestPayload = {
    action: 'buy',
    vendor_id: vendorRecord.id,
    adapter_key: vendorRecord.adapter_key,
    product_code: config.productCode,
    quantity,
    order_code: orderCode
  };

  let apiLogId = null;
  
  // 1. Double-ordering prevention: Lock with unique constraint index
  try {
    const { data: insertedLog, error: insertErr } = await supabase
      .from('api_logs')
      .insert({
        store_order_id: orderId,
        vendor_id: vendorRecord.id,
        request_payload: requestPayload,
        status: 'processing',
        success: false
      })
      .select('id')
      .maybeSingle();

    if (insertErr) {
      if (insertErr.code === '23505') { // Unique constraint violation
        console.warn(`[Fulfillment] 🛡️ Duplicate order attempt lock triggered for Order ${orderId} and Vendor ${vendorRecord.id}. Checking previous attempt.`);
        const { data: existingLog } = await supabase
          .from('api_logs')
          .select('*')
          .eq('store_order_id', orderId)
          .eq('vendor_id', vendorRecord.id)
          .maybeSingle();

        if (existingLog) {
          if (existingLog.status === 'success') {
            const delivery = normalizeDeliveryData(existingLog.response_data?.raw || existingLog.response_data);
            return {
              ok: true,
              vendor: vendorRecord.name || vendorRecord.adapter_key || String(vendorRecord.id),
              vendorId: vendorRecord.id,
              apiLogId: existingLog.id,
              responseTime: 0,
              deliveryText: delivery,
              responseData: {
                source: 'vendor_api',
                vendorId: vendorRecord.id,
                adapterKey: vendorRecord.adapter_key,
                productCode: config.productCode,
                response: existingLog.response_data
              }
            };
          } else if (existingLog.status === 'processing') {
            return failure('Cuộc gọi API NCC trùng lặp đang được xử lý.', 'DUPLICATE_API_CALL_IN_PROGRESS', { vendorId: vendorRecord.id });
          }
        }
      }
      throw insertErr;
    }
    if (insertedLog) apiLogId = insertedLog.id;
  } catch (err) {
    console.error('API log insert warning:', err.message);
  }

  try {
    const startTime = Date.now();
    const adapter = useVendorAdapter(vendorRecord);
    const result = await adapter.buy(config.productCode, quantity);
    const responseTime = Date.now() - startTime;
    const delivery = normalizeDeliveryData(result.data);
    const logPayload = result.requestPayload || requestPayload;

    if (!result.success || !delivery) {
      recordVendorFailure(vendorRecord.id);
      
      if (apiLogId) {
        await supabase
          .from('api_logs')
          .update({
            status: 'failed',
            success: false,
            response_data: result.raw || result,
            http_status: result.httpStatus || null,
            error_message: result.message || 'Vendor returned failed payload'
          })
          .eq('id', apiLogId);
      }

      const errMsg = (result.message || '').toLowerCase() + ' ' + JSON.stringify(result.raw || '').toLowerCase();
      const isOutOfStockOrBalance = errMsg.includes('số dư') || 
                                    errMsg.includes('balance') || 
                                    errMsg.includes('hết hàng') || 
                                    errMsg.includes('không đủ số lượng') || 
                                    errMsg.includes('tồn kho') ||
                                    errMsg.includes('stock') ||
                                    errMsg.includes('sản phẩm không đủ');
      
      if (isOutOfStockOrBalance) {
        return failure('Vendor purchase failed: Out of stock or balance', 'VENDOR_PURCHASE_FAILED', {
          vendorId: vendorRecord.id,
          adapterKey: vendorRecord.adapter_key,
          response: result.raw || result,
          responseTime
        });
      }

      return failure(result.message || 'Đối tác không thể xử lý sản phẩm', 'VENDOR_PURCHASE_FAILED', {
        vendorId: vendorRecord.id,
        adapterKey: vendorRecord.adapter_key,
        response: result.raw || result,
        responseTime
      });
    }

    recordVendorSuccess(vendorRecord.id);

    const extOrderId = result.raw?.order || result.raw?.order_id || result.raw?.vendor_order_id || result.raw?.data?.order || result.raw?.data?.order_id || null;

    if (apiLogId) {
      await supabase
        .from('api_logs')
        .update({
          status: 'success',
          success: true,
          response_data: result.raw || result,
          http_status: result.httpStatus || 200,
          external_order_id: extOrderId ? String(extOrderId) : null
        })
        .eq('id', apiLogId);
    }

    return {
      ok: true,
      vendor: vendorRecord.name || vendorRecord.adapter_key || String(vendorRecord.id),
      vendorId: vendorRecord.id,
      apiLogId,
      responseTime,
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
    recordVendorFailure(vendorRecord.id);
    
    if (apiLogId) {
      await supabase
        .from('api_logs')
        .update({
          status: 'failed',
          success: false,
          response_data: error.response?.data || null,
          http_status: error.response?.status || null,
          error_message: error.message
        })
        .eq('id', apiLogId);
    }

    return failure('Vendor API request failed', 'VENDOR_TIMEOUT_OR_NETWORK_ERROR', {
      vendorId: vendorRecord.id,
      adapterKey: vendorRecord.adapter_key,
      error: error.message,
      response: error.response?.data
    });
  }
}

async function reserveInventoryAdapter({ supabase, productId, variantId, quantity, userId, orderId }) {
  try {
    const { data: reservedItems, error } = await supabase
      .rpc('reserve_inventory_items', {
        p_product_id: productId,
        p_variant_id: variantId,
        p_quantity: quantity,
        p_user_id: userId
      });

    if (error) {
      return failure('Lỗi RPC đặt kho', 'INVENTORY_RPC_FAILED', { error: error.message });
    }

    if (!reservedItems || reservedItems.length < quantity) {
      return failure('Kho hàng không đủ số lượng', 'INVENTORY_OUT_OF_STOCK', {
        available: reservedItems ? reservedItems.length : 0,
        requested: quantity
      });
    }

    const itemIds = reservedItems.map(item => item.id);
    const { error: sellErr } = await supabase
      .from('inventory_items')
      .update({
        status: 'sold',
        sold_order_id: orderId,
        sold_at: new Date().toISOString()
      })
      .in('id', itemIds);

    if (sellErr) {
      await supabase
        .from('inventory_items')
        .update({ status: 'available', reserved_by: null, reserved_until: null })
        .in('id', itemIds);
      return failure('Lỗi cập nhật trạng thái kho bán', 'INVENTORY_SELL_UPDATE_FAILED', { error: sellErr.message });
    }

    const deliveryLogs = itemIds.map(itemId => ({
      order_id: orderId,
      inventory_item_id: itemId,
      delivery_method: 'inventory',
      status: 'success'
    }));
    await supabase.from('delivery_logs').insert(deliveryLogs);

    const totalCost = reservedItems.reduce((sum, item) => sum + Number(item.cost_price || 0), 0);

    // Get product's format
    const { data: product } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    const rawFormat = (product && product.data_format) || 'mail|pass';
    const parsedFormat = FormatService.parseDataFormat(rawFormat);

    const formattedItems = reservedItems.map(item => {
      let contentObj = {};
      try {
        contentObj = typeof item.content === 'string' ? JSON.parse(item.content) : item.content;
      } catch (err) {
        contentObj = { raw_text: String(item.content || '') };
      }
      
      // If it is the new structure
      if (contentObj.fields && typeof contentObj.fields === 'object') {
        return {
          serial: item.serial || `INV${item.id}`,
          fields: contentObj.fields,
          extras: contentObj.extras || [],
          raw_text: contentObj.raw_text || ''
        };
      }
      
      // Fallback for old structure
      const fields = {};
      const extras = [];
      const rawText = contentObj.raw_text || '';
      
      if (rawText) {
        const parsedLine = FormatService.parseAccountLine(rawText, rawFormat);
        return {
          serial: item.serial || `INV${item.id}`,
          fields: parsedLine.fields,
          extras: parsedLine.extras,
          raw_text: rawText
        };
      }
      
      parsedFormat.forEach(f => {
        const foundKey = Object.keys(contentObj).find(k => k.toLowerCase() === f.key.toLowerCase());
        fields[f.key] = foundKey ? contentObj[foundKey] : '';
      });
      
      return {
        serial: item.serial || `INV${item.id}`,
        fields,
        extras,
        raw_text: JSON.stringify(contentObj)
      };
    });

    const deliveryText = reservedItems
      .map(item => originalInventoryData(item.content))
      .filter(Boolean)
      .join('\n');

    return {
      ok: true,
      deliveryMethod: 'inventory',
      deliveryText,
      totalCost,
      deliveryJson: {
        source: 'inventory',
        raw_data_format: rawFormat,
        parsed_format: parsedFormat,
        items: formattedItems
      },
      stockIds: itemIds
    };
  } catch (err) {
    return failure('Lỗi xử lý kho nội bộ', 'INVENTORY_EXCEPTION', { error: err.message });
  }
}

async function failoverApiAdapter({ supabase, productId, variantId, quantity, orderCode, orderId, product, variant }) {
  const { data: mappings } = await supabase
    .from('vendor_products')
    .select('vendor_id, vendor_product_code, priority')
    .eq('product_id', productId)
    .eq('variant_id', variantId)
    .eq('enabled', true)
    .order('priority', { ascending: true });

  let attempts = [];

  if (mappings && mappings.length > 0) {
    console.log(`[Fulfillment] Found ${mappings.length} mappings. Executing priority failover routing...`);
    for (const mapping of mappings) {
      const vendorId = mapping.vendor_id;
      const productCode = mapping.vendor_product_code;

      if (isCircuitOpen(vendorId)) {
        console.warn(`[Fulfillment] Skipping Vendor ${vendorId} - Circuit Breaker is OPEN.`);
        attempts.push({ vendorId, success: false, reason: 'circuit_breaker_open' });
        continue;
      }

      console.log(`[Fulfillment] Attempting Vendor ${vendorId} (product_code: ${productCode})...`);
      const apiResult = await apiVendorAdapterWithConfig({
        supabase,
        vendorId,
        vendorProductCode: productCode,
        quantity,
        orderCode,
        orderId
      });

      if (apiResult.ok) {
        await supabase
          .from('delivery_logs')
          .insert({
            order_id: orderId,
            vendor_id: vendorId,
            api_log_id: apiResult.apiLogId,
            delivery_method: 'api',
            status: apiResult.orderStatus === 'processing' ? 'processing' : 'success',
            response_time_ms: apiResult.responseTime
          });

        return {
          ok: true,
          orderStatus: apiResult.orderStatus || 'completed',
          deliveryMethod: 'api',
          deliveryText: apiResult.deliveryText,
          deliveryJson: {
            source: 'api',
            vendor: apiResult.vendor,
            vendorId: apiResult.vendorId,
            response: apiResult.responseData?.response
          },
          vendor: apiResult.vendor,
          responseData: apiResult.responseData
        };
      } else {
        attempts.push({ vendorId, success: false, reason: apiResult.message });
        await supabase
          .from('delivery_logs')
          .insert({
            order_id: orderId,
            vendor_id: vendorId,
            delivery_method: 'api',
            status: 'failed',
            response_time_ms: apiResult.responseData?.responseTime || null
          });
      }
    }
  }

  const config = vendorConfig(product, variant);
  if (!config.productCode || !config.vendorId) {
    return failure('Không tìm thấy nhà cung cấp', 'NO_VENDOR_CONFIGURED', { attempts });
  }

  const numericVendorId = Number(config.vendorId);
  if (numericVendorId > 0) {
    if (isCircuitOpen(numericVendorId)) {
      return failure('Nhà cung cấp chính đang bị khóa tạm thời', 'CIRCUIT_BREAKER_OPEN', { vendorId: numericVendorId });
    }

    const apiResult = await apiVendorAdapterWithConfig({
      supabase,
      vendorId: numericVendorId,
      vendorProductCode: config.productCode,
      quantity,
      orderCode,
      orderId
    });

    if (apiResult.ok) {
      await supabase
        .from('delivery_logs')
        .insert({
          order_id: orderId,
          vendor_id: numericVendorId,
          api_log_id: apiResult.apiLogId,
          delivery_method: 'api',
          status: apiResult.orderStatus === 'processing' ? 'processing' : 'success',
          response_time_ms: apiResult.responseTime
        });

      return {
        ok: true,
        orderStatus: apiResult.orderStatus || 'completed',
        deliveryMethod: 'api',
        deliveryText: apiResult.deliveryText,
        deliveryJson: {
          source: 'api',
          vendor: apiResult.vendor,
          vendorId: apiResult.vendorId,
          response: apiResult.responseData?.response
        },
        vendor: apiResult.vendor,
        responseData: apiResult.responseData
      };
    } else {
      await supabase
        .from('delivery_logs')
        .insert({
          order_id: orderId,
          vendor_id: numericVendorId,
          delivery_method: 'api',
          status: 'failed',
          response_time_ms: apiResult.responseData?.responseTime || null
        });
      attempts.push({ vendorId: numericVendorId, success: false, reason: apiResult.message });
      return {
        ...apiResult,
        attempts
      };
    }
  }

  return failure('Nhà cung cấp không hợp lệ', 'INVALID_VENDOR_CONFIG', { attempts });
}

function vendorConfig(product, variant) {
  const vendorId = firstValue(variant.vendor_id, product.vendor_id, variant.vendor, product.vendor);
  const envPrefix = vendorId ? `VENDOR_${normalizeKey(vendorId)}` : '';

  return {
    vendorId: vendorId || null,
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

async function fulfillOrder(context) {
  const { supabase, product, variant, quantity, orderId, orderCode, user } = context;
  const deliveryType = variant.delivery_type || product.delivery_type || 'hybrid';

  console.log(`[Fulfillment] Fulfilling Order ${orderCode} (Product ID: ${product.id}, Variant ID: ${variant.id}, Delivery Type: ${deliveryType}, Qty: ${quantity})`);

  if (deliveryType === 'inventory') {
    return await reserveInventoryAdapter({
      supabase,
      productId: product.id,
      variantId: variant.id,
      quantity,
      userId: user.id,
      orderId
    });
  }

  if (deliveryType === 'api') {
    return await failoverApiAdapter({
      supabase,
      productId: product.id,
      variantId: variant.id,
      quantity,
      orderCode,
      orderId,
      product,
      variant
    });
  }

  // Hybrid Mode: Try reservation first
  const localResult = await reserveInventoryAdapter({
    supabase,
    productId: product.id,
    variantId: variant.id,
    quantity,
    userId: user.id,
    orderId
  });

  if (localResult.ok) {
    return localResult;
  }

  // Evaluate fallback mode (priority: Variant -> Product -> Default 'api_when_out_of_stock')
  const fallbackMode = variant.fallback_mode || product.fallback_mode || 'api_when_out_of_stock';
  if (fallbackMode === 'fail_when_out_of_stock') {
    console.log(`[Fulfillment] Hybrid Mode: Inventory insufficient and fallback_mode is fail_when_out_of_stock. Rejecting.`);
    return {
      ok: false,
      code: 'INVENTORY_OUT_OF_STOCK',
      message: 'Sản phẩm tạm hết hàng trong kho.',
      fallback: localResult
    };
  }

  console.log(`[Fulfillment] Hybrid Mode: Inventory insufficient. Falling back to API...`);
  const apiResult = await failoverApiAdapter({
    supabase,
    productId: product.id,
    variantId: variant.id,
    quantity,
    orderCode,
    orderId,
    product,
    variant
  });

  if (apiResult.ok) return apiResult;

  return {
    ...apiResult,
    fallback: localResult
  };
}

function resetCircuitBreaker(vendorId) {
  vendorCircuitBreakers.delete(Number(vendorId));
  vendorCircuitBreakers.delete(String(vendorId));
}

module.exports = {
  fulfillOrder,
  resetCircuitBreaker,
  isCircuitOpen
};
