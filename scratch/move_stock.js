const supabase = require('../config/supabase');

async function run() {
  const oldProductId = 'a42f89c8-6ccb-4f48-ac70-463cb11c5f9e'; // shopee-new-user-account
  const oldVariantId = 23;

  const newProductId = '6b0fa50a-fff3-461a-9c72-e244b7d5eb00';
  const newVariantId = 44;

  try {
    console.log('1. Renaming old duplicate product...');
    const { error: pErr } = await supabase
      .from('products')
      .update({ name: '[ĐÃ ẨN] acc shopee có mã người mới' })
      .eq('id', oldProductId);
    if (pErr) throw pErr;
    console.log('Renamed product successfully!');

    console.log('2. Renaming old duplicate variant...');
    const { error: vErr } = await supabase
      .from('product_variants')
      .update({ name: '[ĐÃ ẨN] Acc Shopee Mới' })
      .eq('id', oldVariantId);
    if (vErr) throw vErr;
    console.log('Renamed variant successfully!');

    console.log('3. Moving inventory batches...');
    const { error: bErr } = await supabase
      .from('inventory_batches')
      .update({
        product_id: newProductId,
        variant_id: newVariantId
      })
      .eq('product_id', oldProductId)
      .eq('variant_id', oldVariantId);
    if (bErr) throw bErr;
    console.log('Moved inventory batches successfully!');

    console.log('Rename and migration completed!');
  } catch (err) {
    console.error('Failed:', err);
  }
}

run();
