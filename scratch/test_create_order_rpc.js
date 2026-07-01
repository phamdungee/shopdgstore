const supabase = require('../config/supabase');

async function run() {
  try {
    const { data: user } = await supabase.from('users').select('id').limit(1).single();
    if (!user) {
      console.log('No user found');
      return;
    }

    const { data, error } = await supabase.rpc('create_store_order_with_balance', {
      p_user_id: user.id,
      p_product_slug: 'netflix-premium-ultrahd-4k',
      p_product_name: 'Netflix Premium UltraHD 4K',
      p_variant_name: '1 tuần',
      p_quantity: 1,
      p_unit_price: 15000,
      p_total_price: 15000,
      p_cost_amount: 0,
      p_profit: 15000,
      p_idempotency_key: 'test-idempotency-' + Date.now(),
      p_order_code: 'DGTEST' + Math.floor(Math.random() * 10000),
      p_buy_transaction_code: 'BUYTEST' + Math.floor(Math.random() * 10000)
    });
    
    console.log('RPC OUTPUT:', data);
    console.log('RPC ERROR:', error);
  } catch (err) {
    console.error('Call failed:', err);
  }
}

run();
