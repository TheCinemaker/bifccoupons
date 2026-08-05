/***** ======================================================================
 * KINABOLVEDDMEG - TELEGRAM AUTOMATA POSZTOLÓ ROBOT (Google Apps Script)
 * ====================================================================== *****/

var TELEGRAM_BOT_TOKEN = "6082362477:AAFOKlAuwIeziUT-aj2sj5kbvGErJjUsrEA";
var TELEGRAM_CHAT_ID   = "-1001268818190";
var SPREADSHEET_ID     = "1qw3IXBpWlRx-ZFSueFaiPfA44lpMd1b5-MhnSIRwzMc";

// Összes aktív Google Sheet lap neve pontosan a táblázat sorrendjében
var SHEET_NAMES = [
  "BANGGOODAPI",
  "ALIEXPRESSAPI",
  "BG Unique HUN",
  "BG Unique",
  "Geekbuying",
  "Geekbuying Unique"
];

/***** ========== BEÁLLÍTÁSOK ========== *****/
var COOLDOWN_DAYS            = 5;     // Hány napig ne posztolja újra ugyanazt a terméket
var MAX_ROWS_PER_SHEET       = 100;   // Lapcsoportonkénti maximális vizsgálati sorok
var SLEEP_BETWEEN_POSTMS     = 5000;  // 5 másodperc anti-spam szünet a posztok között
var MAX_POSTS_PER_RUN        = 6;     // Egy futáskor maximálisan kiküldhető posztok száma
var MAX_POSTS_PER_SHEET      = 1;     // Lapcsoportonként max hány poszt menjen egy futásban (változatosság!)

/***** ========== FŐ FUTTATÓ FÜGGVÉNY ========== *****/
function postwithpicture() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    Logger.log("A script már fut egy másik folyamatban.");
    return;
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const hashSheet = ensureHashSheet(ss);
    let postedCount = 0;

    for (const sheetName of SHEET_NAMES) {
      if (postedCount >= MAX_POSTS_PER_RUN) break;

      const sh = ss.getSheetByName(sheetName);
      if (!sh) {
        Logger.log("Lap nem található: " + sheetName);
        continue;
      }

      const lastRow = sh.getLastRow();
      if (lastRow < 2) continue;

      const lastCol = sh.getLastColumn();
      const is9ColSchema = (sheetName === "BANGGOODAPI" || sheetName === "ALIEXPRESSAPI" || lastCol === 9);
      const maxRow = Math.min(lastRow, MAX_ROWS_PER_SHEET);
      const rowCount = maxRow - 1;
      if (rowCount <= 0) continue;

      const values = sh.getRange(2, 1, rowCount, lastCol).getValues();
      let sheetPostedCount = 0;

      for (const row of values) {
        if (postedCount >= MAX_POSTS_PER_RUN) break;
        if (sheetPostedCount >= MAX_POSTS_PER_SHEET) break;

        // Oszlopok beazonosítása séma alapján (9 oszlopos vs 16 oszlopos)
        const imgIdx       = 0;
        const nameIdx      = 1;
        const linkIdx      = is9ColSchema ? 2 : 3;
        const priceIdx     = is9ColSchema ? 3 : 6; // 16 oszlopos lapoknál a G oszlop (index 6) az ÁR!
        const codeIdx      = is9ColSchema ? 4 : 7; // 16 oszlopos lapoknál a H oszlop (index 7) a KUPON!
        const warehouseIdx = is9ColSchema ? 5 : 9;

        const image     = safe(row[imgIdx]);
        const name      = safe(row[nameIdx]);
        const link      = safe(row[linkIdx]);
        const rawPrice  = safe(row[priceIdx]);
        const code      = safe(row[codeIdx]);
        const warehouse = safe(row[warehouseIdx]);

        if (!name || !link) continue;

        const cleanedLink = sanitizeLink(link);
        const merchant    = detectMerchant(sheetName);

        // Duplikáció szűrés kompozit kulccsal (link + kupon + bolt)
        const key = generateCompositeKey(cleanedLink, code, merchant);
        const existingRow = findHashRowByKey(hashSheet, key);
        const now = new Date();

        if (existingRow) {
          const lastPostedVal = hashSheet.getRange(existingRow, 3).getValue();
          const lastPosted = lastPostedVal ? new Date(lastPostedVal) : new Date(0);
          const daysPassed = (now - lastPosted) / (1000 * 60 * 60 * 24);

          if (daysPassed < COOLDOWN_DAYS) {
            Logger.log(`[SKIP - Cooldown (${daysPassed.toFixed(1)} nap)] ${sheetName}: ${name}`);
            continue; // Ugyanaz a poszt még a cooldown időszakon belül van
          }
          hashSheet.getRange(existingRow, 3).setValue(now);
        } else {
          hashSheet.appendRow([cleanedLink, key, now]);
        }

        // Ár formázása (USD kiegészítés ha hiányzik a valuta)
        const formattedPrice = formatPrice(rawPrice);

        // Telegram poszt elküldése
        const success = sendTelegramPost({
          image,
          name,
          link: cleanedLink,
          price: formattedPrice,
          code,
          warehouse,
          source: merchant
        });

        if (success) {
          postedCount++;
          sheetPostedCount++;
          Logger.log(`[OK] Telegram poszt kiküldve (${postedCount}/${MAX_POSTS_PER_RUN}) [${sheetName}]: ${name}`);
          Utilities.sleep(SLEEP_BETWEEN_POSTMS);
        }
      }
    }

    Logger.log(`Futtatás befejezve. Kiküldött posztok száma: ${postedCount}`);
  } catch (err) {
    Logger.log("Futtatási hiba: " + err.message);
  } finally {
    lock.releaseLock();
  }
}

