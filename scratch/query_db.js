const supabase = require('../config/supabase');

async function run() {
  try {
    const { data: vendors, error: vErr } = await supabase.from('vendors').select('id, name, sync_status, sync_error, cached_balance');
    if (vErr) throw vErr;
    console.log('ALL VENDORS STATUS:');
    console.log(JSON.stringify(vendors, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
