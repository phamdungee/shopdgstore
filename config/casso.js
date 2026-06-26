
const axios = require('axios');
const { CASSO_API_KEY } = require('./env');

const cassoClient = axios.create({
  baseURL: 'https://oauth.casso.vn/v2',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Apikey ${CASSO_API_KEY}`
  }
});

module.exports = cassoClient;
