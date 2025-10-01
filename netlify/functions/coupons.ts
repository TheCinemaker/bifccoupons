import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import { google } from "googleapis";

/* ============== Típus ============== */
type Deal = {
  id: string;
  src: "sheets";
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

/* ============== ENV ============== */
const { SPREADSHEET_ID, GOOGLE_APPLICATION_CREDENTIALS_JSON } = process.env;

/* ============== Cache ============== */
let SHEETS_CACHE: { items: Deal[]; ts: number } | null = null;
const SHEETS_TTL_MS = 5 * 60 * 1000;

/* ============== Utils ============== */
function etagOf(json: string) {
  return crypto.createHash("md5").update(json).digest("hex");
}
function sanitizeCreds(json: string) {
  const creds = JSON.parse(json);
  if (typeof creds.private_key === "string" && creds.private_key.includes("\\n")) {
    creds.private_key = creds.private_key.replace(/\\n/g, "\n");
  }
  return creds;
}
function normalizeUrl(u?: string): string | undefined {
  if (!u) return undefined;
  try {
    const s = String(u).trim();
    if (!/^https?:\/\//i.test(s)) return undefined;
    return encodeURI(s.replace(/^http:/i, "https:"));
  } catch {
    return undefined;
  }
}
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
  if (parts.length > 2) {
    const dec = parts.pop();
    s = parts.join("") + "." + dec;
  }
  const num = parseFloat(s);
  return Number.isFinite(num) ? num : undefined;
}
function toISO(d?: string | number | Date): string | undefined {
  if (!d) return undefined;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? undefined : dt.toISOString();
}
function scoreDeal(d: Deal): number {
  let score = 0;
  if ((d.wh || "").toUpperCase() !== "CN") score += 10; // EU boost
  if (d.end) {
    const days = Math.max(0, (new Date(d.end).getTime() - Date.now()) / 86400000);
    score += 10 - Math.min(10, days);
  }
  return score;
}
function dedupe(items: Deal[]): Deal[] {
  const seen = new Set<string>();
  const out: Deal[] = [];
  for (const d of items) {
    const key = crypto.createHash("md5").update(`${d.url}|${d.code || ""}`).digest("hex");
    if (!seen.has(key)) { seen.add(key); out.push(d); }
  }
  return out;
}

/* ============== Sheets olvasó ============== */
/** Elfogadott munkalap-nevek (kisbetű + szóköz nélkül összevetve) */
const WANTED_NORMALIZED = new Set([
  "banggood",
  "banggoodunique",
  "bgunique",           // ha így hívod
  "geekbuyingunique",
]);

function normalizeTitle(t: string) {
  return t.toLowerCase().replace(/\s+/g, "");
}

/** Oszlopok: A image, B name, D link, G price, H code, J wh, M end, N updated */
async function fetchSheetsDeals(): Promise<Deal[]> {
  if (!SPREADSHEET_ID || !GOOGLE_APPLICATION_CREDENTIALS_JSON) return [];
  if (SHEETS_CACHE && Date.now() - SHEETS_CACHE.ts < SHEETS_TTL_MS) return SHEETS_CACHE.items;

  const creds = sanitizeCreds(GOOGLE_APPLICATION_CREDENTIALS_JSON!);
  const jwt = new google.auth.JWT(
    creds.client_email,
    undefined,
    creds.private_key,
    ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  );
  await jwt.authorize();
  const sheets = google.sheets({ version: "v4", auth: jwt });

  // 1) Munkalapok listázása
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID! });
  const titles = (meta.data.sheets || [])
    .map(s => s.properties?.title || "")
    .filter(Boolean)
    .filter(t => WANTED_NORMALIZED.has(normalizeTitle(t)));

  const out: Deal[] = [];

  // 2) Csak a kiválasztott lapokat kérjük le (A:N), nyers értékekkel
  for (const t of titles) {
    const range = `'${t.replace(/'/g, "''")}'!A:N`;
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID!,
      range,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    });

    const rows = resp.data.values || [];
    if (rows.length < 2) continue; // fejléc + legalább 1 adat

    // rögzített indexek a te táblád szerint
    const I = {
      image: 0,  // A
      name: 1,   // B
      link: 3,   // D
      price: 6,  // G
      code: 7,   // H
      wh: 9,     // J
      end: 12,   // M
      upd: 13,   // N
    };

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const title = row[I.name];
      const link  = row[I.link];
      if (!title || !link) continue;

      // Kép: csak akkor állítjuk be, ha tényleg URL van az A oszlopban
      const img0 = row[I.image];
      const image = normalizeUrl(img0);

      const deal: Deal = {
        id: `sheets:${crypto.createHash("md5").update(`${t}|${link}|${row[I.code] || ""}`).digest("hex")}`,
        src: "sheets",
        title: String(title),
        url: normalizeUrl(String(link)) || String(link),
        image: image,                         // ha nincs URL, ez undefined marad → a frontend "no picture"-t mutat
        price: parseMoney(row[I.price]),
        orig: undefined,                      // az E/F oszlopban nálad "no data" – kihagyjuk
        cur: "USD",                           // Banggood/Geekbuying kuponár USD
        code: row[I.code] ? String(row[I.code]) : undefined,
        wh: row[I.wh] ? String(row[I.wh]) : undefined,
        start: undefined,
        end: row[I.end] ? toISO(row[I.end]) : undefined,
        updated: row[I.upd] ? toISO(row[I.upd]) : undefined,
        tags: [],
      };

      out.push(deal);
    }
  }

  const items = dedupe(out);
  SHEETS_CACHE = { items, ts: Date.now() };
  return items;
}

