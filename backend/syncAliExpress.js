const axios = require('axios');
const crypto = require('crypto');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { GoogleAuth } = require('google-auth-library');
const path = require('path');
const fs = require('fs');

const SPREADSHEET_ID = '1qw3IXBpWlRx-ZFSueFaiPfA44lpMd1b5-MhnSIRwzMc';
const ALIEXPRESS_APP_KEY = process.env.ALIEXPRESS_APP_KEY || '33230606';
const ALIEXPRESS_APP_SECRET = process.env.ALIEXPRESS_APP_SECRET || '7dfd39dca1a996cf0d9504446aa5c93e';
const ALIEXPRESS_TRACKING_ID = process.env.ALIEXPRESS_TRACKING_ID || 'TheCinemaker';
const CREDENTIALS_PATH = path.join(__dirname, 'config', 'credentials.json');

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
  console.log('AliExpress meleg ajánlatok és kuponos termékek lekérése...');
  let deals = [];

  // 1. Hot Products query
  const hotRes = await callAliExpressApi('aliexpress.affiliate.hotproducts.get', {
    tracking_id: ALIEXPRESS_TRACKING_ID,
    target_currency: 'EUR',
    target_language: 'EN',
    page_no: '1',
    page_size: '50'
  });

  if (hotRes && hotRes.aliexpress_affiliate_hotproducts_get_response && hotRes.aliexpress_affiliate_hotproducts_get_response.resp_result) {
    const result = hotRes.aliexpress_affiliate_hotproducts_get_response.resp_result.result;
    if (result && result.products && Array.isArray(result.products.product)) {
      const items = result.products.product.map(p => ({
        image: p.product_main_image_url || '',
        name: p.product_title || 'AliExpress Akció',
        link: p.promotion_link || p.product_detail_url || '',
        price: p.target_sale_price || p.target_original_price || '0',
        code: p.discount_code || 'Automatikus kedvezmény',
        warehouse: p.ship_to_days ? `EU Raktár (${p.ship_to_days} nap)` : 'EU / CN Raktár',
        endTime: p.evaluate_rate || '',
        updateTime: new Date().toISOString().replace('T', ' ').substring(0, 16),
        shortlink: p.promotion_link || '',
        source: 'AliExpress ALL'
      }));
      deals = deals.concat(items);
    }
  }

  console.log(`Összesen ${deals.length} db AliExpress ajánlat lekérve.`);
  return deals;
}

async function syncToGoogleSheet(coupons) {
  const authOptions = { scopes: ['https://www.googleapis.com/auth/spreadsheets'] };
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  } else if (fs.existsSync(CREDENTIALS_PATH)) {
    authOptions.keyFile = CREDENTIALS_PATH;
  } else {
    console.warn('Figyelem: Google credentials nem található. Csak lekérés teszt fut.');
    return;
  }

  const auth = new GoogleAuth(authOptions);
  const client = await auth.getClient();
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID, client);

  await doc.loadInfo();
  let sheet = doc.sheetsByTitle['AliExpress ALL'] || doc.sheetsByTitle['AliExpress'];

  if (!sheet) {
    sheet = await doc.addSheet({ title: 'AliExpress ALL' });
  }

  console.log(`Google Sheets lap frissítése: [${sheet.title}]...`);
  await sheet.clear();
  await sheet.setHeaderRow([
    'image', 'name', 'link', 'price', 'code', 'warehouse', 'endTime', 'updateTime', 'shortlink'
  ]);

  const rows = coupons.map(c => ({
    'image': c.image,
    'name': c.name,
    'link': c.link,
    'price': c.price,
    'code': c.code,
    'warehouse': c.warehouse,
    'endTime': c.endTime,
    'updateTime': c.updateTime,
    'shortlink': c.shortlink
  }));

  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await sheet.addRows(chunk);
    console.log(`Hozzáadva ${i + chunk.length} / ${rows.length} sor...`);
  }

  console.log('[OK] Google Sheet sikeresen frissítve az AliExpress ALL kuponokkal!');
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
