import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import { google } from "googleapis";

/* ========= Types ========= */
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

/* ========= ENV ========= */
const { SPREADSHEET_ID, GOOGLE_APPLICATION_CREDENTIALS_JSON } = process.env;

/* ========= Cache ========= */
let SHEETS_CACHE: { items: Deal[]; warehouses: string[]; stores: string[]; ts: number } | null = null;
const SHEETS_TTL_MS = 5 * 60 * 1000;

/* ========= Constants ========= */
const SHEETS: { title: string; store: "Banggood" | "Geekbuying" | "Geekbuying" }[] = [
  { title: "Geekbuying Unique", store: "Geekbuying" },
  { title: "Geekbuying",         store: "Geekbuying"   },
  { title: "BG Unique HUN",    store: "Banggood"   },
];

// oszlop indexek (0-alapú)
const COL = {
  image: 0,  // A
  name: 1,   // B
  link: 3,   // D
  price: 6,  // G
  code: 7,   // H
  wh: 9,     // J
  end: 12,   // M
  upd: 13,   // N
};

/* ========= Utils ========= */
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
function normalizeUrl(u?: any): string | undefined {
  if (u == null) return undefined;
  const s = String(u).trim();
  if (!/^https?:\/\//i.test(s)) return undefined;
  try {
    return encodeURI(s.replace(/^http:/i, "https:"));
  } catch {
    return s;
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
  if (parts.length > 2) { const dec = parts.pop(); s = parts.join("") + "." + dec; }
  const num = parseFloat(s);
  return Number.isFinite(num) ? num : undefined;
}
function toISO(d?: string | number | Date): string | undefined {
  if (!d) return undefined;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? undefined : dt.toISOString();
}
function dedupe(items: Deal[]): Deal[] {
  const seen = new Set<string>(), out: Deal[] = [];
  for (const d of items) {
    const key = crypto.createHash("md5").update(`${d.url}|${d.code || ""}`).digest("hex");
    if (!seen.has(key)) { seen.add(key); out.push(d); }
  }
  return out;
}
function scoreDeal(d: Deal): number {
  let s = 0;
  if ((d.wh || "").toUpperCase() !== "CN") s += 10;
  if (d.end) {
    const days = Math.max(0, (new Date(d.end).getTime() - Date.now()) / 86400000);
    s += 10 - Math.min(10, days);
  }
  return s;
}

/* ========= Sheets fetch ========= */
async function fetchSheetsDeals(): Promise<{ items: Deal[]; warehouses: string[]; stores: string[] }> {
  if (!SPREADSHEET_ID || !GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    return { items: [], warehouses: [], stores: [] };
  }
  if (SHEETS_CACHE && Date.now() - SHEETS_CACHE.ts < SHEETS_TTL_MS) {
    return { items: SHEETS_CACHE.items, warehouses: SHEETS_CACHE.warehouses, stores: SHEETS_CACHE.stores };
  }

  const creds = sanitizeCreds(GOOGLE_APPLICATION_CREDENTIALS_JSON!);
  const jwt = new google.auth.JWT(
    creds.client_email,
    undefined,
    creds.private_key,
    ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  );
  await jwt.authorize();
  const api = google.sheets({ version: "v4", auth: jwt });

  const out: Deal[] = [];
  const whSet = new Set<string>();
  const storeSet = new Set<string>();

  for (const { title, store } of SHEETS) {
    // csak az első 200 adat-sort kérjük (fejléc + 200 = 201)
    const range = `'${title.replace(/'/g, "''")}'!A1:N201`;
    try {
      const resp = await api.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID!,
        range,
        valueRenderOption: "UNFORMATTED_VALUE",
        dateTimeRenderOption: "FORMATTED_STRING",
      });
      const rows = resp.data.values || [];
      if (rows.length < 2) continue;

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const titleCell = row[COL.name];
        const linkCell  = row[COL.link];
        if (!titleCell || !linkCell) continue;

        const image = normalizeUrl(row[COL.image]); // ha nincs/rossz ⇒ undefined
        const url   = normalizeUrl(linkCell) || String(linkCell);
        const price = parseMoney(row[COL.price]);
        const code  = row[COL.code] ? String(row[COL.code]) : undefined;
        const wh    = row[COL.wh]   ? String(row[COL.wh])   : undefined;
        const end   = row[COL.end]  ? toISO(row[COL.end])   : undefined;
        const upd   = row[COL.upd]  ? toISO(row[COL.upd])   : undefined;

        if (wh) whSet.add(wh);
        storeSet.add(store);

        out.push({
          id: `sheets:${crypto.createHash("md5").update(`${title}|${url}|${code || ""}`).digest("hex")}`,
          src: "sheets",
          store,
          title: String(titleCell),
          url,
          image,
          price,
          orig: undefined,
          cur: "USD",
          code,
          wh,
          start: undefined,
          end,
          updated: upd,
          tags: [],
        });
      }
    } catch (e) {
      // ha egy lap nincs meg, csak kihagyjuk
      continue;
    }
  }

  const items = dedupe(out);
  const warehouses = Array.from(whSet).filter(Boolean).sort((a, b) => a.localeCompare(b));
  const stores = Array.from(storeSet).filter(Boolean).sort((a, b) => a.localeCompare(b));

  SHEETS_CACHE = { items, warehouses, stores, ts: Date.now() };
  return { items, warehouses, stores };
}

