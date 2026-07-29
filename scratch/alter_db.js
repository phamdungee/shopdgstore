const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // 1. Try to update a product to see the exact error
  const { data: products } = await supabase.from('products').select('id').limit(1);
  if (products && products.length > 0) {
    const prodId = products[0].id;
    console.log('Attempting to update product', prodId, 'with data_format...');
    const { error } = await supabase
      .from('products')
      .update({ data_format: 'mail|pass' })
      .eq('id', prodId);
    
    if (error) {
      console.log('Update Error:', error.message, 'Code:', error.code);
    } else {
      console.log('Update Success! data_format column already exists.');
      return;
    }
  }

  // 2. Try to run raw sql through common RPC names if they exist
  const alterSql = `ALTER TABLE products ADD COLUMN IF NOT EXISTS data_format text DEFAULT 'mail|pass';`;
  console.log('Attempting to execute SQL via RPC...');
  
  const rpcNames = ['exec_sql', 'run_sql', 'execute_sql', 'sql'];
  for (const rpcName of rpcNames) {
    try {
      const { data, error } = await supabase.rpc(rpcName, { sql: alterSql, query: alterSql });
      if (!error) {
        console.log(`Success executing via RPC: ${rpcName}`);
        return;
      } else {
        console.log(`RPC ${rpcName} returned error:`, error.message);
      }
    } catch (e) {
      console.log(`RPC ${rpcName} failed:`, e.message);
    }
  }
}

run();
