import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import axios from "axios";

/* ============== Types ============== */
type Deal = {
  id: string;
  src: "banggood";
  store: "Banggood";
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
  residual?: number;
};

/* ============== ENV ============== */
const {
  BANGGOOD_API_KEY,
  BANGGOOD_API_SECRET,
  BANGGOOD_AFFILIATE_PARAM, // csak a kereső fallbackhez építünk be, de a go.ts úgyis biztosítja
} = process.env;

/* ========== In-memory cache ========== */
let ACCESS_TOKEN: { token: string; ts: number } | null = null;
let LAST_JSON = "";
let LAST_ETAG = "";

const TOKEN_TTL = 50 * 60 * 1000; // 50 perc
const COUPON_PAGE_CAP = 5;        // max 5 oldal kupon
const CATALOG_PAGE_CAP = 2;       // max 2 oldal katalógus

/* ============== Utils ============== */
const md5 = (s: string) => crypto.createHash("md5").update(s).digest("hex");
const etagOf = (json: string) => md5(json);

function toISO(d?: string | number | Date) {
  if (!d) return undefined;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? undefined : dt.toISOString();
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

function normalizeUrl(u?: string): string | undefined {
  if (!u) return undefined;
  const https = u.replace(/^http:/i, "https:");
  try { return encodeURI(https); } catch { return https; }
}

function scoreDeal(d: Deal): number {
  let score = 0;
  if (d.code) score += 20;                          // kupon boost
  if ((d.wh || "").toUpperCase() !== "CN") score += 10;
  if (d.end) {
    const days = Math.max(0, (new Date(d.end).getTime() - Date.now()) / 86400000);
    score += 10 - Math.min(10, days);
  }
  if (d.price && d.orig && d.price < d.orig) {
    const disc = 100 * (1 - d.price / d.orig);
    score += Math.min(8, Math.max(0, disc / 5));
  }
  return score;
}

function sign(params: Record<string, any>) {
  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&");
  return md5(sorted);
}

function slugify(q: string) {
  return q.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function buildBgSearchUrl(q: string): string {
  const slug = slugify(q);
  const base = `https://www.banggood.com/search/${slug}.html`;
  const p = (BANGGOOD_AFFILIATE_PARAM || "").trim();
  return p ? `${base}?p=${encodeURIComponent(p)}` : base;
}

/* ========== Banggood auth ========== */
async function getAccessToken(): Promise<string> {
  if (!BANGGOOD_API_KEY || !BANGGOOD_API_SECRET) throw new Error("BG API env hiányzik");
  const now = Date.now();
  if (ACCESS_TOKEN && (now - ACCESS_TOKEN.ts) < TOKEN_TTL) return ACCESS_TOKEN.token;

  const timestamp = Math.floor(now / 1000);
  const noncestr = Math.random().toString(36).slice(2);
  const signature = sign({ api_key: BANGGOOD_API_KEY, api_secret: BANGGOOD_API_SECRET, noncestr, timestamp });

  const { data } = await axios.get("https://affapi.banggood.com/getAccessToken", {
    params: { api_key: BANGGOOD_API_KEY, noncestr, timestamp, signature },
    timeout: 8000,
  });

  const token = data?.result?.access_token;
  if (!token) throw new Error("Nem kaptunk access_token-t");
  ACCESS_TOKEN = { token, ts: now };
  return token;
}

/* ========== Coupon list ========== */
async function fetchCouponPage(token: string, page: number) {
  const { data } = await axios.get("https://affapi.banggood.com/coupon/list", {
    headers: { "access-token": token },
    params: { type: 2, page },
    timeout: 10000,
  });
  return data?.result || {};
}

function mapCouponToDeal(c: any): Deal {
  let name: string =
    (c.promo_link_standard || "")
      .split("/")
      .pop()
      ?.replace(/-/g, " ")
      ?.replace(/\?.*$/g, "")
      ?.replace(/!.*$/g, "") || c.only_for || "Banggood deal";

  const stdRaw: string = c.promo_link_standard || "";
  const shortRaw: string = c.promo_link_short || "";
  const shortHttps = shortRaw ? shortRaw.replace(/^http:/i, "https:") : "";
  const safeStd = normalizeUrl(stdRaw) || "";
  const finalUrl = shortHttps || safeStd || "#";

  return {
    id: `banggood:${md5(`${c.promo_link_standard || ""}|${c.coupon_code || ""}`)}`,
    src: "banggood",
    store: "Banggood",
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
    residual: c.coupon_residual ? Number(c.coupon_residual) : undefined,
  };
}

/* ========== Catalog search: /product/list (keyword) ========== */
/*  A /product/list támogat keyword keresést és képeket is ad:
    product_url, product_name, product_price, product_coupon_price, coupon_code,
    small_image, list_grid_image, view_image ...  (BG affiliate apidoc)  */
async function fetchCatalogPage(token: string, keyword: string, page: number) {
  const { data } = await axios.get("https://affapi.banggood.com/product/list", {
    headers: { "access-token": token },
    params: { keyword, page },
    timeout: 10000,
  });
  return data?.result || {};
}

function pickImage(p: any): string | undefined {
  return normalizeUrl(p.view_image || p.list_grid_image || p.small_image || "");
}

function mapProductToDeal(p: any): Deal {
  const price = parseMoney(p.product_coupon_price ?? p.product_price);
  const orig  = parseMoney(p.product_price);
  return {
    id: `banggood:catalog:${p.product_id || md5(p.product_url || p.product_name || "")}`,
    src: "banggood",
    store: "Banggood",
    title: String(p.product_name || "Banggood product"),
    url: String(p.product_url || "#"),
    image: pickImage(p),
    price,
    orig,
    cur: "USD",
    code: p.coupon_code || undefined,   // ha van kupon, itt is megjelenik
    updated: toISO(Date.now()),
    tags: [],
  };
}

/* ============== Handler ============== */
export const handler: Handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const ifNoneMatch = event.headers["if-none-match"];

    const q = (qs.get("q") || "").trim();
    const qLower = q.toLowerCase();
    const whFilter = (qs.get("wh") || "").toUpperCase();
    const minPrice = qs.get("minPrice") ? Number(qs.get("minPrice")) : undefined;
    const maxPrice = qs.get("maxPrice") ? Number(qs.get("maxPrice")) : undefined;
    const sort = (qs.get("sort") || "").toLowerCase(); // price_asc|price_desc|store_asc|store_desc
    const limit = Math.max(1, Math.min(200, parseInt(qs.get("limit") || "100", 10)));
    const cursor = qs.get("cursor");
    const couponDepth  = Math.max(1, Math.min(COUPON_PAGE_CAP,  parseInt(qs.get("pages") || "3", 10)));
    const catalogDepth = Math.max(1, Math.min(CATALOG_PAGE_CAP, parseInt(qs.get("cpages") || "2", 10)));
    const wantCatalog = ["1","true","yes"].includes((qs.get("catalog") || "").toLowerCase());

    const token = await getAccessToken();

    // --- 1) Kuponok
    let page = 1, pages = 1;
    const couponsRaw: any[] = [];
    while (page <= pages && page <= couponDepth) {
      const res = await fetchCouponPage(token, page);
      const list: any[] = res?.coupon_list || [];
      pages = res?.page_total || page;
      couponsRaw.push(...list);
      page++;
    }
    let items: Deal[] = couponsRaw.map(mapCouponToDeal);

    // --- 2) Katalógus (ha kérjük, és van q)
    if (wantCatalog && q) {
      let cpage = 1, cpages = 1;
      const productsRaw: any[] = [];
      while (cpage <= cpages && cpage <= catalogDepth) {
        const res = await fetchCatalogPage(token, q, cpage);
        const list: any[] = res?.product_list || [];
        cpages = res?.page_total || cpage;
        productsRaw.push(...list);
        cpage++;
      }
      const catalogDeals = productsRaw.map(mapProductToDeal);

      // merge + dedupe (url + code alapján)
      const seen = new Set<string>();
      const merged: Deal[] = [];
      for (const d of [...items, ...catalogDeals]) {
        const key = md5(`${d.url}|${d.code || ""}`);
        if (!seen.has(key)) { seen.add(key); merged.push(d); }
      }
      items = merged;
    }

    // --- Szűrések
    if (qLower) {
      items = items.filter(d =>
        d.title.toLowerCase().includes(qLower) ||
        (d.code || "").toLowerCase().includes(qLower)
      );
    }
    if (whFilter) items = items.filter(d => (d.wh || "").toUpperCase() === whFilter);
    if (typeof minPrice === "number") items = items.filter(d => (d.price ?? Infinity) >= minPrice);
    if (typeof maxPrice === "number") items = items.filter(d => (d.price ?? 0) <= maxPrice);

    // --- Rendezés
    if (sort === "price_asc") {
      items.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    } else if (sort === "price_desc") {
      items.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
    } else {
      items = items.map(d => ({ d, s: scoreDeal(d) }))
                   .sort((a, b) => b.s - a.s)
                   .map(x => x.d);
    }

    // --- Meta (wh listát csak kuponokból tudunk biztosan)
    const whs = Array.from(new Set(items.map(x => x.wh).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
    const stores = ["Banggood"];

    // --- Paginálás
    const start = cursor ? parseInt(cursor, 10) || 0 : 0;
    const pageItems = items.slice(start, start + limit);
    const nextCursor = start + limit < items.length ? String(start + limit) : null;

    const payload = {
      count: items.length,
      items: pageItems,
      nextCursor,
      updatedAt: new Date().toISOString(),
      meta: { warehouses: whs, stores },
    };
    const json = JSON.stringify(payload);
    const etg = etagOf(json);

    if (ifNoneMatch && ifNoneMatch === etg) {
      return { statusCode: 304, headers: { ETag: etg, "Cache-Control": "public, max-age=120, stale-while-revalidate=30" }, body: "" };
    }

    LAST_JSON = json;
    LAST_ETAG = etg;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=120, stale-while-revalidate=30", "ETag": etg },
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
