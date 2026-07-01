const createShopThanhPhucAdapter = require('../fulfillment/shopthanhphucAdapter');

async function test() {
  const vendor = {
    api_url: 'https://shopthanhphuc.online/api/v1',
    api_key: 'sk_live_af7cb60194d470fc2ad22f96ae53418f|sk_secret_c4c3433f6f64e45c5a13756233e2bdfdc2f26f8605e4a317c5a5a994a08fa1e4'
  };

  const adapter = createShopThanhPhucAdapter(vendor);
  
  console.log('Testing getBalance...');
  const balance = await adapter.getBalance();
  console.log('Balance result:', balance.success ? balance.data : balance.message);
}

test();
