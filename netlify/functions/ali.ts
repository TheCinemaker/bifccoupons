// netlify/functions/ali.ts

import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import axios from "axios";

// Típusok
type Deal = {
  id: string;
  src: "aliexpress";
  store: "AliExpress";
  title: string;
  url: string;
  image?: string;
  price?: number;
  orig?: number;
  cur?: string;
  code?: string;
  wh?: string;
  updated?: string;
  tags?: string[];
};

// Környezeti változók
const {
  ALIEXPRESS_APP_KEY,
  ALIEXPRESS_APP_SECRET,
  ALIEXPRESS_TRACKING_ID,
} = process.env;

// Cache
let LAST_JSON = ""; 
let LAST_ETAG = "";

// Segédfüggvények
const md5 = (s: string) => crypto.createHash("md5").update(s).digest("hex");
const etagOf = (json: string) => md5(json);
function toISO(d?: string | number | Date) { if (!d) return undefined; const dt = new Date(d); return isNaN(dt.getTime()) ? undefined : dt.toISOString(); }
function parseMoney(v: any): number | undefined {
  if (v == null) return undefined;
  let s = String(v).trim(); if (!s) return undefined;
  s = s.replace(/\u00A0/g, " ").replace(/\s+/g, "");
  const hasC = s.includes(","), hasD = s.includes(".");
  if (hasC && !hasD) s = s.replace(",", ".");
  else if (hasC && hasD) { if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", "."); else s = s.replace(/,/g, ""); }
  s = s.replace(/[^\d.]/g, ""); const parts = s.split("."); if (parts.length > 2) { const dec = parts.pop(); s = parts.join("") + "." + dec; }
  const num = parseFloat(s); return Number.isFinite(num) ? num : undefined;
}
function normalizeUrl(u?: string): string | undefined {
  if (!u) return undefined;
  const withProto = u.startsWith("//") ? `https:${u}` : u;
  const https = withProto.replace(/^http:/i, "https:");
  try { return encodeURI(https); } catch { return https; }
}

// AliExpress API specifikus függvények
function signAli(params: Record<string, string>): string {
  if (!ALIEXPRESS_APP_SECRET) throw new Error("ALIEXPRESS_APP_SECRET hiányzik");
  const keys = Object.keys(params).sort();
  const qs = keys.map(k => `${k}${params[k]}`).join("");
  const base = ALIEXPRESS_APP_SECRET + qs;
  return crypto.createHmac("sha256", ALIEXPRESS_APP_SECRET).update(base).digest("hex").toUpperCase();
}

async function callAli(method: string, apiParams: Record<string, any>) {
  if (!ALIEXPRESS_APP_KEY || !ALIEXPRESS_APP_SECRET || !ALIEXPRESS_TRACKING_ID) {
    throw new Error("AliExpress API környezeti változók hiányoznak");
  }
  const common: Record<string, string> = {
    app_key: ALIEXPRESS_APP_KEY,
    sign_method: "sha256",
    timestamp: String(Date.now()),
    format: "json",
    method,
    ...Object.fromEntries(Object.entries(apiParams).map(([k, v]) => [k, String(v)])),
  };
  const sign = signAli(common);
  const { data } = await axios.get("https://api-sg.aliexpress.com/sync", { params: { ...common, sign }, timeout: 15000 });
  if (data?.error_response) throw new Error(`${data.error_response?.msg || "AliExpress API hiba"} (code: ${data.error_response?.code || "?"})`);
  const topKey = Object.keys(data)[0];
  const result = data?.[topKey]?.result;
  if (!result || result.resp_code !== 200) throw new Error(`AliExpress API hiba: ${result?.resp_msg || "Ismeretlen"}`);
  return result;
}

function mapAliItem(p: any): Deal {
  const price = parseMoney(p.target_sale_price ?? p.app_sale_price ?? p.sale_price);
  const orig = parseMoney(p.target_original_price ?? p.original_price);
  const cur = (p.target_currency || p.currency || "USD").toString();
  return {
    id: `aliexpress:${p.product_id || md5(p.product_url || p.product_title || "")}`,
    src: "aliexpress", store: "AliExpress",
    title: String(p.product_title || p.product_name || "AliExpress product"),
    url: normalizeUrl(p.promotion_link || p.product_url) || "#",
    image: normalizeUrl(p.product_main_image_url || p.image_url),
    price, orig, cur,
    code: p.coupon_code || undefined,
    wh: p.ship_from_country || undefined,
    updated: toISO(Date.now()),
    tags: p.product_category_name ? [p.product_category_name] : [],
  };
}

// Handler
export const handler: Handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const ifNoneMatch = event.headers["if-none-match"];

    const q = (qs.get("q") || "").trim();
    const limit = Math.max(1, Math.min(50, parseInt(qs.get("limit") || "50", 10)));
    const wantTop = ["1", "true", "yes"].includes((qs.get("top") || "").toLowerCase());
    const sort = (qs.get("sort") || "").toLowerCase();

    let rawItems: any[] = [];
    let totalItems = 0;

    // 1. ESET: Top termékek kérése (nincs keresőszó)
    if (wantTop && !q) {
      console.log("[ali.ts] Top termékek kérése");
      const res = await callAli("aliexpress.affiliate.hotproduct.query", {
        tracking_id: ALIEXPRESS_TRACKING_ID!,
        page_size: limit,
      });
      rawItems = res.products?.product || [];
      totalItems = res.total_record_count || 0;
    
    // 2. ESET: Keresés (van keresőszó, ez a fő ág)
    } else if (q) {
      console.log(`[ali.ts] Keresés a következőre: "${q}"`);
      let sortParam = "RELEVANCE"; // Alapértelmezett rendezés
      if (sort === 'price_asc') sortParam = 'SALE_PRICE_ASC';
      if (sort === 'price_desc') sortParam = 'SALE_PRICE_DESC';

      const res = await callAli("aliexpress.affiliate.product.query", {
        keywords: q,
        tracking_id: ALIEXPRESS_TRACKING_ID!,
        page_size: limit,
        sort: sortParam,
      });
      rawItems = res.products?.product || [];
      totalItems = res.total_record_count || 0;
    }
    
    // Feldolgozás
    const items: Deal[] = rawItems.map(mapAliItem);
    const whs = Array.from(new Set(items.map(x => x.wh).filter(Boolean) as string[])).sort();
    
    const payload = { 
      count: totalItems, 
      items: items, 
      nextCursor: null, 
      updatedAt: new Date().toISOString(), 
      meta: { warehouses: whs, stores: ["AliExpress"] } 
    };
    const json = JSON.stringify(payload);
    const etg = etagOf(json);

    if (ifNoneMatch && ifNoneMatch === etg) {
      return { statusCode: 304, headers: { ETag: etg, "Cache-Control": "public, max-age=300" }, body: "" };
    }

    LAST_JSON = json;
    LAST_ETAG = etg;
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300", "ETag": etg },
      body: json,
    };
  } catch (e: any) {
    console.error("[ali.ts] Végzetes hiba:", e.message);
    if (LAST_JSON) return { statusCode: 200, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60", "ETag": LAST_ETAG, "X-Fallback": "snapshot" }, body: LAST_JSON };
    return { statusCode: 500, body: JSON.stringify({ error: e.message || "Server error" }) };
  }
};
