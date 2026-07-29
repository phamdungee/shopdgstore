const supabase = require('../config/supabase');

async function run() {
  try {
    const { data, error } = await supabase.from('support_tickets').select('*').limit(1);
    if (error) {
      console.log('support_tickets lookup error:', error.message, error.code);
    } else {
      console.log('support_tickets schema success! First row or empty:', data);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
