const supabase = require('../config/supabase');

async function run() {
  try {
    const { data: logs, error: lErr } = await supabase
      .from('api_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    console.log('LATEST API LOGS:');
    logs.forEach(log => {
      console.log(`- Time: ${log.created_at}, Status: ${log.http_status}, Success: ${log.success}`);
      console.log(`  Req: ${JSON.stringify(log.request_payload)}`);
      console.log(`  Resp: ${JSON.stringify(log.response_data || log.response_payload || {}).substring(0, 300)}`);
      console.log(`  Err: ${log.error_message}`);
    });

    const { data: events, error: eErr } = await supabase
      .from('order_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    console.log('LATEST ORDER EVENTS:');
    console.log(JSON.stringify(events, null, 2));
  } catch (err) {
    console.error(err);
  }
}

run();
