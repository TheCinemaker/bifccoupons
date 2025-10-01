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

// ===== Helpers =====
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

/**
 * Helyes /sync (Business Interface) sign:
 * - Veszünk MINDEN paramétert (rendszer + business), kivéve "sign"
 * - ASCII szerint rendezzük a kulcsokat
 * - Összefűzzük: k1+v1+k2+v2+...
 * - HMAC-SHA256(message=concat, key=APP_SECRET) -> hex UPPERCASE
 * - NINCS API path prefix (az csak System Interface, /rest esetén kellene)
 */
function signSync(allParamsNoSign: Record<string, string>): string {
  if (!ALIEXPRESS_APP_SECRET) throw new Error("ALIEXPRESS_APP_SECRET hiányzik");
  const keys = Object.keys(allParamsNoSign)
    .filter(k => k !== "sign" && allParamsNoSign[k] !== undefined && allParamsNoSign[k] !== null)
    .sort();
  const toSign = keys.map(k => `${k}${allParamsNoSign[k]}`).join("");
  return crypto.createHmac("sha256", ALIEXPRESS_APP_SECRET).update(toSign, "utf8").digest("hex").toUpperCase();
}

/**
 * /sync hívás (Business Interface)
 * GET vagy POST is jó; itt GET-et használunk.
 * FONTOS: timestamp milliszekundumban!
 */
async function callAli(method: string, apiParams: Record<string, any>) {
  if (!ALIEXPRESS_APP_KEY || !ALIEXPRESS_APP_SECRET) {
    throw new Error("AliExpress API környezeti változók hiányoznak");
  }

  const tsMs = Date.now(); // <-- ms, nem sec!

  // mindent stringgé alakítunk
  const apiStr: Record<string, string> = Object.fromEntries(
    Object.entries(apiParams)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)])
  );

  // rendszer + business paramok
  const baseNoSign: Record<string, string> = {
    app_key: ALIEXPRESS_APP_KEY,
    sign_method: "sha256",
    timestamp: String(tsMs),
    format: "json",
    method, // <- API name paraméterként (részt vesz a sign-ban)
    ...apiStr,
  };

  const sign = signSync(baseNoSign);

  const { data } = await axios.get("https://api-sg.aliexpress.com/sync", {
    params: { ...baseNoSign, sign },
    timeout: 15000,
  });

  if (data?.error_response) {
    const msg = data.error_response?.msg || "AliExpress API hiba";
    const code = data.error_response?.code || "?";
    throw new Error(`${msg} (code: ${code})`);
  }

  // Válasz kulcs pl.: aliexpress_affiliate_product_query_response
  const topKey = Object.keys(data)[0];
  const result = data?.[topKey]?.result;
  if (!result || result.resp_code !== 200) {
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

// ===== ETag cache =====
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
      console.log("[ali.ts] Top termékek kérése (/sync, HMAC-SHA256, ms timestamp)");
      const res = await callAli("aliexpress.affiliate.hotproduct.query", {
        tracking_id: String(ALIEXPRESS_TRACKING_ID || ""),
        page_size: String(limit),
        target_currency: "USD",
        target_language: "EN",
      });
      rawItems = res.products?.product || [];
      totalItems = res.total_record_count || (rawItems?.length || 0);

    } else if (q) {
      console.log(`[ali.ts] Keresés (/sync): "${q}"`);
      let sortParam = "RELEVANCE";
      if (sort === "price_asc")  sortParam = "SALE_PRICE_ASC";
      if (sort === "price_desc") sortParam = "SALE_PRICE_DESC";

      const res = await callAli("aliexpress.affiliate.product.query", {
        keywords: q,
        tracking_id: String(ALIEXPRESS_TRACKING_ID || ""),
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
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300", "ETag": etg },
      body: json,
    };
  } catch (e: any) {
    console.error("[ali.ts] Végzetes hiba:", e.message);
    if (LAST_JSON) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60", "ETag": LAST_ETAG, "X-Fallback": "snapshot" },
        body: LAST_JSON,
      };
    }
    return { statusCode: 500, body: JSON.stringify({ error: e.message || "Server error" }) };
  }
};
