const createBotMmoAdapter = require('./botmmoAdapter');
const createClonenpaAdapter = require('./clonenpaAdapter');
const createTramMmoAdapter = require('./trammmoAdapter');
const createShopThanhPhucAdapter = require('./shopthanhphucAdapter');
const createKhommoAdapter = require('./khommoAdapter');

const ADAPTER_REGISTRY = {
  botmmo: createBotMmoAdapter,
  clonenpa: createClonenpaAdapter,
  trammmo: createTramMmoAdapter,
  shopthanhphuc: createShopThanhPhucAdapter,
  khommo: createKhommoAdapter
};

function normalizeAdapterKey(value) {
  return String(value || '').trim().toLowerCase();
}

function assertActiveVendor(vendorRecord) {
  if (!vendorRecord || typeof vendorRecord !== 'object') {
    throw new Error('Vendor adapter cannot be selected: vendor record is missing');
  }

  const status = String(vendorRecord.status || '').trim().toLowerCase();
  if (status && status !== 'active') {
    throw new Error(`Vendor "${vendorRecord.name || vendorRecord.id}" is inactive (status: ${vendorRecord.status})`);
  }

  if (!vendorRecord.api_url) {
    throw new Error(`Vendor "${vendorRecord.name || vendorRecord.id}" is missing api_url`);
  }

  if (!vendorRecord.api_key) {
    throw new Error(`Vendor "${vendorRecord.name || vendorRecord.id}" is missing api_key`);
  }
}

function useVendorAdapter(vendorRecord) {
  assertActiveVendor(vendorRecord);

  const adapterKey = normalizeAdapterKey(vendorRecord.adapter_key);
  const createAdapter = ADAPTER_REGISTRY[adapterKey];

  if (!createAdapter) {
    const availableKeys = Object.keys(ADAPTER_REGISTRY).join(', ');
    throw new Error(`Unsupported vendor adapter_key "${vendorRecord.adapter_key}". Registered adapters: ${availableKeys}`);
  }

  const adapter = createAdapter(vendorRecord);
  const requiredMethods = ['buy', 'getBalance', 'getList'];
  for (const method of requiredMethods) {
    if (typeof adapter[method] !== 'function') {
      throw new Error(`Vendor adapter "${adapterKey}" is missing required method "${method}"`);
    }
  }

  return {
    buy: adapter.buy,
    getBalance: adapter.getBalance,
    getList: adapter.getList
  };
}

module.exports = {
  useVendorAdapter
};
