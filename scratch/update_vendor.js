require('dotenv').config();
const supabase = require('../config/supabase');

async function updateVendor() {
  const vendor = {
    name: 'shopthanhphuc',
    api_url: 'https://shopthanhphuc.online/api/v1',
    api_key: 'sk_live_af7cb60194d470fc2ad22f96ae53418f|sk_secret_c4c3433f6f64e45c5a13756233e2bdfdc2f26f8605e4a317c5a5a994a08fa1e4',
    adapter_key: 'shopthanhphuc',
    status: 'active'
  };

  try {
    const { data, error } = await supabase
      .from('vendors')
      .update(vendor)
      .eq('adapter_key', 'shopthanhphuc')
      .select('*');
    if (error) throw error;
    console.log('Update successful:', data);
  } catch (e) {
    console.error('Error:', e);
  }
}

updateVendor();
