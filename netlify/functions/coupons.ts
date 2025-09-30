import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import axios from "axios";
import { google } from "googleapis";

/* ======================== Types ======================== */
type Deal = {
  id: string;
  src: "banggood" | "sheets";
  title: string;
  image?: string;
  url: string;
  short?: string;
  price?: number;
  orig?: number;
  cur?: string;
  code?: string;
  wh?: string;
  start?: string;
  end?: string;
  updated?: string;
  tags?: string[];
  residual?: number;
};

/* ======================== ENV ======================== */
const {
  SPREADSHEET_ID,
  GOOGLE_APPLICATION_CREDENTIALS_JSON,
  BANGGOOD_API_KEY,
  BANGGOOD_API_SECRET,
} = process.env;

/* ======================== In-memory cache ======================== */
let SHEETS_CACHE: { items: Deal[]; ts: number } | null = null;
let BANGGOOD_CACHE: { items: Deal[]; ts: number } | null = null;

const SHEETS_TTL_MS = 5 * 60 * 1000;     // 5 perc
const BANGGOOD_TTL_MS = 10 * 60 * 1000;  // 10 perc

/* ======================== Utils ======================== */
function etagOf(json: string) {
  return crypto.createHash("md5").update(json).digest("hex");
}

// ENV-ben egysorba tett kulcs -> alakítsuk igazi sortörésre
function sanitizeCreds(json: string) {
  const creds = JSON.parse(json);
  if (typeof creds.private_key === "string" && creds.private_key.includes("\\n")) {
    creds.private_key = creds.private_key.replace(/\\n/g, "\n");
  }
  return creds;
}

// =IMAGE("…") vagy =IMAGE('…', …) -> URL | sima http(s) URL változatlanul
function extractImageUrl(raw: any): string | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim();
  const m = s.match(/image\s*\(\s*["']([^"']+)["']/i);
  return m?.[1] || (s.startsWith("http") ? s : undefined);
}

// http->https + encode furcsa karakterekre
function normalizeUrl(u?: string): string | undefined {
  if (!u) return undefined;
  try {
    const https = u.replace(/^http:/, "https:");
    return encodeURI(https);
  } catch { return u; }
}

// Pénz sztring robusztus parse: kezeli a szóközöket, NBSP-t, ,/. tizedest
function parseMoney(v: any): number | undefined {
  if (v === null || v === undefined) return undefined;
  let s = String(v).trim();
  if (!s) return undefined;

  // NBSP és sima szóköz eltávolítás
  s = s.replace(/\u00A0/g, " ").replace(/\s+/g, "");

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && !hasDot) {
    // EU formátum: 1189,99 -> 1189.99
    s = s.replace(",", ".");
  } else if (hasComma && hasDot) {
    // Döntsük el mi a tizedes: ha az utolsó jel , akkor EU: 1.234,56 -> 1234.56
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // US: 1,234.56 -> 1234.56
      s = s.replace(/,/g, "");
    }
  }
  // csak szám + pont maradjon
  s = s.replace(/[^\d.]/g, "");
  // ha több pont maradt, az utolsó legyen tizedes
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

function dedupe(deals: Deal[]): Deal[] {
  const seen = new Set<string>();
  const out: Deal[] = [];
  for (const d of deals) {
    const key = crypto.createHash("md5").update(`${d.src}|${d.url}|${d.code || ""}`).digest("hex");
    if (!seen.has(key)) {
      seen.add(key);
      out.push(d);
    }
  }
  return out;
}

function scoreDeal(d: Deal): number {
  let score = 0;
  if ((d.wh || "").toUpperCase() !== "CN") score += 10; // EU boost
  if (d.end) {
    const days = Math.max(0, (new Date(d.end).getTime() - Date.now()) / 86400000);
    score += (10 - Math.min(10, days)); // közelebbi lejárat → magasabb
  }
  if (d.price && d.orig && d.price < d.orig) {
    const disc = 100 * (1 - d.price / d.orig);
    score += Math.min(8, Math.max(0, disc / 5));
  }
  return score;
}

/* ======================== Banggood adapter ======================== */
function signBanggood(params: Record<string, any>): string {
  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&");
  return crypto.createHash("md5").update(sorted).digest("hex");
}

async function bgGetAccessToken(): Promise<string | null> {
  if (!BANGGOOD_API_KEY || !BANGGOOD_API_SECRET) return null;
  const timestamp = Math.floor(Date.now() / 1000);
  const noncestr = Math.random().toString(36).slice(2);
  const signature = signBanggood({
    api_key: BANGGOOD_API_KEY,
    api_secret: BANGGOOD_API_SECRET,
    noncestr,
    timestamp
  });
  const { data } = await axios.get("https://affapi.banggood.com/getAccessToken", {
    params: { api_key: BANGGOOD_API_KEY, noncestr, timestamp, signature },
    timeout: 8000
  });
  return data?.result?.access_token || null;
}

