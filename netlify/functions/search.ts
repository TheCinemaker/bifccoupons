// netlify/functions/search.ts
import type { Handler } from "@netlify/functions";
import axios from "axios";
import crypto from "crypto";

/* ============== Types ============== */
type Deal = {
  id: string;
  src?: string;       // "sheets" | "banggood" | "aliexpress" | ...
  store?: string;     // "Banggood" | "Geekbuying" | "AliExpress"
  title: string;
  url: string;
  short?: string;
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

type SortKey = "price_asc" | "price_desc" | "store_asc" | "store_desc";

/* ============== Utils ============== */
const md5 = (s: string) => crypto.createHash("md5").update(s).digest("hex");
const etagOf = (json: string) => md5(json);

function inferStore(d: Deal): string {
  if (d.store) return d.store;
  const u = (d.url || "").toLowerCase();
  if (u.includes("banggood.")) return "Banggood";
  if (u.includes("geekbuying.")) return "Geekbuying";
  if (u.includes("aliexpress.")) return "AliExpress";
  return "";
}
function dedupe(items: Deal[]): Deal[] {
  const seen = new Set<string>();
  const out: Deal[] = [];
  for (const d of items) {
    const urlNoQuery = (d.url || "").split("?")[0];
    const key = d.id || `${urlNoQuery}::${d.code || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}
function scoreDeal(d: Deal): number {
  let s = 0;
  const wh = (d.wh || "").toUpperCase();
  if (wh && wh !== "CN") s += 10;
  if (d.end) {
    const days = Math.max(0, (new Date(d.end).getTime() - Date.now()) / 86400000);
    s += (10 - Math.min(10, days));
  }
  if (d.price != null && d.orig && d.price < d.orig) {
    const disc = 100 * (1 - d.price / d.orig);
    s += Math.min(8, Math.max(0, disc / 5));
  }
  return s;
}
function sortItems(items: Deal[], sort?: SortKey): Deal[] {
  if (sort === "price_asc") return [...items].sort((a,b)=>(a.price ?? Infinity)-(b.price ?? Infinity));
  if (sort === "price_desc") return [...items].sort((a,b)=>(b.price ?? -Infinity)-(a.price ?? -Infinity));
  if (sort === "store_asc" || sort === "store_desc") {
    return [...items].sort((a,b)=>{
      const ax = inferStore(a).toLowerCase();
      const bx = inferStore(b).toLowerCase();
      const cmp = ax.localeCompare(bx);
      return sort === "store_asc" ? cmp : -cmp;
    });
  }
  // “okos” alap
  return [...items].map(d=>({d,s:scoreDeal(d)})).sort((a,b)=>b.s-a.s).map(x=>x.d);
}

/* ============== HTTP helpers ============== */
function siteBase() {
  // Netlify ad URL/DEPLOY_URL envet; fallback local dev
  return process.env.URL || process.env.DEPLOY_URL || "http://localhost:8888";
}
async function fetchItems(pathAndQuery: string): Promise<Deal[]> {
  try {
    const base = siteBase();
    const { data } = await axios.get(`${base}${pathAndQuery}`, {
      timeout: 12000,
      headers: { "Cache-Control": "no-cache" },
      validateStatus: s => s >= 200 && s < 500
    });
    const items = Array.isArray(data?.items) ? data.items : [];
    return items as Deal[];
  } catch {
    return [];
  }
}

/* ============== Handler ============== */
let LAST_JSON = "";
let LAST_ETAG  = "";

export const handler: Handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const ifNoneMatch = event.headers["if-none-match"];

    const q       = (qs.get("q") || "").trim();
    const wh      = (qs.get("wh") || "").trim();
    const store   = (qs.get("store") || "").trim(); // ha meg van adva, szűkítjük a forrást
    const sort    = (qs.get("sort") || "").trim() as SortKey | "";
    const limit   = Math.max(1, Math.min(200, parseInt(qs.get("limit") || "120", 10)));
    const cursor  = qs.get("cursor");
    const start   = cursor ? (parseInt(cursor,10) || 0) : 0;

    // 1) Források kiválasztása
    const wantCoupons = !store || /^(geekbuying|banggood|sheets|all)$/i.test(store); // Sheets-aggregátor (BG+Geek)
    const wantAli     = !store || /^aliexpress$/i.test(store);
    const wantBG      = !store || /^banggood$/i.test(store);

    // 2) Párhuzamos lekérések
    const tasks: Promise<Deal[]>[] = [];

    if (wantCoupons) {
      const p = new URLSearchParams({
        q, limit: String(limit),
        ...(wh ? { wh } : {}),
      });
      tasks.push(fetchItems(`/.netlify/functions/coupons?${p.toString()}`));
    }

    if (wantAli) {
      const p = new URLSearchParams({
        ...(q ? { q } : { top: "1" }),        // ha nincs q, top termékek
        limit: String(Math.min(limit, 100)),
      });
      tasks.push(fetchItems(`/.netlify/functions/ali?${p.toString()}`));
    }

    if (wantBG) {
      const p = new URLSearchParams({
        ...(q ? { q, catalog: "1" } : {}),    // keresésnél katalogust is kérjük
        limit: String(limit),
      });
      tasks.push(fetchItems(`/.netlify/functions/bg?${p.toString()}`));
    }

    const results = await Promise.all(tasks);
    let merged = dedupe(results.flat());

    // 3) Utó-szűrés (warehouse, store)
    if (wh) {
      const WH = wh.toUpperCase();
      merged = merged.filter(d => !d.wh || String(d.wh).toUpperCase() === WH);
    }
    if (store) {
      const s = store.toLowerCase();
      merged = merged.filter(d => inferStore(d).toLowerCase() === s);
    }

    // 4) Rendezzük
    const sorted = sortItems(merged, sort as SortKey);

    // 5) Lapozás
    const pageItems = sorted.slice(start, start + limit);
    const nextCursor = start + limit < sorted.length ? String(start + limit) : null;

    // 6) Meta
    const warehouses = Array.from(new Set(sorted.map(d => d.wh).filter(Boolean) as string[])).sort((a,b)=>a.localeCompare(b));
    const stores     = Array.from(new Set(sorted.map(inferStore).filter(Boolean))).sort((a,b)=>a.localeCompare(b));

    const payload = {
      count: sorted.length,
      items: pageItems,
      nextCursor,
      updatedAt: new Date().toISOString(),
      meta: { warehouses, stores },
    };

    const json = JSON.stringify(payload);
    const etg  = etagOf(json);

    if (ifNoneMatch && ifNoneMatch === etg) {
      return { statusCode: 304, headers: { ETag: etg, "Cache-Control": "public, max-age=180, stale-while-revalidate=60" }, body: "" };
    }

    LAST_JSON = json;
    LAST_ETAG = etg;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=180, stale-while-revalidate=60",
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
