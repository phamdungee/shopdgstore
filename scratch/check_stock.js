const supabase = require('../config/supabase');

async function run() {
  try {
    const id1 = '6b0fa50a-fff3-461a-9c72-e244b7d5eb00'; // shopee
    const id2 = 'a42f89c8-6ccb-4f48-ac70-463cb11c5f9e'; // shopee-new-user-account

    const { count: itemsCount1 } = await supabase.from('inventory_items').select('*', { count: 'exact', head: true }).eq('product_id', id1);
    const { count: itemsCount2 } = await supabase.from('inventory_items').select('*', { count: 'exact', head: true }).eq('product_id', id2);
    
    const { count: ordersCount1 } = await supabase.from('store_orders').select('*', { count: 'exact', head: true }).eq('product_slug', 'shopee');
    const { count: ordersCount2 } = await supabase.from('store_orders').select('*', { count: 'exact', head: true }).eq('product_slug', 'shopee-new-user-account');

    console.log('STATS FOR PRODUCT 1 (shopee):');
    console.log('- Inventory items count:', itemsCount1);
    console.log('- Orders count:', ordersCount1);

    console.log('STATS FOR PRODUCT 2 (shopee-new-user-account):');
    console.log('- Inventory items count:', itemsCount2);
    console.log('- Orders count:', ordersCount2);
  } catch (err) {
    console.error(err);
  }
}

run();
