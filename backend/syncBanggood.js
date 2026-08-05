const buffer = require('buffer');
if (!buffer.SlowBuffer) {
  buffer.SlowBuffer = buffer.Buffer;
}
const axios = require('axios');
const md5 = require('md5');

const BANGGOOD_API_KEY = process.env.BANGGOOD_API_KEY || 'aff6045d0060d22';
const BANGGOOD_API_SECRET = process.env.BANGGOOD_API_SECRET || '5fe2c9cb4d772b915d3e300fd0e5d0e9';

// A /product/detail végpont kuponokként külön hívást igényel, ezért kötegelve kérjük le.
const DETAIL_CONCURRENCY = 8;
const DETAIL_RETRIES = 2;

function createSignature(params) {
  const sortedKeys = Object.keys(params).sort();
  const sortedParams = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
  return md5(sortedParams);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// A Banggood app-onként EGYETLEN élő tokent tart nyilván: amint új tokent kérünk,
// a korábbi azonnal érvénytelen lesz. Ezért a tokent megosztva tartjuk, és 401
// esetén egyszerre csak egy új kérés indul (különben egymást ütnék ki).
let cachedToken = null;
let pendingToken = null;

async function requestAccessToken() {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = Math.random().toString(36).substring(7);
  const params = {
    api_key: BANGGOOD_API_KEY,
    noncestr: nonce,
    timestamp: timestamp,
    api_secret: BANGGOOD_API_SECRET
  };
  const signature = createSignature(params);

  const res = await axios.get('https://affapi.banggood.com/getAccessToken', {
    params: {
      api_key: BANGGOOD_API_KEY,
      noncestr: nonce,
      timestamp: timestamp,
      signature: signature
    },
    timeout: 20000
  });

  if (res.data && res.data.result && res.data.result.access_token) {
    return res.data.result.access_token;
  }
  throw new Error('Nincs access_token a válaszban: ' + JSON.stringify(res.data));
}

async function getAccessToken() {
  if (cachedToken) return cachedToken;
  if (!pendingToken) {
    pendingToken = requestAccessToken()
      .then(token => {
        cachedToken = token;
        pendingToken = null;
        console.log('[OK] Banggood Access Token sikeresen lekérve');
        return token;
      })
      .catch(err => {
        pendingToken = null;
        throw err;
      });
  }
  return pendingToken;
}

function invalidateToken(usedToken) {
  if (cachedToken === usedToken) cachedToken = null;
}

// A 401 HTTP 200-as válasz törzsében érkezik, ezért a body kódját is nézni kell.
async function banggoodGet(endpoint, params, attempts = 4) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const token = await getAccessToken();
    try {
      const res = await axios.get(`https://affapi.banggood.com${endpoint}`, {
        headers: { 'access-token': token },
        params,
        timeout: 20000
      });

      if (res.data && res.data.code === 401) {
        invalidateToken(token);
        lastError = new Error(res.data.msg || 'access-token was expired');
        await sleep(300 * attempt);
        continue;
      }
      return res.data;
    } catch (err) {
      lastError = err;
      await sleep(500 * attempt);
    }
  }

  throw lastError || new Error(`Sikertelen Banggood hívás: ${endpoint}`);
}

async function fetchAllBanggoodCoupons() {
  let allCoupons = [];
  let currentPage = 1;
  let totalPages = 1;

  while (currentPage <= totalPages) {
    const data = await banggoodGet('/coupon/list', { type: 2, page: currentPage });

    if (!data || !data.result || !Array.isArray(data.result.coupon_list)) {
      throw new Error(`Váratlan válasz a ${currentPage}. kuponoldalon: ${JSON.stringify(data)}`);
    }

    allCoupons = allCoupons.concat(data.result.coupon_list);
    totalPages = data.result.page_total || 1;
    if (currentPage === 1) console.log(`Banggood kuponok lekérése: ${totalPages} oldal...`);
    currentPage++;
  }

  console.log(`Összesen ${allCoupons.length} db Banggood kupon lekérve.`);
  return allCoupons;
}

async function fetchProductDetail(productId) {
  try {
    const data = await banggoodGet('/product/detail', { product_id: productId }, DETAIL_RETRIES + 2);
    if (data && data.code === 200 && data.result) return data.result;
    return null;
  } catch (err) {
    console.warn(`Termékadat hiba (${productId}):`, err.message);
    return null;
  }
}

