const supabase = require('../config/supabase');

async function run() {
  try {
    const { data: product } = await supabase.from('products').select('*').limit(1).single();
    console.log('PRODUCT RECORD:', product);

    const { data: variant } = await supabase.from('product_variants').select('*').limit(1).single();
    console.log('VARIANT RECORD:', variant);
  } catch (err) {
    console.error(err);
  }
}

run();
