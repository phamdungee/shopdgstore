const supabase = require('../config/supabase');

async function run() {
  try {
    const { data: events, error: eErr } = await supabase
      .from('order_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    if (eErr) throw eErr;
    console.log('LATEST ORDER EVENTS:');
    console.log(JSON.stringify(events, null, 2));

    const { data: failedOrders, error: oErr } = await supabase
      .from('store_orders')
      .select('*')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(5);
    if (oErr) throw oErr;
    console.log('LATEST FAILED ORDERS:');
    console.log(JSON.stringify(failedOrders, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
