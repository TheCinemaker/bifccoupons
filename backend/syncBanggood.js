const axios = require('axios');
const md5 = require('md5');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { GoogleAuth } = require('google-auth-library');
const path = require('path');
const fs = require('fs');

const SPREADSHEET_ID = '1qw3IXBpWlRx-ZFSueFaiPfA44lpMd1b5-MhnSIRwzMc';
const BANGGOOD_API_KEY = process.env.BANGGOOD_API_KEY || 'aff6045d0060d22';
const BANGGOOD_API_SECRET = process.env.BANGGOOD_API_SECRET || '5fe2c9cb4d772b915d3e300fd0e5d0e9';
const CREDENTIALS_PATH = path.join(__dirname, 'config', 'credentials.json');

function createSignature(params) {
  const sortedKeys = Object.keys(params).sort();
  const sortedParams = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
  return md5(sortedParams);
}

async function getAccessToken() {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = Math.random().toString(36).substring(7);
  const params = {
    api_key: BANGGOOD_API_KEY,
    noncestr: nonce,
    timestamp: timestamp,
    api_secret: BANGGOOD_API_SECRET
  };
  const signature = createSignature(params);

  try {
    const res = await axios.get('https://affapi.banggood.com/getAccessToken', {
      params: {
        api_key: BANGGOOD_API_KEY,
        noncestr: nonce,
        timestamp: timestamp,
        signature: signature
      }
    });

    if (res.data && res.data.result && res.data.result.access_token) {
      console.log('[OK] Banggood Access Token sikeresen lekérve');
      return res.data.result.access_token;
    } else {
      throw new Error('Nincs access_token a válaszban: ' + JSON.stringify(res.data));
    }
  } catch (err) {
    console.error('Hiba az Access Token lekérésekor:', err.message);
    throw err;
  }
}

async function fetchAllBanggoodCoupons() {
  const accessToken = await getAccessToken();
  let allCoupons = [];
  let currentPage = 1;
  let totalPages = 1;

  while (currentPage <= totalPages) {
    console.log(`Banggood kuponok lekérése - Oldal: ${currentPage}...`);
    const res = await axios.get('https://affapi.banggood.com/coupon/list', {
      headers: { 'access-token': accessToken },
      params: { type: 2, page: currentPage }
    });

    if (res.data && res.data.result && Array.isArray(res.data.result.coupon_list)) {
      const formatted = res.data.result.coupon_list.map(c => {
        let name = c.promo_link_standard ? c.promo_link_standard.split('/').slice(-1)[0].split('-').join(' ') : (c.only_for || 'Banggood Akció');
        name = name.replace(/\?.*$/g, '').replace(/!.*$/g, '');

        return {
          image: c.coupon_img || '',
          name: name,
          link: c.promo_link_standard || '',
          price: c.condition || '0',
          code: c.coupon_code || '',
          warehouse: c.warehouse || '',
          endTime: c.coupon_date_end || '',
          updateTime: new Date().toISOString().replace('T', ' ').substring(0, 16),
          shortlink: c.promo_link_short || c.promo_link_standard || '',
          source: 'BG ALL Coupons'
        };
      });

      allCoupons = allCoupons.concat(formatted);
      totalPages = res.data.result.page_total || 1;
      currentPage++;
    } else {
      console.warn('Váratlan API válasz:', res.data);
      break;
    }
  }

  console.log(`Összesen ${allCoupons.length} db Banggood kupon lekérve.`);
  return allCoupons;
}

async function syncToGoogleSheet(coupons) {
  const authOptions = { scopes: ['https://www.googleapis.com/auth/spreadsheets'] };
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  } else if (fs.existsSync(CREDENTIALS_PATH)) {
    authOptions.keyFile = CREDENTIALS_PATH;
  }

  const auth = new GoogleAuth(authOptions);
  const client = await auth.getClient();
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID, client);

  await doc.loadInfo();
  let sheet = doc.sheetsByTitle['BG ALL Coupons'] || doc.sheetsByTitle['Banggood'];

  if (!sheet) {
    sheet = await doc.addSheet({ title: 'BG ALL Coupons' });
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

  // Batch insert sorok
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await sheet.addRows(chunk);
    console.log(`Hozzáadva ${i + chunk.length} / ${rows.length} sor...`);
  }

  console.log('[OK] Google Sheet sikeresen frissítve a 9 oszlopos sémával rendelkező Banggood kuponokkal!');
}

async function main() {
  try {
    const coupons = await fetchAllBanggoodCoupons();
    if (coupons.length > 0) {
      await syncToGoogleSheet(coupons);
    }
  } catch (err) {
    console.error('Napi Banggood szinkronizációs hiba:', err.message);
  }
}

main();