async function fetchBanggoodDeals(): Promise<Deal[]> {
  if (BANGGOOD_CACHE && Date.now() - BANGGOOD_CACHE.ts < BANGGOOD_TTL_MS) {
    return BANGGOOD_CACHE.items;
  }
  const token = await bgGetAccessToken();
  if (!token) return [];

  let page = 1, pages = 1;
  const all: Deal[] = [];

  while (page <= pages) {
    const { data } = await axios.get("https://affapi.banggood.com/coupon/list", {
      headers: { "access-token": token },
      params: { type: 2, page },
      timeout: 10000
    });
    const res = data?.result;
    const list: any[] = res?.coupon_list || [];
    pages = res?.page_total || page;

    for (const c of list) {
      let name: string =
        (c.promo_link_standard || "").split("/").pop()?.replace(/-/g, " ") ||
        c.only_for || "Banggood deal";
      name = name.replace(/\?.*$/g, "").replace(/!.*$/g, "");

      // Rövid afflink előnyben, különben encode-olt standard – mindkettő https
      const stdRaw: string = c.promo_link_standard || "";
      const shortRaw: string = c.promo_link_short || "";
      const shortHttps = shortRaw ? shortRaw.replace(/^http:/, "https:") : "";
      const safeStd = normalizeUrl(stdRaw) || "";
      const finalUrl = shortHttps || safeStd || "#";

      const deal: Deal = {
        id: `banggood:${crypto.createHash("md5").update(`${c.promo_link_standard || ""}|${c.coupon_code || ""}`).digest("hex")}`,
        src: "banggood",
        title: name,
        image: normalizeUrl(c.coupon_img) || undefined,
        url: finalUrl,
        short: shortHttps || undefined,
        price: parseMoney(c.condition) ?? parseMoney(c.original_price),
        orig: parseMoney(c.original_price),
        cur: c.currency || "USD",
        code: c.coupon_code || undefined,
        wh: c.warehouse || undefined,
        start: toISO(c.coupon_date_start),
        end: toISO(c.coupon_date_end),
        updated: toISO(Date.now()),
        tags: [],
        residual: c.coupon_residual ? Number(c.coupon_residual) : undefined
      };
      all.push(deal);
    }
    page++;
  }
  BANGGOOD_CACHE = { items: all, ts: Date.now() };
  return all;
}

/* ======================== Google Sheets adapter (batchGet + FORMULA + cache) ======================== */
/** Csak ezeket a lapokat húzzuk (gyors) – bővíthető */
const SHEET_RANGES = [
  "'BG Unique'!A:Z",
  "'BG Unique HUN'!A:Z"
];

function findIdx(header: string[], aliases: string[]): number {
  const lower = header.map(h => String(h).trim().toLowerCase());
  for (const a of aliases) {
    const i = lower.indexOf(a.toLowerCase());
    if (i !== -1) return i;
  }
  return -1;
}

async function fetchSheetsDeals(): Promise<Deal[]> {
  if (!SPREADSHEET_ID || !GOOGLE_APPLICATION_CREDENTIALS_JSON) return [];
  if (SHEETS_CACHE && Date.now() - SHEETS_CACHE.ts < SHEETS_TTL_MS) {
    return SHEETS_CACHE.items;
  }

  const creds = sanitizeCreds(GOOGLE_APPLICATION_CREDENTIALS_JSON!);
  const jwt = new google.auth.JWT(
    creds.client_email, undefined, creds.private_key,
    ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  );
  const sheets = google.sheets({ version: "v4", auth: jwt });

  // LÉNYEG: FORMULA módban kérjük, hogy az Image oszlopból visszakapjuk a =IMAGE("…") szöveget
  const resp = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SPREADSHEET_ID!,
    ranges: SHEET_RANGES,
    valueRenderOption: "FORMULA",
    dateTimeRenderOption: "FORMATTED_STRING"
  });

  const out: Deal[] = [];
  for (const vr of resp.data.valueRanges || []) {
    const rows = vr.values || [];
    if (!rows.length) continue;

    const header = rows[0].map((h: any) => String(h));
    // A te fejlécmintád szerint:
    const iImage = findIdx(header, ["Image"]);
    const iName  = findIdx(header, ["Product name","Name"]);
    const iLink  = findIdx(header, ["Link","URL"]);
    const iOrig  = findIdx(header, ["Original price","Original price (no data)"]);
    const iPrice = findIdx(header, ["Coupon price","Price"]);
    const iCode  = findIdx(header, ["Coupon code","Code","ProductID"]); // több lapnál a ProductID is kuponkód
    const iWh    = findIdx(header, ["Warehouse"]);
    const iCats  = findIdx(header, ["Categories"]);
    const iStart = findIdx(header, ["Start time","Start"]);
    const iEnd   = findIdx(header, ["End time","End","Expiry","Expire"]);
    const iUpd   = findIdx(header, ["Update time","Updated"]);

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] || [];

      const title = iName >= 0 ? row[iName] : undefined;
      const link  = iLink >= 0 ? row[iLink] : undefined;
      if (!title || !link) continue;

      // Képletből URL kinyerése
      const imgRaw = iImage >= 0 ? row[iImage] : undefined;
      const imgUrl = imgRaw ? extractImageUrl(imgRaw) : undefined;

      // Dátum/lejárat
      const startIso = iStart >= 0 ? toISO(row[iStart]) : undefined;
      const endIso   = iEnd   >= 0 ? toISO(row[iEnd])   : undefined;
      const notExpired = !endIso || new Date(endIso).getTime() > Date.now();
      if (!notExpired) continue;

      // Ár/kupon
      const orig  = iOrig  >= 0 ? parseMoney(row[iOrig])  : undefined;
      const price = iPrice >= 0 ? parseMoney(row[iPrice]) : undefined;
      const code  = iCode  >= 0 ? row[iCode]  : undefined;
      const wh    = iWh    >= 0 ? row[iWh]    : undefined;
      const cats  = iCats  >= 0 && row[iCats] ? String(row[iCats]).split(",").map(s => s.trim()).filter(Boolean) : [];
      const upd   = iUpd   >= 0 ? toISO(row[iUpd]) : undefined;

      // Normalizált URL-ek
      const safeLink = normalizeUrl(String(link)) || String(link);
      const safeImg  = imgUrl ? (normalizeUrl(imgUrl) || imgUrl) : undefined;

      out.push({
        id: `sheets:${crypto.createHash("md5").update(`${vr.range}|${safeLink}|${code || ""}`).digest("hex")}`,
        src: "sheets",
        title: String(title),
        image: safeImg,
        url: safeLink,
        price,
        orig,
        cur: "USD", // Banggood ár USD – ha külön oszlop lesz currency-re, átvezetjük
        code: code || undefined,
        wh: wh || undefined,
        start: startIso,
        end: endIso,
        updated: upd,
        tags: cats
      });
    }
  }

  const items = dedupe(out);
  SHEETS_CACHE = { items, ts: Date.now() };
  return items;
}

