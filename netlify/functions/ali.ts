import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import axios from "axios";

/* ================= Types ================= */
type Deal = {
  id: string;
  src: "aliexpress";
  store: "AliExpress";
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

/* ================ ENV =================== */
const { ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET, ALIEXPRESS_TRACKING_ID } = process.env;

/* ============ Utils =========== */
const md5 = (s: string) => crypto.createHash("md5").update(s).digest("hex");
const etagOf = (json: string) => md5(json);

function toISO(d?: string | number | Date) {
  if (!d) return undefined;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? undefined : dt.toISOString();
}
function parseMoney(v: any): number | undefined {
  if (v == null) return;
  let s = String(v).trim();
  if (!s) return;
  s = s.replace(/\u00A0/g, " ").replace(/[^\d.,]/g, "");
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  else if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  }
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

/* ========== AliExpress SIGN (helyes) ==========
   - NINCS secret elő/suffix a stringhez.
   - Sign string: kulcsok ABC sorrendben, "key"+"value" konkatenálva.
   - signature = HMAC-SHA256(secret, stringToSign).toUpperCase()
*/
function signAliBusiness(params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  const stringToSign = sortedKeys.map(k => `${k}${params[k]}`).join("");
  return crypto
    .createHmac("sha256", ALIEXPRESS_APP_SECRET as string)
    .update(stringToSign)
    .digest("hex")
    .toUpperCase();
}

/* ===== Közös hívó: visszaadjuk a "result"-ot függetlenül a variációktól ===== */
async function callAli(method: string, apiParams: Record<string, any>) {
  if (!ALIEXPRESS_APP_KEY || !ALIEXPRESS_APP_SECRET) {
    throw new Error("AliExpress API környezeti változók hiányoznak");
  }

  // kötelező + üzleti paramok
  const base: Record<string, string> = {
    app_key: ALIEXPRESS_APP_KEY,
    sign_method: "sha256",
    timestamp: String(Date.now()),
    method,
    // a működő példák alapján nem tesszük bele a "format" paramot
    ...Object.fromEntries(Object.entries(apiParams).map(([k, v]) => [k, String(v)])),
  };

  const sign = signAliBusiness(base);

  const { data } = await axios.get("https://api-sg.aliexpress.com/sync", {
    params: { ...base, sign },
    timeout: 12000,
  });

  if (!data || typeof data !== "object") throw new Error("AliExpress API hiba: Üres vagy hibás válasz");
  if ((data as any).error_response) {
    const er = (data as any).error_response;
    throw new Error(`${er.msg || er.sub_msg || "Ismeretlen hiba"} (code: ${er.code})`);
  }

  // tipikus gyökér: aliexpress_affiliate_product_query_response / ..._hotproduct_query_response
  const rootKey = Object.keys(data).find(k => k.endsWith("_response"));
  const root = rootKey ? (data as any)[rootKey] : data;

  // A result vagy közvetlenül root.result, vagy root.resp_result.result
  const result = root?.result || root?.resp_result?.result || root;
  const respCode = Number(root?.resp_code ?? result?.resp_code ?? 200);
  if (respCode !== 200) {
    const msg = root?.resp_msg || result?.resp_msg || "Ismeretlen válaszstruktúra";
    throw new Error(`AliExpress API hiba: ${msg}`);
  }

  return result;
}

/* ===== Kinyerjük a terméktömböt, több lehetséges helyről ===== */
function pickProductsArray(result: any): any[] {
  if (result?.products?.product && Array.isArray(result.products.product)) return result.products.product;
  if (result?.hot_products?.product && Array.isArray(result.hot_products.product)) return result.hot_products.product;
  if (Array.isArray(result?.items)) return result.items;
  return [];
}

/* ===== Ali → Deal map ===== */
function mapAliProductToDeal(p: any): Deal {
  const title = p.product_title || p.subject || "AliExpress product";
  const image =
    normalizeUrl(p.product_main_image_url) ||
    (Array.isArray(p.product_small_image_urls?.string) ? normalizeUrl(p.product_small_image_urls.string[0]) : undefined) ||
    normalizeUrl(p.image_url);

  const promo = normalizeUrl(p.promotion_link);
  const detail = normalizeUrl(p.product_detail_url);
  const url = promo || detail || "#";

  const price = parseMoney(p.target_sale_price ?? p.target_app_sale_price ?? p.app_sale_price ?? p.sale_price);
  const orig  = parseMoney(p.target_original_price ?? p.original_price);
  const cur   = String(p.target_sale_price_currency || p.app_sale_price_currency || p.sale_price_currency || "USD").toUpperCase();

  return {
    id: `aliexpress:${p.product_id || md5((title || "") + (url || "") )}`,
    src: "aliexpress",
    store: "AliExpress",
    title,
    url,
    short: promo || undefined,
    image: image || undefined,
    price,
    orig,
    cur,
    code: undefined,
    wh: p.ship_from_country || undefined,
    start: undefined,
    end: undefined,
    updated: toISO(Date.now()),
    tags: [],
  };
}

/* ===== Handler ===== */
let LAST_JSON = "";
let LAST_ETAG = "";

export const handler: Handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const ifNoneMatch = event.headers["if-none-match"];

    const q      = (qs.get("q") || "").trim();
    const isTop  = ["1", "true", "yes"].includes((qs.get("top") || "").toLowerCase());
    const limit  = Math.max(1, Math.min(200, parseInt(qs.get("limit") || "100", 10)));
    const cursor = qs.get("cursor");
    const start  = cursor ? (parseInt(cursor, 10) || 0) : 0;

    // default üzleti paramok
    const biz: Record<string, any> = {
      tracking_id: ALIEXPRESS_TRACKING_ID || "", // ajánlott
      target_currency: "USD",
      target_language: "EN",
      page_size: Math.min(limit + start, 50),    // Ali max 50 oldalanként
      page_no: 1,
    };

    let method = "aliexpress.affiliate.product.query";
    if (isTop && !q) {
      method = "aliexpress.affiliate.hotproduct.query";
    } else {
      // keresésnél keywords kell
      if (q) biz.keywords = q;
    }

    const result = await callAli(method, biz);
    const products = pickProductsArray(result);
    // vágás a kért tartományra
    const sliced = products.slice(start, start + limit);
    const items = sliced.map(mapAliProductToDeal);

    const nextCursor = start + limit < products.length ? String(start + limit) : null;

    const payload = {
      count: products.length,
      items,
      nextCursor,
      updatedAt: new Date().toISOString(),
      meta: { warehouses: [] as string[], stores: ["AliExpress"] },
    };

    const json = JSON.stringify(payload);
    const etg = etagOf(json);
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
