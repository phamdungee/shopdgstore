const supabase = require('../config/supabase');

async function run() {
  try {
    const { data, error } = await supabase.rpc('refund_store_order_with_balance', {
      p_order_id: '106b594b-f63b-4925-9ae3-0d337d0fe9f3', // UUID
      p_refund_reason: 'test refund',
      p_refund_transaction_code: 'REFTEST123'
    });
    console.log('REFUND OUTPUT:', data);
    console.log('REFUND ERROR:', error);
  } catch (err) {
    console.error('Call failed:', err);
  }
}

run();
