const axios = require('axios');
const crypto = require('crypto');

const APP_KEY = '33230606';
const APP_SECRET = '7dfd39dca1a996cf0d9504446aa5c93e';
const TRACKING_ID = 'TheCinemaker';

function signTop(params, secret) {
  const sortedKeys = Object.keys(params).sort();
  let str = secret;
  for (const key of sortedKeys) {
    str += key + params[key];
  }
  str += secret;
  return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
}

async function testMethod(method, extraParams = {}) {
  const ts = String(Date.now());
  const params = {
    app_key: APP_KEY,
    method: method,
    timestamp: ts,
    format: 'json',
    v: '2.0',
    sign_method: 'md5',
    ...extraParams
  };
  params.sign = signTop(params, APP_SECRET);

  try {
    const res = await axios.post('https://api-sg.aliexpress.com/sync', new URLSearchParams(params).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' }
    });
    console.log(`\n=================== ${method} ===================`);
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error(`Error ${method}:`, err.message);
  }
}

async function run() {
  await testMethod('aliexpress.affiliate.product.query', {
    keywords: 'xiaomi',
    tracking_id: TRACKING_ID
  });
  await testMethod('aliexpress.affiliate.featuredpromos.get', {});
}

run();
