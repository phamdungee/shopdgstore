const supabase = require('../config/supabase');
const { useVendorAdapter } = require('../fulfillment');

async function run() {
  const id = 2;
  console.log("Starting mock sync for vendor id 2...");
  try {
    const { data: vendor, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !vendor) {
      console.error("Vendor not found:", error);
      return;
    }

    console.log("Vendor found:", vendor.name);
    const adapter = useVendorAdapter(vendor);
    
    console.log("Step 1: getList...");
    const startTime = Date.now();
    const result = await adapter.getList();
    console.log("getList success:", result.success, "length:", result.data?.length);

    if (!result.success || !Array.isArray(result.data)) {
      console.error("getList failed:", result.message);
      return;
    }

    console.log("Step 2: getBalance...");
    const balanceResult = await adapter.getBalance();
    console.log("getBalance success:", balanceResult.success, "val:", balanceResult.data);
    const balance = balanceResult.success ? balanceResult.data : 0;

    console.log("Step 3: Fetching existing catalogs...");
    const { data: existingCatalogs, error: fetchCatErr } = await supabase
      .from('vendor_catalogs')
      .select('service_code, status')
      .eq('vendor_id', id);
    if (fetchCatErr) throw fetchCatErr;
    console.log("Fetched existing catalogs count:", existingCatalogs?.length);

    const existingMap = new Map((existingCatalogs || []).map(c => [c.service_code, c.status]));
    const syncedServiceCodes = new Set();
    let newCount = 0;
    let updatedCount = 0;
    let disabledCount = 0;

    const catalogsToUpsert = result.data.map(item => {
      const serviceCode = String(item.vendor_product_code || item.id);
      syncedServiceCodes.add(serviceCode);
      const stockQty = Number(item.stock) || 0;
      const status = stockQty === 0 ? 'inactive' : 'active';

      if (!existingMap.has(serviceCode)) {
        newCount++;
      } else {
        updatedCount++;
      }

      return {
        vendor_id: vendor.id,
        service_code: serviceCode,
        service_name: String(item.name || ''),
        price: Number(item.price || 0),
        original_price: Number(item.original_price || item.price || 0),
        stock: stockQty,
        min_quantity: Number(item.min_quantity || 1),
        max_quantity: Number(item.max_quantity || 1),
        category: item.category || null,
        status: status,
        raw_data: item,
        synced_at: new Date().toISOString()
      };
    });

    const catalogsToDeactivate = [];
    for (const [code, status] of existingMap.entries()) {
      if (!syncedServiceCodes.has(code)) {
        if (status !== 'inactive' && status !== 'deleted') {
          catalogsToDeactivate.push({
            vendor_id: vendor.id,
            service_code: code,
            status: 'inactive'
          });
          disabledCount++;
        }
      }
    }

    console.log(`Step 4: Executing batch upserts... Upsert count: ${catalogsToUpsert.length}, Deactivate count: ${catalogsToDeactivate.length}`);
    
    if (catalogsToUpsert.length > 0) {
      console.log("Upserting catalogsToUpsert...");
      const { error: upsertErr } = await supabase
        .from('vendor_catalogs')
        .upsert(catalogsToUpsert, { onConflict: 'vendor_id,service_code' });
      if (upsertErr) throw upsertErr;
      console.log("Upsert catalogsToUpsert successful!");
    }

    if (catalogsToDeactivate.length > 0) {
      console.log("Deactivating catalogsToDeactivate...");
      const { error: deactivateErr } = await supabase
        .from('vendor_catalogs')
        .upsert(catalogsToDeactivate, { onConflict: 'vendor_id,service_code' });
      if (deactivateErr) throw deactivateErr;
      console.log("Deactivate successful!");
    }

    console.log("Step 5: Updating sync success metadata...");
    const latency = Date.now() - startTime;
    const { error: updateVendorErr } = await supabase
      .from('vendors')
      .update({
        sync_status: 'success',
        sync_error: null,
        last_sync_at: new Date().toISOString(),
        // response_time_ms: latency, // Commented out to test
        cached_balance: balance
      })
      .eq('id', id);
    if (updateVendorErr) throw updateVendorErr;

    console.log("Sync completed successfully!");
  } catch (err) {
    console.error("Sync failed with error:", err);
  }
}

run();
