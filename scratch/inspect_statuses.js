const supabase = require('../config/supabase');

async function run() {
  try {
    const { data: trans } = await supabase.from('wallet_transactions').select('status').limit(10);
    console.log('Wallet transaction statuses:', trans);
  } catch (err) {
    console.error(err);
  }
}

run();
