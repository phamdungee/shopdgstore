const axios = require('axios');

async function testKhommoToken() {
  console.log('Testing KhoMMO API with sample Bearer Token...');
  try {
    const res = await axios.get('https://api.khommo.vn/api/partner/v1/me', {
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer brk_test_token_12345'
      }
    });
    console.log('Status Code:', res.status);
    console.log('Response Data:', res.data);
  } catch (err) {
    if (err.response) {
      console.log('API responded with Status Code:', err.response.status);
      console.log('API Response Data:', err.response.data);
    } else {
      console.log('Request Error:', err.message);
    }
  }
}

testKhommoToken();
