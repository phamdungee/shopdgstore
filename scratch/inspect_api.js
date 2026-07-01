const axios = require('axios');
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = require('../config/env');

async function run() {
  try {
    const res = await axios.get(`${SUPABASE_URL}/rest/v1/`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    console.log('SPEC FOR /rpc/create_store_order_with_balance:');
    console.log(JSON.stringify(res.data.paths['/rpc/create_store_order_with_balance'], null, 2));
  } catch (err) {
    console.error('Error fetching spec:', err.message);
  }
}

run();