// A kuponok között sok az azonos termék, ezért termék-ID-nként csak egyszer kérdezünk.
async function fetchProductDetails(productIds) {
  const details = new Map();
  console.log(`Termékadatok (kép, név, ár) lekérése ${productIds.length} egyedi termékre...`);

  for (let i = 0; i < productIds.length; i += DETAIL_CONCURRENCY) {
    const batch = productIds.slice(i, i + DETAIL_CONCURRENCY);
    const results = await Promise.all(batch.map(id => fetchProductDetail(id)));
    batch.forEach((id, idx) => {
      if (results[idx]) details.set(String(id), results[idx]);
    });

    const done = Math.min(i + DETAIL_CONCURRENCY, productIds.length);
    if (done % 160 === 0 || done === productIds.length) {
      console.log(`   ${done}/${productIds.length} termék kész (${details.size} sikeres)`);
    }
  }

  return details;
}

function productImage(detail) {
  if (!detail) return '';
  return detail.list_grid_image || detail.small_image || detail.view_image || '';
}

// A termék raktáranként más áron megy, ezért a kupon raktárához tartozó árat keressük.
function warehouseSalePrice(detail, warehouse) {
  if (!detail || !Array.isArray(detail.warehouse_list) || detail.warehouse_list.length === 0) return null;
  const match = detail.warehouse_list.find(w => w.warehouse === warehouse) || detail.warehouse_list[0];
  const price = parseFloat(match.sale_price);
  return isNaN(price) ? null : price;
}

// discount_type=2 -> a kupon fix végára; discount_type=1 -> százalékos kedvezmény a raktári árból.
function couponPrice(coupon, detail) {
  const salePrice = warehouseSalePrice(detail, coupon.warehouse);

  if (String(coupon.discount_type) === '2') {
    return coupon.discount || coupon.condition || (salePrice !== null ? salePrice.toFixed(2) : '');
  }

  const percent = parseFloat(String(coupon.discount).replace(/[^0-9.]/g, ''));
  if (salePrice !== null && !isNaN(percent) && percent > 0 && percent < 100) {
    return (salePrice * (1 - percent / 100)).toFixed(2);
  }
  return salePrice !== null ? salePrice.toFixed(2) : '';
}

// Ha nincs termékadat, a linkből olvassuk ki a nevet (a régi megoldás).
function nameFromLink(coupon) {
  if (!coupon.promo_link_standard) return coupon.only_for || 'Banggood Akció';
  const slug = coupon.promo_link_standard.split('/').slice(-1)[0].split('-').join(' ');
  return slug.replace(/\?.*$/g, '').replace(/!.*$/g, '');
}

function buildRows(coupons, details) {
  const updateTime = new Date().toISOString().replace('T', ' ').substring(0, 16);

  return coupons.map(c => {
    const detail = details.get(String(c.only_for));
    return {
      image: productImage(detail),
      name: (detail && detail.product_name) || nameFromLink(c),
      link: c.promo_link_standard || '',
      price: couponPrice(c, detail),
      code: c.coupon_code || '',
      warehouse: c.warehouse || '',
      endTime: c.coupon_date_end || '',
      updateTime: updateTime,
      shortlink: c.promo_link_short || c.promo_link_standard || '',
      source: 'BANGGOODAPI'
    };
  });
}

const { writeRowsToSheet } = require('./googleSheetsRest');

async function syncToGoogleSheet(coupons) {
  console.log(`Google Sheets lap frissítése: [BANGGOODAPI] (${coupons.length} db kupon)...`);
  const headers = ['image', 'name', 'link', 'price', 'code', 'warehouse', 'endTime', 'updateTime', 'shortlink'];
  await writeRowsToSheet('BANGGOODAPI', headers, coupons);
  console.log('[OK] Google Sheet (BANGGOODAPI) sikeresen frissítve!');
}

async function main() {
  try {
    const coupons = await fetchAllBanggoodCoupons();
    if (coupons.length === 0) {
      throw new Error('A Banggood API egyetlen kupont sem adott vissza.');
    }

    const productIds = [...new Set(
      coupons.map(c => c.only_for).filter(id => /^[0-9]+$/.test(String(id)))
    )];
    const details = await fetchProductDetails(productIds);

    const rows = buildRows(coupons, details);
    const withImage = rows.filter(r => r.image).length;
    const coverage = withImage / rows.length;
    console.log(`Kép ${withImage}/${rows.length} sorhoz (${Math.round(coverage * 100)}%).`);

    // Hibás futás ne írja felül a táblában lévő jó adatokat hiányos sorokkal.
    if (coverage < 0.5) {
      throw new Error(`Túl kevés termékadat jött le (${Math.round(coverage * 100)}%), a tábla frissítése kimarad.`);
    }

    await syncToGoogleSheet(rows);
  } catch (err) {
    console.error('Napi Banggood szinkronizációs hiba:', err.message);
    process.exitCode = 1;
  }
}

main();