/* ============== Handler ============== */
let LAST_JSON = "";
let LAST_ETAG = "";

export const handler: Handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const ifNoneMatch = event.headers["if-none-match"];
    const limit = Math.max(1, Math.min(200, parseInt(qs.get("limit") || "100", 10)));
    const cursor = qs.get("cursor");
    const q = (qs.get("q") || "").toLowerCase();
    const whFilter = (qs.get("wh") || "").toUpperCase();
    const minPrice = qs.get("minPrice") ? Number(qs.get("minPrice")) : undefined;
    const maxPrice = qs.get("maxPrice") ? Number(qs.get("maxPrice")) : undefined;

    // Csak a három lapból dolgozunk
    let all = await fetchSheetsDeals();

    // Szűrések
    if (q) {
      all = all.filter(d =>
        d.title.toLowerCase().includes(q) ||
        (d.code || "").toLowerCase().includes(q)
      );
    }
    if (whFilter) {
      all = all.filter(d =>
        (d.wh || "").toUpperCase() === whFilter ||
        (whFilter === "EU" && (d.wh || "").toUpperCase() !== "CN")
      );
    }
    if (typeof minPrice === "number") all = all.filter(d => (d.price ?? Infinity) >= minPrice);
    if (typeof maxPrice === "number") all = all.filter(d => (d.price ?? 0) <= maxPrice);

    // Rangsorolás, lapozás
    const scored = all.map(d => ({ d, score: scoreDeal(d) }))
      .sort((a, b) => b.score - a.score)
      .map(x => x.d);

    const start = cursor ? parseInt(cursor, 10) || 0 : 0;
    const page = scored.slice(start, start + limit);
    const nextCursor = start + limit < scored.length ? String(start + limit) : null;

    const payload = { count: scored.length, items: page, nextCursor, updatedAt: new Date().toISOString() };
    const json = JSON.stringify(payload);
    const etg = etagOf(json);

    if (ifNoneMatch && ifNoneMatch === etg) {
      return { statusCode: 304, headers: { ETag: etg, "Cache-Control": "public, max-age=600, stale-while-revalidate=60" }, body: "" };
    }

    LAST_JSON = json;
    LAST_ETAG = etg;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=600, stale-while-revalidate=60", "ETag": etg },
      body: json,
    };
  } catch (e: any) {
    if (LAST_JSON) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60", "ETag": LAST_ETAG, "X-Fallback": "snapshot" },
        body: LAST_JSON,
      };
    }
    return { statusCode: 500, body: JSON.stringify({ error: e?.message || "Server error" }) };
  }
};
