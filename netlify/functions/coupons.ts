import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import axios from "axios";
import { google } from "googleapis";

// ===== Canonical típus =====
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

// ===== ENV =====
const {
  SPREADSHEET_ID,
  GOOGLE_APPLICATION_CREDENTIALS_JSON,
  BANGGOOD_API_KEY,
  BANGGOOD_API_SECRET,
} = process.env;

// --- Cache-k (memória) ---
let SHEETS_CACHE: { items: Deal[]; ts: number } | null = null;
let BANGGOOD_CACHE: { items: Deal[]; ts: number } | null = null;

const SHEETS_TTL_MS = 5 * 60 * 1000;   // 5 perc
const BANGGOOD_TTL_MS = 10 * 60 * 1000; // 10 perc

// ===== Util =====
function etagOf(json: string) {
  return crypto.createHash("md5").update(json).digest("hex");
}
function parseMoney(v: any): number | undefined {
  if (v === null || v === undefined) return undefined;
  const num = Number(String(v).replace(/[^\d.]/g, ""));
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

// ===== Banggood adapter =====
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
      let name: string = (c.promo_link_standard || "").split("/").pop()?.replace(/-/g, " ") || c.only_for || "Banggood deal";
      name = name.replace(/\?.*$/g, "").replace(/!.*$/g, "");
      const deal: Deal = {
        id: `banggood:${crypto.createHash("md5").update(`${c.promo_link_standard || ""}|${c.coupon_code || ""}`).digest("hex")}`,
        src: "banggood",
        title: name,
        image: c.coupon_img || undefined,
        url: c.promo_link_standard || c.promo_link_short || "#",
        short: c.promo_link_short || undefined,
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

// ===== Google Sheets adapter (TURBO) =====
const SHEET_RANGES = [
  "'BG Unique'!A:N",
  "'BG Unique HUN'!A:N"
];

async function fetchSheetsDeals(): Promise<Deal[]> {
  if (!SPREADSHEET_ID || !GOOGLE_APPLICATION_CREDENTIALS_JSON) return [];
  if (SHEETS_CACHE && Date.now() - SHEETS_CACHE.ts < SHEETS_TTL_MS) {
    return SHEETS_CACHE.items;
  }

  const creds = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS_JSON!);
  const jwt = new google.auth.JWT(
    creds.client_email, undefined, creds.private_key,
    ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  );
  const sheets = google.sheets({ version: "v4", auth: jwt });

  const resp = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SPREADSHEET_ID!,
    ranges: SHEET_RANGES
  });

  const out: Deal[] = [];
  for (const vr of resp.data.valueRanges || []) {
    const rows = vr.values || [];
    if (!rows.length) continue;

    const header = rows[0].map((h: any) => String(h).trim().toLowerCase());
    const idx = (name: string) => header.indexOf(name);

    const iImage = idx("image");
    const iName = idx("name");
    const iLink = idx("link");
    const iOrig = idx("original price");
    const iPrice = idx("price");
    const iCode = idx("code");
    const iWh = idx("warehouse");
    const iCats = idx("categories");
    const iStart = idx("start time");
    const iEnd = idx("end time");
    const iUpd = idx("update time");

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const title = iName >= 0 ? row[iName] : undefined;
      const link = iLink >= 0 ? row[iLink] : undefined;
      if (!title || !link) continue;

      const end = iEnd >= 0 ? toISO(row[iEnd]) : undefined;
      const notExpired = !end || new Date(end).getTime() > Date.now();
      if (!notExpired) continue;

      const image = iImage >= 0 ? row[iImage] : undefined;
      const orig = iOrig >= 0 ? parseMoney(row[iOrig]) : undefined;
      const price = iPrice >= 0 ? parseMoney(row[iPrice]) : undefined;
      const code = iCode >= 0 ? row[iCode] : undefined;
      const wh = iWh >= 0 ? row[iWh] : undefined;
      const cats = iCats >= 0 && row[iCats] ? String(row[iCats]).split(",").map((s: string) => s.trim()).filter(Boolean) : [];
      const start = iStart >= 0 ? toISO(row[iStart]) : undefined;
      const upd = iUpd >= 0 ? toISO(row[iUpd]) : undefined;

      out.push({
        id: `sheets:${crypto.createHash("md5").update(`${vr.range}|${link}|${code || ""}`).digest("hex")}`,
        src: "sheets",
        title: String(title),
        image: image || undefined,
        url: String(link),
        price, orig, cur: "USD",
        code: code || undefined,
        wh: wh || undefined,
        start, end, updated: upd,
        tags: cats
      });
    }
  }

  const items = dedupe(out);
  SHEETS_CACHE = { items, ts: Date.now() };
  return items;
}

// ===== Fő handler =====
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

    const promises: Promise<Deal[]>[] = [
      fetchSheetsDeals().catch(() => []),
      fetchBanggoodDeals().catch(() => [])
    ];
    const allRaw = await Promise.all(promises);
    let all = dedupe(allRaw.flat());

    if (all.length === 0) {
      all = [{
        id: "demo-1", src: "sheets", title: "BlitzWolf BW-XYZ 65W GaN töltő", url: "https://example.com",
        price: 39.99, orig: 59.99, cur: "USD", code: "BGDEMO", wh: "EU",
        end: toISO(Date.now() + 36e5 * 24), updated: toISO(Date.now()), tags: ["gan", "charger", "blitzwolf"]
      }];
    }

    if (q) {
      all = all.filter(d =>
        d.title.toLowerCase().includes(q) ||
        (d.code || "").toLowerCase().includes(q) ||
        (d.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    if (whFilter) {
      all = all.filter(d => (d.wh || "").toUpperCase() === whFilter || (whFilter === "EU" && (d.wh || "").toUpperCase() !== "CN"));
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
      body: json
    };
  } catch (e: any) {
    if (LAST_JSON) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60", "ETag": LAST_ETAG, "X-Fallback": "snapshot" },
        body: LAST_JSON
      };
    }
    return { statusCode: 500, body: JSON.stringify({ error: e?.message || "Server error" }) };
  }
};