/***** ========== TELEGRAM ÜZENET FORMÁZÓ ÉS KIKÜLDŐ ========== *****/
function sendTelegramPost(item) {
  const caption = buildPostCaption(item);
  const parseMode = "HTML";

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "Vásárlás / Irány a Bolt", url: item.link }
      ],
      [
        { text: "KINABOLVEDDMEG Összes Kupon", url: "https://bifccoupons.netlify.app" }
      ]
    ]
  };

  try {
    let payload;
    let url;

    if (item.image && (item.image.startsWith("http://") || item.image.startsWith("https://"))) {
      url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
      payload = {
        chat_id: TELEGRAM_CHAT_ID,
        photo: item.image.replace("http://", "https://"),
        caption: caption,
        parse_mode: parseMode,
        reply_markup: JSON.stringify(replyMarkup)
      };
    } else {
      url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      payload = {
        chat_id: TELEGRAM_CHAT_ID,
        text: caption,
        parse_mode: parseMode,
        reply_markup: JSON.stringify(replyMarkup)
      };
    }

    const response = UrlFetchApp.fetch(url, {
      method: "POST",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const resJson = JSON.parse(response.getContentText());
    if (!resJson.ok) {
      Logger.log("Telegram API hiba: " + response.getContentText());
      return false;
    }
    return true;
  } catch (e) {
    Logger.log("Telegram küldési hiba: " + e.message);
    return false;
  }
}

function buildPostCaption(item) {
  const nameEscaped = escapeHtml(item.name);
  const codeText = item.code ? `<code>${escapeHtml(item.code)}</code> <i>(koppintásra másolható)</i>` : "<i>Automatikus kedvezmény</i>";
  const warehouseText = item.warehouse ? escapeHtml(item.warehouse) : "EU Raktár";

  return `<b>KINABOLVEDDMEG AKCIÓ</b>\n\n` +
         `<b>Termék:</b> ${nameEscaped}\n` +
         `<b>Akciós Ár:</b> ${escapeHtml(item.price)}\n` +
         `<b>Kuponkód:</b> ${codeText}\n` +
         `<b>Raktár:</b> ${warehouseText}\n` +
         `<b>Bolt:</b> ${escapeHtml(item.source)}`;
}

/***** ========== ÁR FORMÁZÓ SEGÉDFÜGGVÉNY ========== *****/
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

/***** ========== DUPLIKÁCIÓ ÉS HASH TRACKING ========== *****/
function ensureHashSheet(ss) {
  let sh = ss.getSheetByName("Hash Tracking");
  if (!sh) {
    sh = ss.insertSheet("Hash Tracking");
    sh.appendRow(["Product Link", "Generated Key", "Last Posted"]);
  }
  return sh;
}

function findHashRowByKey(hashSheet, key) {
  const lastRow = hashSheet.getLastRow();
  if (lastRow < 2) return null;
  const vals = hashSheet.getRange(2, 2, lastRow - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) {
    if (vals[i][0] === key) return i + 2;
  }
  return null;
}

function generateCompositeKey(link, code, merchant) {
  const raw = `${link}|${code || ""}|${merchant || ""}`;
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  return Utilities.base64EncodeWebSafe(bytes).substring(0, 24);
}

/***** ========== SEGÉDFÜGGVÉNYEK ========== *****/
function detectMerchant(sheetName) {
  if (/Geek/i.test(sheetName)) return "Geekbuying";
  if (/BG|Banggood/i.test(sheetName)) return "Banggood";
  if (/ALI|AliExpress/i.test(sheetName)) return "AliExpress";
  return sheetName;
}

function sanitizeLink(url) {
  return url ? String(url).trim() : "";
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function safe(val) {
  return (val === null || val === undefined) ? "" : String(val).trim();
}

function post_one_preview() {
  const oldMax = MAX_POSTS_PER_RUN;
  MAX_POSTS_PER_RUN = 1;
  try {
    postwithpicture();
  } finally {
    MAX_POSTS_PER_RUN = oldMax;
  }
}
