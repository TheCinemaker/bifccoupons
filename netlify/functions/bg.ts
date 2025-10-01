// netlify/functions/bg.ts

import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import axios from "axios";

// Típusok
type Deal = { id: string; src: "banggood"; store: "Banggood"; title: string; url: string; short?: string; image?: string; price?: number; orig?: number; cur?: string; code?: string; wh?: string; start?: string; end?: string; updated?: string; tags?: string[]; residual?: number; };

// Környezeti változók
const { BANGGOOD_API_KEY, BANGGOOD_API_SECRET } = process.env;

// Cache és konstansok
let ACCESS_TOKEN: { token: string; ts: number } | null = null;
let LAST_JSON = "";
let LAST_ETAG = "";
const TOKEN_TTL = 50 * 60 * 1000;

// Segédfüggvények
const md5 = (s: string) => crypto.createHash("md5").update(s).digest("hex");
const etagOf = (json: string) => md5(json);
function toISO(d?: string | number | Date) { if (!d) return undefined; const dt = new Date(d); return isNaN(dt.getTime()) ? undefined : dt.toISOString(); }
function parseMoney(v: any): number | undefined { if (v == null) return undefined; let s = String(v).trim(); if (!s) return undefined; s = s.replace(/\u00A0/g, " ").replace(/\s+/g, ""); const hasComma = s.includes(","), hasDot = s.includes("."); if (hasComma && !hasDot) s = s.replace(",", "."); else if (hasComma && hasDot) { if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", "."); else s = s.replace(/,/g, ""); } s = s.replace(/[^\d.]/g, ""); const parts = s.split("."); if (parts.length > 2) { const dec = parts.pop(); s = parts.join("") + "." + dec; } const num = parseFloat(s); return Number.isFinite(num) ? num : undefined; }
function normalizeUrl(u?: string): string | undefined { if (!u) return undefined; const https = u.replace(/^http:/i, "https:"); try { return encodeURI(https); } catch { return https; } }
function scoreDeal(d: Deal): number { let score = 0; if (d.code) score += 20; if ((d.wh || "").toUpperCase() !== "CN") score += 10; if (d.end) { const days = Math.max(0, (new Date(d.end).getTime() - Date.now()) / 86400000); score += 10 - Math.min(10, days); } if (d.price && d.orig && d.price < d.orig) { const disc = 100 * (1 - d.price / d.orig); score += Math.min(8, Math.max(0, disc / 5)); } return score; }
function sign(params: Record<string, any>) { const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&"); return md5(sorted); }

// Banggood API specifikus függvények
async function getAccessToken(): Promise<string> {
  if (!BANGGOOD_API_KEY || !BANGGOOD_API_SECRET) throw new Error("BG API env hiányzik");
  const now = Date.now();
  if (ACCESS_TOKEN && (now - ACCESS_TOKEN.ts) < TOKEN_TTL) return ACCESS_TOKEN.token;
  const timestamp = Math.floor(now / 1000);
  const noncestr = Math.random().toString(36).slice(2);
  const signature = sign({ api_key: BANGGOOD_API_KEY, api_secret: BANGGOOD_API_SECRET, noncestr, timestamp });
  const { data } = await axios.get("https://affapi.banggood.com/getAccessToken", { params: { api_key: BANGGOOD_API_KEY, noncestr, timestamp, signature }, timeout: 8000 });
  const token = data?.result?.access_token;
  if (!token) throw new Error("Nem kaptunk access_token-t");
  ACCESS_TOKEN = { token, ts: now };
  return token;
}

async function fetchProducts(token: string, keyword: string, page: number, sort = "default") {
  const { data } = await axios.get("https://affapi.banggood.com/product/list", { headers: { "access-token": token }, params: { keyword, page, sort }, timeout: 10000 });
  return data?.result?.product_list || [];
}

async function fetchCoupons(token: string, page: number) {
  const { data } = await axios.get("https://affapi.banggood.com/coupon/list", { headers: { "access-token": token }, params: { type: 2, page }, timeout: 10000 });
  return data?.result?.coupon_list || [];
}

function mapProductToDeal(p: any): Deal { /* ... */ return { id: `bg-prod:${p.product_id}`, src: "banggood", store: "Banggood", title: p.product_name, url: p.product_url, image: normalizeUrl(p.view_image), price: parseMoney(p.product_coupon_price ?? p.product_price), orig: parseMoney(p.product_price), cur: "USD", code: p.coupon_code || undefined, updated: toISO(Date.now()), tags: [], wh: undefined }; }
function mapCouponToDeal(c: any): Deal { /* ... */ return { id: `bg-coup:${md5(c.promo_link_standard)}`, src: "banggood", store: "Banggood", title: (c.promo_link_standard || "").split("/").pop()?.replace(/-/g, " ") || c.only_for, url: c.promo_link_standard, short: (c.promo_link_short || "").replace(/^http:/i, "https:"), image: normalizeUrl(c.coupon_img), price: parseMoney(c.condition) ?? parseMoney(c.original_price), orig: parseMoney(c.original_price), cur: c.currency || "USD", code: c.coupon_code, wh: c.warehouse, start: toISO(c.coupon_date_start), end: toISO(c.coupon_date_end), updated: toISO(Date.now()), tags: [] }; }

// Handler
export const handler: Handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const ifNoneMatch = event.headers["if-none-match"];
    const token = await getAccessToken();

    const q = (qs.get("q") || "").trim();
    const limit = Math.max(1, Math.min(200, parseInt(qs.get("limit") || "100", 10)));
    const wantTop = ["1", "true", "yes"].includes((qs.get("top") || "").toLowerCase());
    const wantCatalog = ["1", "true", "yes"].includes((qs.get("catalog") || "").toLowerCase());

    let finalDeals: Deal[] = [];

    // 1. ESET: Top termékek (kereső üres)
    if (wantTop && !q) {
      console.log("[bg.ts] Top termékek kérése (sort=hot)");
      const rawProducts = await fetchProducts(token, "", 1, "hot");
      finalDeals = rawProducts.slice(0, limit).map(mapProductToDeal);
    
    // 2. ESET: Keresés (van keresőszó, ez a fő ág)
    } else if (q) {
      console.log(`[bg.ts] Keresés a következőre: "${q}"`);
      // Elsődlegesen a terméklistából keresünk
      const rawProducts = await fetchProducts(token, q, 1, "default");
      let dealsFromProducts = rawProducts.map(mapProductToDeal);
      finalDeals.push(...dealsFromProducts);

      // Ha a frontend kéri, kiegészítjük a kuponlistából származó találatokkal is
      if (wantCatalog) {
        console.log(`[bg.ts] Kiegészítő kuponkeresés a következőre: "${q}"`);
        const rawCoupons = await fetchCoupons(token, 1);
        const dealsFromCoupons = rawCoupons
          .filter((c: any) => (c.only_for || "").toLowerCase().includes(q.toLowerCase()))
          .map(mapCouponToDeal);
        finalDeals.push(...dealsFromCoupons);
      }
    }

    // Deduplikáció
    const seen = new Set<string>();
    const uniqueDeals: Deal[] = [];
    for (const d of finalDeals) {
      const key = `${d.url}|${d.code || ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueDeals.push(d);
      }
    }

    // Szűrés és rendezés
    let itemsToReturn = uniqueDeals;
    const whFilter = (qs.get("wh") || "").toUpperCase();
    if (whFilter) itemsToReturn = itemsToReturn.filter(d => (d.wh || "").toUpperCase() === whFilter);
    
    const sort = (qs.get("sort") || "").toLowerCase();
    if (sort === 'price_asc') itemsToReturn.sort((a,b)=>(a.price ?? Infinity)-(b.price ?? Infinity));
    else if (sort === 'price_desc') itemsToReturn.sort((a,b)=>(b.price ?? -Infinity)-(a.price ?? -Infinity));
    else itemsToReturn.sort((a, b) => scoreDeal(b) - scoreDeal(a));

    const whs = Array.from(new Set(itemsToReturn.map(x => x.wh).filter(Boolean) as string[])).sort();
    
    const payload = { 
      count: itemsToReturn.length, 
      items: itemsToReturn, 
      nextCursor: null, 
      updatedAt: new Date().toISOString(), 
      meta: { warehouses: whs, stores: ["Banggood"] } 
    };

    const json = JSON.stringify(payload);
    const etg = etagOf(json);

    if (ifNoneMatch && ifNoneMatch === etg) return { statusCode: 304, headers: { ETag: etg, "Cache-Control": "public, max-age=120" }, body: "" };

    LAST_JSON = json;
    LAST_ETAG = etg;
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=120", "ETag": etg },
      body: json,
    };
  } catch (e: any) {
    console.error("[bg.ts] Végzetes hiba:", e.message);
    if (LAST_JSON) return { statusCode: 200, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60", "ETag": LAST_ETAG, "X-Fallback": "snapshot" }, body: LAST_JSON };
    return { statusCode: 500, body: JSON.stringify({ error: e.message || "Server error" }) };
  }
};
