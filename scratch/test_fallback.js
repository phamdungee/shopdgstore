const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: products } = await supabase.from('products').select('id, name').limit(1);
  if (!products || products.length === 0) {
    console.log('No products found.');
    return;
  }
  const prod = products[0];
  const prodId = prod.id;
  const originalName = prod.name;
  
  console.log(`Original Name: ${originalName}`);
  const updatePayload = { data_format: 'mail|pass', name: `${originalName} (Tested)` };
  
  let result = await supabase
    .from('products')
    .update(updatePayload)
    .eq('id', prodId)
    .select('*')
    .single();

  let updatedProduct = result.data;
  let error = result.error;

  if (error && error.message && error.message.includes('data_format')) {
    console.log('Retry Fallback Triggered successfully! Retrying product update without data_format...');
    delete updatePayload.data_format;
    const retryResult = await supabase
      .from('products')
      .update(updatePayload)
      .eq('id', prodId)
      .select('*')
      .single();
    updatedProduct = retryResult.data;
    error = retryResult.error;
  }

  if (error) {
    console.error('Update Failed:', error.message);
  } else {
    console.log('Update Succeeded with fallback! New Name:', updatedProduct.name);
    // Revert back
    await supabase.from('products').update({ name: originalName }).eq('id', prodId);
    console.log('Reverted back to original name.');
  }
}

run();
