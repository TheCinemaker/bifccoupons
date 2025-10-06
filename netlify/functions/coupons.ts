import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import { google } from "googleapis";

/* ====== Types ====== */
type Deal = {
  id: string;
  src: "sheets";
  store: "Banggood" | "Geekbuying";
  title: string;
  url: string;
  image?: string;
  price?: number;
  orig?: number;
  cur?: string;
  code?: string;
  wh?: string;
  start?: string;
  end?: string;
  updated?: string;
  tags?: string[];
};

/* ====== Sheets: pontos tartományok, első 200 sor ====== */
const SHEET_RANGES = [
  "'BG Unique'!A1:N200",
  "'BG Unique HUN'!A1:N200",
  "'Geekbuying Unique'!A1:N200",
  "'Geekbuying'!A1:N200",
] as const;

/* ====== ENV ====== */
const { SPREADSHEET_ID, GOOGLE_APPLICATION_CREDENTIALS_JSON } = process.env;

/* ====== Utils ====== */
const md5 = (s: string) => crypto.createHash("md5").update(s).digest("hex");
const etagOf = (json: string) => md5(json);

function parseMoney(v: any): number | undefined {
  if (v == null) return undefined;
  let s = String(v).trim();
  if (!s) return undefined;
  s = s.replace(/\u00A0/g, " ").replace(/\s+/g, "");
  const hasComma = s.includes(","), hasDot = s.includes(".");
  if (hasComma && !hasDot) s = s.replace(",", ".");
  else if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  }
  s = s.replace(/[^\d.]/g, "");
  const parts = s.split(".");
  if (parts.length > 2) { const dec = parts.pop(); s = parts.join("") + "." + dec; }
  const num = parseFloat(s);
  return Number.isFinite(num) ? num : undefined;
}
function toISO(d?: string | number | Date) {
  if (!d) return undefined;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? undefined : dt.toISOString();
}
function extractSheetName(range: string): string {
  const m = range.match(/'(.+?)'!/);
  return m?.[1] || "Unknown";
}
function mapSheetToStore(name: string): Deal["store"] {
  return /geek/i.test(name) ? "Geekbuying" : "Banggood";
}
function stableDedupe(items: Deal[]): Deal[] {
  const seen = new Set<string>();
  const out: Deal[] = [];
  for (const d of items) {
    const key = `${d.url}|${d.code || ""}`;
    if (!seen.has(key)) { seen.add(key); out.push(d); }
  }
  return out;
}
function pickImage(raw: any): string | undefined {
  if (!raw) return undefined;
  let s = String(raw).trim();
  if (!s) return undefined;
  // =IMAGE("...") formula támogatás
  const m = s.match(/image\s*\(\s*["']([^"']+)["']/i);
  if (m?.[1]) s = m[1];
  if (s.startsWith("//")) s = "https:" + s;
  if (s.startsWith("http:")) s = s.replace(/^http:/i, "https:");
  try { return encodeURI(s); } catch { return s; }
}

/* ====== Google Sheets fetch (TOP 200, TOP-DOWN, minden lap) ====== */
async function fetchSheetsTop200(): Promise<Deal[]> {
  if (!SPREADSHEET_ID || !GOOGLE_APPLICATION_CREDENTIALS_JSON) return [];

  const creds = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS_JSON);
  const privateKey = (creds.private_key || "").replace(/\\n/g, "\n");
  const jwt = new google.auth.JWT(
    creds.client_email,
    undefined,
    privateKey,
    ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  );
  const sheets = google.sheets({ version: "v4", auth: jwt });

  const resp = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SPREADSHEET_ID,
    ranges: SHEET_RANGES as unknown as string[],
  });

  const out: Deal[] = [];
  for (const vr of resp.data.valueRanges || []) {
    const sheetName = extractSheetName(vr.range || "");
    const store = mapSheetToStore(sheetName);

    const rows = vr.values || [];
    if (rows.length < 2) continue; // nincs adat

    // A:0 Image, B:1 Product name, C:2 ProductID, D:3 Link, E:4 Orig, F:5 Disc,
    // G:6 Coupon price, H:7 Coupon code, I:8 Qty, J:9 Warehouse, K:10 Categories,
    // L:11 Start time, M:12 End time, N:13 Update time

    // FONTOS: a 2. sortól lefelé → TOP-DOWN
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;

      const image = pickImage(row[0]);
      const title = row[1] ? String(row[1]).trim() : "";
      const link  = row[3] ? String(row[3]).trim() : "";

      if (!title || !link) continue;

      out.push({
        id: `sheets:${md5(`${sheetName}|${r}|${link}|${row[7] || ""}`)}`,
        src: "sheets",
        store,
        title,
        url: link,
        image: image || undefined,
        price: parseMoney(row[6]),
        orig: parseMoney(row[4]),
        cur: "USD",
        code: row[7] ? String(row[7]).trim() : undefined,
        wh: row[9] ? String(row[9]).trim() : undefined,
        start: toISO(row[11]),
        end: toISO(row[12]),
        updated: toISO(row[13]),
        tags: (row[10] ? String(row[10]).split(",").map(s => s.trim()).filter(Boolean) : []),
      });
    }
  }
  return stableDedupe(out);
}

