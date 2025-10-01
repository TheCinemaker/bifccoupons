// netlify/functions/ali.ts

import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import axios from "axios";

// ===== Types =====
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

// ===== ENV =====
const {
  ALIEXPRESS_APP_KEY,
  ALIEXPRESS_APP_SECRET,
  ALIEXPRESS_TRACKING_ID,
} = process.env;

// ===== Small utils =====
const md5 = (s: string) => crypto.createHash("md5").update(s, "utf8").digest("hex");
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
  const hasC = s.includes(","), hasD = s.includes(".");
  if (hasC && !hasD) s = s.replace(",", ".");
  else if (hasC && hasD) {
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
  const withProto = u.startsWith("//") ? `https:${u}` : u;
  const https = withProto.replace(/^http:/i, "https:");
  try { return encodeURI(https); } catch { return https; }
}

// Shanghai timestamp (YYYY-MM-DD HH:mm:ss) – Shanghai UTC+8, nincs DST
function shanghaiTimestamp(): string {
  const t = new Date(Date.now() + 8 * 3600 * 1000);
  return t.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * TOP (Affiliate) aláírás:
 * 1) v=2.0, sign_method=md5, format=json, method, app_key, timestamp (Asia/Shanghai), + API paramok
 * 2) kulcs szerint ASCII/ABC sorrend, 'sign' nélkül
 * 3) összefűzés: secret + (k1v1k2v2...) + secret
 * 4) MD5 -> UPPERCASE
 * Források/Logika: TOP/AE affiliate példa és doksi. 
 */
function signTOP(allParamsNoSign: Record<string, string>): string {
  if (!ALIEXPRESS_APP_SECRET) throw new Error("ALIEXPRESS_APP_SECRET hiányzik");
  const keys = Object.keys(allParamsNoSign)
    .filter(k => allParamsNoSign[k] !== undefined && allParamsNoSign[k] !== null)
    .sort();
  const concat = keys.map(k => `${k}${allParamsNoSign[k]}`).join("");
  const bookended = `${ALIEXPRESS_APP_SECRET}${concat}${ALIEXPRESS_APP_SECRET}`;
  return md5(bookended).toUpperCase();
}

/**
 * TOP hívás a Taobao gatewayre (POST, x-www-form-urlencoded)
 * Gateway: http(s)://gw.api.taobao.com/router/rest (HTTPS javasolt)
 */
async function callAliTOP(method: string, apiParams: Record<string, any>) {
  if (!ALIEXPRESS_APP_KEY || !ALIEXPRESS_APP_SECRET || !ALIEXPRESS_TRACKING_ID) {
    throw new Error("AliExpress API környezeti változók hiányoznak");
  }

  // minden param string legyen
  const apiStr: Record<string, string> = Object.fromEntries(
    Object.entries(apiParams)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)])
  );

  const base: Record<string, string> = {
    method,
    app_key: ALIEXPRESS_APP_KEY,
    sign_method: "md5",
    timestamp: shanghaiTimestamp(), // pl. "2025-10-01 20:15:03"
    format: "json",
    v: "2.0",
    ...apiStr,
  };

  const sign = signTOP(base);

  const body = new URLSearchParams({ ...base, sign });

  // TOP gateway – HTTPS használata
  const { data } = await axios.post(
    "https://gw.api.taobao.com/router/rest",
    body.toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      timeout: 15000,
    }
  );

  if (data?.error_response) {
    const msg = data.error_response?.sub_msg || data.error_response?.msg || "AliExpress API hiba";
    const code = data.error_response?.code || data.error_response?.sub_code || "?";
    throw new Error(`${msg} (code: ${code})`);
  }

  // Válasz kulcs pl.: aliexpress_affiliate_product_query_response
  const topKey = Object.keys(data)[0];
  const result = data?.[topKey]?.result;
  if (!result || result?.resp_code !== 200) {
    throw new Error(`AliExpress API hiba: ${result?.resp_msg || "Ismeretlen"}`);
  }
  return result;
}

function mapAliItem(p: any): Deal {
  const price = parseMoney(p.target_sale_price ?? p.app_sale_price ?? p.sale_price);
  const orig  = parseMoney(p.target_original_price ?? p.original_price);
  const cur   = (p.target_currency || p.currency || "USD").toString();

  return {
    id: `aliexpress:${p.product_id || md5(p.product_url || p.product_title || "")}`,
    src: "aliexpress",
    store: "AliExpress",
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

// ===== ETag cache (nem kötelező) =====
let LAST_JSON = "";
let LAST_ETAG = "";

// ===== Handler =====
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

    if (wantTop && !q) {
      console.log("[ali.ts] Top termékek kérése (TOP gateway)");
      const res = await callAliTOP("aliexpress.affiliate.hotproduct.query", {
        tracking_id: String(ALIEXPRESS_TRACKING_ID),
        page_size: String(limit),
        target_currency: "USD",
        target_language: "EN",
      });
      rawItems = res.products?.product || [];
      totalItems = res.total_record_count || (rawItems?.length || 0);

    } else if (q) {
      console.log(`[ali.ts] Keresés (TOP gateway): "${q}"`);
      let sortParam = "RELEVANCE";
      if (sort === "price_asc")  sortParam = "SALE_PRICE_ASC";
      if (sort === "price_desc") sortParam = "SALE_PRICE_DESC";

      const res = await callAliTOP("aliexpress.affiliate.product.query", {
        keywords: q,
        tracking_id: String(ALIEXPRESS_TRACKING_ID),
        page_size: String(limit),
        sort: sortParam,
        target_currency: "USD",
        target_language: "EN",
      });
      rawItems = res.products?.product || [];
      totalItems = res.total_record_count || (rawItems?.length || 0);
    }

    const items: Deal[] = rawItems.map(mapAliItem);
    const whs = Array.from(new Set(items.map(x => x.wh).filter(Boolean) as string[])).sort();

    const payload = {
      count: totalItems,
      items,
      nextCursor: null,
      updatedAt: new Date().toISOString(),
      meta: { warehouses: whs, stores: ["AliExpress"] },
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
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
        "ETag": etg
      },
      body: json,
    };
  } catch (e: any) {
    console.error("[ali.ts] Végzetes hiba:", e.message);
    if (LAST_JSON) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
          "ETag": LAST_ETAG,
          "X-Fallback": "snapshot"
        },
        body: LAST_JSON,
      };
    }
    return { statusCode: 500, body: JSON.stringify({ error: e.message || "Server error" }) };
  }
};
