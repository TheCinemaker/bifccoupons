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
    try {
      console.log('[OK] GOOGLE_CREDENTIALS_JSON secret betöltése...');
      const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON.trim());
      if (creds && creds.private_key) {
        creds.private_key = creds.private_key.split('\\n').join('\n');
      }
      authOptions.credentials = creds;
    } catch (err) {
      console.error('Hiba a GOOGLE_CREDENTIALS_JSON értelmezésekor:', err.message);
      throw err;
    }
  } else if (fs.existsSync(CREDENTIALS_PATH)) {
    console.log('[OK] Helyi credentials.json betöltése...');
    authOptions.keyFile = CREDENTIALS_PATH;
  } else {
    throw new Error('GOOGLE_CREDENTIALS_JSON secret hiányzik a környezeti változókból / GitHub Secrets-ből!');
  }

  const auth = new GoogleAuth(authOptions);
  const client = await auth.getClient();
  const res = await client.getAccessToken();
  if (!res || !res.token) {
    throw new Error('Nem sikerült Google Access Token-t kérni.');
  }
  return res.token;
}

async function writeRowsToSheet(sheetTitle, headers, rowsData) {
  const token = await getGoogleAccessToken();
  console.log(`[OK] Google Access Token sikeresen lekérve. Frissítés [${sheetTitle}] (${rowsData.length} sor)...`);

  const range = `${sheetTitle}!A1:Z10000`;
  try {
    await axios.post(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}:clear`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (e) {
    console.warn(`Lap ürítési figyelmeztetés (${sheetTitle}):`, e.response ? JSON.stringify(e.response.data) : e.message);
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