/* ======================== Handler ======================== */
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
    const srcFilter = (qs.get("src") || "").toLowerCase();
    const minPrice = qs.get("minPrice") ? Number(qs.get("minPrice")) : undefined;
    const maxPrice = qs.get("maxPrice") ? Number(qs.get("maxPrice")) : undefined;

    // Források (párhuzamosan)
    const allRaw = await Promise.all([
      fetchSheetsDeals().catch(() => []),
      fetchBanggoodDeals().catch(() => [])
    ]);
    let all = dedupe(allRaw.flat());

    // Demo, ha nincs adat
    if (all.length === 0) {
      all = [{
        id: "demo-1", src: "sheets", title: "BlitzWolf BW-XYZ 65W GaN töltő", url: "https://example.com",
        price: 39.99, orig: 59.99, cur: "USD", code: "BGDEMO", wh: "EU",
        end: toISO(Date.now() + 36e5 * 24), updated: toISO(Date.now()), tags: ["gan", "charger", "blitzwolf"]
      }];
    }

    // Szűrések
    if (q) {
      all = all.filter(d =>
        d.title.toLowerCase().includes(q) ||
        (d.code || "").toLowerCase().includes(q) ||
        (d.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    if (whFilter) {
      all = all.filter(d =>
        (d.wh || "").toUpperCase() === whFilter ||
        (whFilter === "EU" && (d.wh || "").toUpperCase() !== "CN")
      );
    }
    if (srcFilter) {
      all = all.filter(d => d.src === srcFilter);
    }
    if (typeof minPrice === "number") {
      all = all.filter(d => (d.price ?? Infinity) >= minPrice);
    }
    if (typeof maxPrice === "number") {
      all = all.filter(d => (d.price ?? 0) <= maxPrice);
    }

    // Rangsorolás
    const scored = all.map(d => ({ d, score: scoreDeal(d) }))
      .sort((a, b) => b.score - a.score)
      .map(x => x.d);

    // Lapozás
    const start = cursor ? parseInt(cursor, 10) || 0 : 0;
    const page = scored.slice(start, start + limit);
    const nextCursor = start + limit < scored.length ? String(start + limit) : null;

    const payload = { count: scored.length, items: page, nextCursor, updatedAt: new Date().toISOString() };
    const json = JSON.stringify(payload);
    const etg = etagOf(json);

    if (ifNoneMatch && ifNoneMatch === etg) {
      return {
        statusCode: 304,
        headers: { ETag: etg, "Cache-Control": "public, max-age=600, stale-while-revalidate=60" },
        body: ""
      };
    }

    LAST_JSON = json;
    LAST_ETAG = etg;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=600, stale-while-revalidate=60",
        "ETag": etg
      },
      body: json
    };
  } catch (e: any) {
    // Snapshot fallback
    if (LAST_JSON) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
          "ETag": LAST_ETAG,
          "X-Fallback": "snapshot"
        },
        body: LAST_JSON
      };
    }
    return { statusCode: 500, body: JSON.stringify({ error: e?.message || "Server error" }) };
  }
};