/* ========= Handler ========= */
let LAST_JSON = "";
let LAST_ETAG = "";

export const handler: Handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const ifNoneMatch = event.headers["if-none-match"];

    const limit = Math.max(1, Math.min(200, parseInt(qs.get("limit") || "100", 10)));
    const cursor = qs.get("cursor");
    const q = (qs.get("q") || "").toLowerCase();
    const whFilter = (qs.get("wh") || "").trim();
    const storeFilter = (qs.get("store") || "").trim(); // "Banggood" | "Geekbuying"
    const sort = (qs.get("sort") || "").toLowerCase();  // price_asc | price_desc | store_asc | store_desc

    const { items: allItems, warehouses, stores } = await fetchSheetsDeals();
    let all = [...allItems];

    if (q) {
      all = all.filter(d =>
        d.title.toLowerCase().includes(q) ||
        (d.code || "").toLowerCase().includes(q)
      );
    }
    if (whFilter) {
      const t = whFilter.toLowerCase();
      all = all.filter(d => (d.wh || "").toLowerCase() === t);
    }
    if (storeFilter) {
      all = all.filter(d => d.store === storeFilter);
    }

    // rendezés
    if (sort === "price_asc") {
      all.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    } else if (sort === "price_desc") {
      all.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
    } else if (sort === "store_asc") {
      all.sort((a, b) => a.store.localeCompare(b.store));
    } else if (sort === "store_desc") {
      all.sort((a, b) => b.store.localeCompare(a.store));
    } else {
      // default: intelligens rangsor
      all = all
        .map(d => ({ d, score: scoreDeal(d) }))
        .sort((a, b) => b.score - a.score)
        .map(x => x.d);
    }

    // lapozás
    const start = cursor ? parseInt(cursor, 10) || 0 : 0;
    const page = all.slice(start, start + limit);
    const nextCursor = start + limit < all.length ? String(start + limit) : null;

    // payload (globális meta a lenyílókhoz)
    const payload = {
      count: all.length,
      items: page,
      nextCursor,
      updatedAt: new Date().toISOString(),
      meta: { warehouses, stores },
    };

    const json = JSON.stringify(payload);
    const etg = etagOf(json);

    if (ifNoneMatch && ifNoneMatch === etg) {
      return { statusCode: 304, headers: { ETag: etg, "Cache-Control": "public, max-age=300, stale-while-revalidate=60" }, body: "" };
    }

    LAST_JSON = json;
    LAST_ETAG = etg;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
        "ETag": etg,
      },
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