/* ====== Handler ====== */
let LAST_JSON = ""; let LAST_ETAG = "";

export const handler: Handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const ifNoneMatch = event.headers["if-none-match"];

    const q = (qs.get("q") || "").toLowerCase().trim();
    const wh = (qs.get("wh") || "").toUpperCase().trim();
    const store = (qs.get("store") || "").trim(); // "Banggood" | "Geekbuying"
    const minPrice = qs.get("minPrice") ? Number(qs.get("minPrice")) : undefined;
    const maxPrice = qs.get("maxPrice") ? Number(qs.get("maxPrice")) : undefined;

    const limit  = Math.max(1, Math.min(200, parseInt(qs.get("limit") || "100", 10)));
    const cursor = qs.get("cursor");
    const start  = cursor ? (parseInt(cursor, 10) || 0) : 0;

    // 1) LEGFELSŐ 200 SOR / LAP, TOP-DOWN (MINDEN LAP)
    const all = await fetchSheetsTop200();

    // --- META a TELJES adathalmazból (lenyílókhoz TELJES lista!) ---
    const metaWarehouses = Array.from(new Set(
      all.map(x => x.wh).filter(Boolean) as string[]
    )).sort((a,b)=>a.localeCompare(b));
    const metaStores: Array<Deal["store"]> = ["Banggood", "Geekbuying"];

    // 2) Front-kompat szűrések – NEM RENDEZÜNK, csak szűrünk
    let items = all;

    if (q) {
      items = items.filter(d =>
        d.title.toLowerCase().includes(q) ||
        (d.code || "").toLowerCase().includes(q) ||
        (d.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    if (wh) items = items.filter(d => (d.wh || "").toUpperCase() === wh);
    if (store) items = items.filter(d => (d.store || "").toLowerCase() === store.toLowerCase());
    if (typeof minPrice === "number") items = items.filter(d => (d.price ?? Infinity) >= minPrice);
    if (typeof maxPrice === "number") items = items.filter(d => (d.price ?? 0) <= maxPrice);

    // 3) Lapozás: TOP-DOWN sorrend marad
    const page = items.slice(start, start + limit);
    const nextCursor = start + limit < items.length ? String(start + limit) : null;

    const payload = {
      count: items.length,
      items: page,
      nextCursor,
      updatedAt: new Date().toISOString(),
      meta: { warehouses: metaWarehouses, stores: metaStores },
    };

    const json = JSON.stringify(payload);
    const etg = etagOf(json);
    if (ifNoneMatch && ifNoneMatch === etg) {
      return { statusCode: 304, headers: { ETag: etg, "Cache-Control": "public, max-age=300, stale-while-revalidate=60" }, body: "" };
    }

    LAST_JSON = json; LAST_ETAG = etg;
    return {
      statusCode: 200,
      headers: {
        "Content-Type":"application/json",
        "Cache-Control":"public, max-age=300, stale-while-revalidate=60",
        "ETag": etg
      },
      body: json,
    };
  } catch (e:any) {
    // Snapshot fallback
    if (LAST_JSON) {
      return {
        statusCode: 200,
        headers: { "Content-Type":"application/json", "Cache-Control":"public, max-age=60", "ETag": LAST_ETAG, "X-Fallback":"snapshot" },
        body: LAST_JSON,
      };
    }
    return { statusCode: 500, body: JSON.stringify({ error: e?.message || "Server error" }) };
  }
};
