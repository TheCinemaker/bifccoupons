const https = require('https');
const fs = require('fs');
const path = require('path');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "6082362477:AAFOKlAuwIeziUT-aj2sj5kbvGErJjUsrEA";
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID || "-1001268818190";
const SPREADSHEET_ID     = process.env.SPREADSHEET_ID || "1qw3IXBpWlRx-ZFSueFaiPfA44lpMd1b5-MhnSIRwzMc";

const SHEET_NAMES = [
  "BG Unique",
  "BG Unique HUN",
  "BANGGOODAPI",
  "ALIEXPRESSAPI",
  "Geekbuying",
  "Geekbuying Unique"
];

const MAX_POSTS_PER_RUN = 5;
const SLEEP_MS = 3000;
const POSTED_CACHE_FILE = path.join(__dirname, 'posted_deals.json');

function loadPostedCache() {
  if (fs.existsSync(POSTED_CACHE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(POSTED_CACHE_FILE, 'utf8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

function savePostedCache(cache) {
  fs.writeFileSync(POSTED_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

function fetchSheetData(sheetName) {
  return new Promise((resolve, reject) => {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonString = data.substring(data.indexOf('{'), data.lastIndexOf('}') + 1);
          const json = JSON.parse(jsonString);
          if (!json.table || !json.table.rows) return resolve([]);
          const cols = json.table.cols || [];
          const is9ColSchema = sheetName === "BANGGOODAPI" || sheetName === "ALIEXPRESSAPI" || cols.length === 9;

          const imgIdx       = 0;
          const nameIdx      = 1;
          const linkIdx      = is9ColSchema ? 2 : 3;
          const priceIdx     = is9ColSchema ? 3 : 6;
          const codeIdx      = is9ColSchema ? 4 : 7;
          const warehouseIdx = is9ColSchema ? 5 : 9;

          const getCellStr = (cell) => {
            if (!cell) return '';
            if (cell.f !== undefined && cell.f !== null) return String(cell.f).trim();
            if (cell.v !== undefined && cell.v !== null) return String(cell.v).trim();
            return '';
          };

          const items = json.table.rows.map(row => {
            const c = row.c || [];
            return {
              image: getCellStr(c[imgIdx]),
              name: getCellStr(c[nameIdx]),
              link: getCellStr(c[linkIdx]),
              price: formatPrice(getCellStr(c[priceIdx])),
              code: getCellStr(c[codeIdx]),
              warehouse: getCellStr(c[warehouseIdx]),
              source: sheetName
            };
          }).filter(item => item.name && item.link);

          resolve(items);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

function formatPrice(rawPrice) {
  if (!rawPrice) return "Lásd a linken";
  let str = String(rawPrice).trim().replace(/\s*Ft\s*$/gi, "").trim();
  if (/EUR|USD|\$|€|GBP|£/i.test(str)) {
    return str;
  }
  let numStr = str.replace(",", ".");
  let num = parseFloat(numStr);
  if (!isNaN(num)) {
    str = (num % 1 === 0) ? String(Math.round(num)) : num.toFixed(2);
    return `${str} USD`;
  }
  return str;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sendTelegramMessage(item) {
  return new Promise((resolve, reject) => {
    const codeText = item.code ? `<code>${escapeHtml(item.code)}</code> <i>(koppintásra másolható)</i>` : "<i>Automatikus kedvezmény</i>";
    const caption = `<b>KINABOLVEDDMEG AKCIÓ</b>\n\n` +
                    `<b>Termék:</b> ${escapeHtml(item.name)}\n` +
                    `<b>Akciós Ár:</b> ${escapeHtml(item.price)}\n` +
                    `<b>Kuponkód:</b> ${codeText}\n` +
                    `<b>Raktár:</b> ${escapeHtml(item.warehouse || "EU Raktár")}\n` +
                    `<b>Bolt:</b> ${escapeHtml(item.source)}`;

    const replyMarkup = {
      inline_keyboard: [
        [{ text: "Vásárlás / Irány a Bolt", url: item.link }],
        [{ text: "KINABOLVEDDMEG Összes Kupon", url: "https://bifccoupons.netlify.app" }]
      ]
    };

    const isPhoto = item.image && (item.image.startsWith('http://') || item.image.startsWith('https://'));
    const endpoint = isPhoto ? '/sendPhoto' : '/sendMessage';
    const payload = isPhoto ? {
      chat_id: TELEGRAM_CHAT_ID,
      photo: item.image.replace('http://', 'https://'),
      caption: caption,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    } : {
      chat_id: TELEGRAM_CHAT_ID,
      text: caption,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    };

    const postData = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}${endpoint}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        try {
          const resJson = JSON.parse(responseBody);
          if (resJson.ok) {
            resolve(true);
          } else {
            console.error('Telegram API Hiba:', responseBody);
            resolve(false);
          }
        } catch (e) {
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.error('HTTP Hiba:', err.message);
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
}

async function run() {
  console.log("KINABOLVEDDMEG Telegram Bot indítása...");
  const cache = loadPostedCache();
  let postedCount = 0;
  const MAX_POSTS_PER_SHEET = 1;

  for (const sheetName of SHEET_NAMES) {
    if (postedCount >= MAX_POSTS_PER_RUN) break;
    let sheetPosted = 0;

    try {
      const items = await fetchSheetData(sheetName);
      for (const item of items) {
        if (postedCount >= MAX_POSTS_PER_RUN) break;
        if (sheetPosted >= MAX_POSTS_PER_SHEET) break;

        const dealId = `${item.link}|${item.code || ''}`;
        if (cache[dealId]) continue; // Már posztolva

        console.log(`[Posztolás] ${sheetName}: ${item.name.substring(0, 50)} (${item.price})`);
        const ok = await sendTelegramMessage(item);
        if (ok) {
          cache[dealId] = new Date().toISOString();
          postedCount++;
          sheetPosted++;
          savePostedCache(cache);
          await new Promise(r => setTimeout(r, SLEEP_MS));
        }
      }
    } catch (err) {
      console.error(`Hiba a ${sheetName} felolvasásakor:`, err.message);
    }
  }

  console.log(`Befejezve. Kiküldött posztok száma: ${postedCount}`);
}

run();
