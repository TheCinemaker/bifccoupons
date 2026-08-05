const buffer = require('buffer');
if (!buffer.SlowBuffer) {
  buffer.SlowBuffer = buffer.Buffer;
}
const axios = require('axios');
const crypto = require('crypto');

const SPREADSHEET_ID = '1qw3IXBpWlRx-ZFSueFaiPfA44lpMd1b5-MhnSIRwzMc';
const ALIEXPRESS_APP_KEY = process.env.ALIEXPRESS_APP_KEY || '33230606';
const ALIEXPRESS_APP_SECRET = process.env.ALIEXPRESS_APP_SECRET || '7dfd39dca1a996cf0d9504446aa5c93e';
const ALIEXPRESS_TRACKING_ID = process.env.ALIEXPRESS_TRACKING_ID || 'TheCinemaker';

function signTop(params, secret) {
  const sortedKeys = Object.keys(params).sort();
  let str = secret;
  for (const key of sortedKeys) {
    str += key + params[key];
  }
  str += secret;
  return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
}

async function callAliExpressApi(method, extraParams = {}) {
  const ts = String(Date.now());
  const params = {
    app_key: ALIEXPRESS_APP_KEY,
    method: method,
    timestamp: ts,
    format: 'json',
    v: '2.0',
    sign_method: 'md5',
    ...extraParams
  };
  params.sign = signTop(params, ALIEXPRESS_APP_SECRET);

  try {
    const res = await axios.post('https://api-sg.aliexpress.com/sync', new URLSearchParams(params).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' }
    });
    return res.data;
  } catch (err) {
    console.error(`AliExpress API hiba (${method}):`, err.message);
    return null;
  }
}

async function fetchAliExpressDeals() {
  console.log('AliExpress népszerű kuponos termékek lekérése...');
  let deals = [];
  const keywordsList = ['xiaomi', 'blitzwolf', 'baseus', 'lenovo', 'drone', 'projector', 'smartwatch', 'earphone', 'tablet', 'gadget'];

  for (const kw of keywordsList) {
    const res = await callAliExpressApi('aliexpress.affiliate.product.query', {
      tracking_id: ALIEXPRESS_TRACKING_ID,
      keywords: kw,
      target_currency: 'EUR',
      target_language: 'EN',
      page_no: '1',
      page_size: '20'
    });

    if (res && res.aliexpress_affiliate_product_query_response && res.aliexpress_affiliate_product_query_response.resp_result) {
      const result = res.aliexpress_affiliate_product_query_response.resp_result.result;
      if (result && result.products && Array.isArray(result.products.product)) {
        const items = result.products.product.map(p => ({
          image: p.product_main_image_url || '',
          name: p.product_title || 'AliExpress Akció',
          link: p.promotion_link || p.product_detail_url || '',
          price: p.target_sale_price ? `${p.target_sale_price} EUR` : (p.target_original_price ? `${p.target_original_price} EUR` : '0 Ft'),
          code: p.discount ? `Kedvezmény ${p.discount}` : 'Automatikus kedvezmény',
          warehouse: p.second_level_category_name || 'EU / CN Raktár',
          endTime: p.evaluate_rate ? `Értékelés: ${p.evaluate_rate}` : '',
          updateTime: new Date().toISOString().replace('T', ' ').substring(0, 16),
          shortlink: p.promotion_link || '',
          source: 'ALIEXPRESSAPI'
        }));
        deals = deals.concat(items);
      }
    }
  }

  console.log(`Összesen ${deals.length} db AliExpress ajánlat lekérve.`);
  return deals;
}

const { writeRowsToSheet } = require('./googleSheetsRest');

async function syncToGoogleSheet(coupons) {
  console.log(`Google Sheets lap frissítése: [ALIEXPRESSAPI] (${coupons.length} db kupon)...`);
  const headers = ['image', 'name', 'link', 'price', 'code', 'warehouse', 'endTime', 'updateTime', 'shortlink'];
  await writeRowsToSheet('ALIEXPRESSAPI', headers, coupons);
  console.log('[OK] Google Sheet (ALIEXPRESSAPI) sikeresen frissítve!');
}

async function main() {
  try {
    const coupons = await fetchAliExpressDeals();
    if (coupons.length > 0) {
      await syncToGoogleSheet(coupons);
    } else {
      console.log('Nincs feltölthető AliExpress ajánlat.');
    }
  } catch (err) {
    console.error('AliExpress szinkronizációs hiba:', err.message);
  }
}

main();
