const createCloneNpaAdapter = require('../fulfillment/clonenpaAdapter');
const vendor = {
  id: 2,
  name: "clonenpa",
  api_url: "https://www.clonenpa.com",
  api_key: "4bec20214487855da45a99273b2d84e82GjJX5qFH3Kfwz0nQyvATZUctiWdkbV1",
  status: "active",
  adapter_key: "clonenpa"
};

const adapter = createCloneNpaAdapter(vendor);

async function test() {
  console.log("Calling getBalance...");
  try {
    const bal = await adapter.getBalance();
    console.log("getBalance result:", JSON.stringify(bal, null, 2));
  } catch (err) {
    console.error("getBalance error:", err);
  }

  console.log("Calling getList...");
  try {
    const list = await adapter.getList();
    console.log("getList result success:", list.success, "length:", list.data?.length);
    if (!list.success) {
      console.log("getList error message:", list.message);
      console.log("getList raw response:", JSON.stringify(list.raw));
    }
  } catch (err) {
    console.error("getList error:", err);
  }
}

test();
