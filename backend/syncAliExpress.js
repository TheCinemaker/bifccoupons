const buffer = require('buffer');
if (!buffer.SlowBuffer) {
  buffer.SlowBuffer = buffer.Buffer;
}
const axios = require('axios');
const crypto = require('crypto');

const ALIEXPRESS_APP_KEY = process.env.ALIEXPRESS_APP_KEY || '33230606';
const ALIEXPRESS_APP_SECRET = process.env.ALIEXPRESS_APP_SECRET || '7dfd39dca1a996cf0d9504446aa5c93e';
const ALIEXPRESS_TRACKING_ID = process.env.ALIEXPRESS_TRACKING_ID || 'TheCinemaker';

// Az AliExpress kereső végpontja nem tud raktárra szűrni, a "LocalStock" promóciók
// viszont eleve csak az adott EU-országban raktáron lévő termékeket tartalmazzák.
const EU_LOCAL_STOCK_PROMOS = [
  { promo: 'AEB_ES_LocalStock_PlatformOperation_20240926', warehouse: 'ES (EU raktár)' },
  { promo: 'AEB_DE_LocalStock_PlatformOperation_20241023', warehouse: 'DE (EU raktár)' },
  { promo: 'AEB_FR_LocalStock_PlatformOperation_20240926', warehouse: 'FR (EU raktár)' },
  { promo: 'AEB_Poland_LocalStock_PlatformOperation_20241028', warehouse: 'PL (EU raktár)' }
];

const PAGE_SIZE = 50;          // az API ennél többet nem ad vissza egy lapon
const MAX_PER_PROMO = 250;     // raktáranként ennyi terméknél állunk meg

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

  const res = await axios.post('https://api-sg.aliexpress.com/sync', new URLSearchParams(params).toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    timeout: 30000
  });
  return res.data;
}

function extractProducts(res) {
  const wrapper = res && res.aliexpress_affiliate_featuredpromo_products_get_response;
  const result = wrapper && wrapper.resp_result && wrapper.resp_result.result;
  if (!result || !result.products || !Array.isArray(result.products.product)) return [];
  return result.products.product;
}

async function fetchPromoProducts(promo, warehouse) {
  const collected = [];
  let page = 1;

  while (collected.length < MAX_PER_PROMO) {
    let res;
    try {
      res = await callAliExpressApi('aliexpress.affiliate.featuredpromo.products.get', {
        tracking_id: ALIEXPRESS_TRACKING_ID,
        promotion_name: promo,
        target_currency: 'EUR',
        target_language: 'EN',
        country: 'HU',
        page_no: String(page),
        page_size: String(PAGE_SIZE)
      });
    } catch (err) {
      console.warn(`   AliExpress API hiba (${promo}, ${page}. lap): ${err.message}`);
      break;
    }

    const products = extractProducts(res);
    if (products.length === 0) break;

    collected.push(...products.map(p => ({ product: p, warehouse })));
    page++;
  }

  console.log(`   ${warehouse}: ${collected.length} termék`);
  return collected.slice(0, MAX_PER_PROMO);
}

function toRow(product, warehouse, updateTime) {
  const price = product.target_sale_price
    ? `${product.target_sale_price} ${product.target_sale_price_currency || 'EUR'}`
    : '';

  return {
    image: product.product_main_image_url || '',
    name: product.product_title || 'AliExpress Akció',
    link: product.promotion_link || product.product_detail_url || '',
    price: price,
    code: product.discount ? `Kedvezmény ${product.discount}` : 'Automatikus kedvezmény',
    warehouse: warehouse,
    endTime: product.evaluate_rate ? `Értékelés: ${product.evaluate_rate}` : '',
    updateTime: updateTime,
    shortlink: product.promotion_link || product.product_detail_url || '',
    source: 'ALIEXPRESSAPI'
  };
}

async function fetchAliExpressDeals() {
  console.log('AliExpress EU-raktáras ajánlatok lekérése...');
  const updateTime = new Date().toISOString().replace('T', ' ').substring(0, 16);
  const seen = new Set();
  const rows = [];

  for (const { promo, warehouse } of EU_LOCAL_STOCK_PROMOS) {
    const items = await fetchPromoProducts(promo, warehouse);

    for (const { product, warehouse: wh } of items) {
      const id = String(product.product_id);
      if (seen.has(id)) continue;

      const row = toRow(product, wh, updateTime);
      // A kép, a név és a link nélküli sor használhatatlan a poszthoz.
      if (!row.image || !row.name || !row.link) continue;

      seen.add(id);
      rows.push(row);
    }
  }

  console.log(`Összesen ${rows.length} db EU-raktáras AliExpress ajánlat.`);
  return rows;
}

const { writeRowsToSheet } = require('./googleSheetsRest');

async function syncToGoogleSheet(coupons) {
  console.log(`Google Sheets lap frissítése: [ALIEXPRESSAPI] (${coupons.length} db ajánlat)...`);
  const headers = ['image', 'name', 'link', 'price', 'code', 'warehouse', 'endTime', 'updateTime', 'shortlink'];
  await writeRowsToSheet('ALIEXPRESSAPI', headers, coupons);
  console.log('[OK] Google Sheet (ALIEXPRESSAPI) sikeresen frissítve!');
}

async function main() {
  try {
    const deals = await fetchAliExpressDeals();
    if (deals.length === 0) {
      throw new Error('Az AliExpress API egyetlen EU-raktáras ajánlatot sem adott vissza.');
    }
    await syncToGoogleSheet(deals);
  } catch (err) {
    console.error('AliExpress szinkronizációs hiba:', err.message);
    process.exitCode = 1;
  }
}

main();
