const buffer = require('buffer');
if (!buffer.SlowBuffer) {
  buffer.SlowBuffer = buffer.Buffer;
}

const fs = require('fs');
const axios = require('axios');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const SPREADSHEET_ID = '1qw3IXBpWlRx-ZFSueFaiPfA44lpMd1b5-MhnSIRwzMc';
const CREDENTIALS_PATH = path.join(__dirname, 'config', 'credentials.json');

async function getGoogleAccessToken() {
  const authOptions = { scopes: ['https://www.googleapis.com/auth/spreadsheets'] };
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    creds.private_key = creds.private_key ? creds.private_key.replace(/\\n/g, '\n') : '';
    authOptions.credentials = creds;
  } else if (fs.existsSync(CREDENTIALS_PATH)) {
    authOptions.keyFile = CREDENTIALS_PATH;
  } else {
    throw new Error('Google Credentials nem található');
  }

  const auth = new GoogleAuth(authOptions);
  const client = await auth.getClient();
  const res = await client.getAccessToken();
  return res.token;
}

async function writeRowsToSheet(sheetTitle, headers, rowsData) {
  const token = await getGoogleAccessToken();
  console.log(`[OK] Google Access Token lekérve. Frissítés [${sheetTitle}]...`);

  const range = `${sheetTitle}!A1:Z10000`;
  try {
    await axios.post(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}:clear`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (e) {
    console.warn(`Lap ürítési hiba (${sheetTitle}):`, e.response ? JSON.stringify(e.response.data) : e.message);
  }

  const values = [headers, ...rowsData.map(r => [
    r.image || '',
    r.name || '',
    r.link || '',
    r.price || '',
    r.code || '',
    r.warehouse || '',
    r.endTime || '',
    r.updateTime || '',
    r.shortlink || ''
  ])];

  const updateRange = `${sheetTitle}!A1`;
  try {
    const res = await axios.put(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(updateRange)}?valueInputOption=USER_ENTERED`,
      { values },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    console.log(`[OK] ${values.length - 1} sor sikeresen beírva a [${sheetTitle}] lapra!`);
  } catch (e) {
    console.error(`Sor beírási hiba (${sheetTitle}):`, e.response ? JSON.stringify(e.response.data) : e.message);
    throw e;
  }
}

module.exports = { writeRowsToSheet, getGoogleAccessToken };

if (require.main === module) {
  writeRowsToSheet('BANGGOODAPI', ['image', 'name', 'link', 'price', 'code', 'warehouse', 'endTime', 'updateTime', 'shortlink'], [
    { image: 'test.jpg', name: 'Test Product', link: 'https://test.com', price: '100', code: 'TEST', warehouse: 'CZ', endTime: '2026-12-31', updateTime: '2026-08-05', shortlink: 'https://test.com' }
  ]).catch(err => console.error('Hiba:', err.response ? JSON.stringify(err.response.data) : err.message));
}
