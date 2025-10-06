import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import axios from "axios";

/* ============== Types ============== */
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

/* ============== ENV ============== */
const { ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET, ALIEXPRESS_TRACKING_ID } = process.env;

/* ===== In-memory fallback ===== */
let LAST_JSON = "";
let LAST_ETAG = "";

/* ============== Utils ============== */
const md5 = (s: string) => crypto.createHash("md5").update(s).digest("hex");
const etagOf = (json: string) => md5(json);

function toISO(d?: string | number | Date) {
  if (!d) return undefined;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? undefined : dt.toISOString();
}

function parseMoneyLoose(v: any): number | undefined {
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
  const withProto = u.startsWith("//") ? `https:${u}` : u;
  const https = withProto.replace(/^http:/i, "https:");
  try { return encodeURI(https); } catch { return https; }
}

/** AliExpress aláírás (HMAC-SHA256, UPPERCASE) – a használt végponttal működik */
function signAli(params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  const queryString = sortedKeys.map(k => `${k}${params[k]}`).join("");
  const stringToSign = (ALIEXPRESS_APP_SECRET || "") + queryString;
  return crypto.createHmac("sha256", ALIEXPRESS_APP_SECRET || "")
               .update(stringToSign)
               .digest("hex")
               .toUpperCase();
}

/** Közös hívó – visszaadja a *valódi* result objektumot függetlenül az alias nevétől */
async function callAli(method: string, apiParams: Record<string, any>) {
  if (!ALIEXPRESS_APP_KEY || !ALIEXPRESS_APP_SECRET) {
    throw new Error("AliExpress API környezeti változók hiányoznak");
  }

  const baseParams: Record<string, string> = {
    app_key: ALIEXPRESS_APP_KEY,
    sign_method: "sha256",
    timestamp: String(Date.now()),
    format: "json",
    method,
    ...Object.fromEntries(Object.entries(apiParams).map(([k, v]) => [k, String(v)])),
  };

  const sign = signAli(baseParams);
  const { data } = await axios.get("https://api-sg.aliexpress.com/sync", {
    params: { ...baseParams, sign },
    timeout: 12000,
  });

  if (!data || typeof data !== "object") {
    throw new Error("AliExpress API hiba: Üres vagy hibás válasz");
  }
  if (data.error_response) {
    const msg = data.error_response?.msg || "Ismeretlen hiba";
    const code = data.error_response?.code;
    throw new Error(`AliExpress API hiba: ${msg} (code: ${code})`);
  }

  // A gyökér kulcs pl. "aliexpress_affiliate_product_query_response"
  const rootKey = Object.keys(data).find(k => k.endsWith("_response"));
  const root = rootKey ? data[rootKey] : data;

  // A valódi result legtöbbször: ..._response.resp_result.result
  const respResult = root?.resp_result;
  const result = respResult?.result || root?.result || root;

  if (!result) {
    throw new Error("AliExpress API hiba: Ismeretlen válaszstruktúra");
  }

  const respCode = respResult?.resp_code ?? result?.resp_code ?? root?.resp_code;
  if (Number(respCode) !== 200) {
    const msg = respResult?.resp_msg || result?.resp_msg || "Ismeretlen hiba a válaszban";
    throw new Error(`AliExpress API hiba: ${msg}`);
  }

  return result;
}

/** Kinyeri a termék tömböt a különböző lehetséges mezőkből */
function pickProductsArray(result: any): any[] {
  // Keresés
  if (result.products?.product && Array.isArray(result.products.product)) {
    return result.products.product;
  }
  // Hot products
  if (result.hot_products?.product && Array.isArray(result.hot_products.product)) {
    return result.hot_products.product;
  }
  // Néhány válasz "items"-t használ
  if (Array.isArray(result.items)) {
    return result.items;
  }
  if (Array.isArray(result)) {
    return result;
  }
  return [];
}

/** Ali → Deal map */
function mapAliProductToDeal(p: any): Deal {
  const title = p.product_title || p.subject || "AliExpress product";
  const image =
    normalizeUrl(p.product_main_image_url) ||
    normalizeUrl(p.image_url) ||
    (Array.isArray(p.product_small_image_urls?.string) ? normalizeUrl(p.product_small_image_urls.string[0]) : undefined);

  // Affiliate link preferencia
  const promo = normalizeUrl(p.promotion_link);
  const detail = normalizeUrl(p.product_detail_url);
  const url = promo || detail || "#";

  const price = parseMoneyLoose(p.target_sale_price ?? p.target_app_sale_price ?? p.app_sale_price ?? p.sale_price);
  const orig  = parseMoneyLoose(p.target_original_price ?? p.original_price);
  const cur   = String(p.target_sale_price_currency || p.app_sale_price_currency || p.sale_price_currency || "USD").toUpperCase();

  return {
    id: `aliexpress:${p.product_id || md5((title || "") + (url || "") )}`,
    src: "aliexpress",
    store: "AliExpress",
    title,
    url,
    short: promo || undefined,
    image: image || undefined,
    price: price,
    orig: orig,
    cur,
    code: undefined,
    wh: undefined,
    start: undefined,
    end: undefined,
    updated: toISO(Date.now()),
    tags: [],
  };
}

/** Fő fetchelő: keresés (q) vagy TOP (top=1) */
async function fetchAliDeals(q: string, opts: { limit: number; start: number; pages: number; top: boolean }) {
  const { limit, start, pages, top } = opts;
  const PAGE_SIZE = 50; // Ali max 50/page

  let collected: any[] = [];
  let pageNo = 1;
  const need = start + limit;

  while (collected.length < need && pageNo <= pages) {
    const params: Record<string, any> = {
      page_no: String(pageNo),
      page_size: String(PAGE_SIZE),
      tracking_id: ALIEXPRESS_TRACKING_ID || "", // ha nincs, a promotion_link még jönhet, de jobb ha van
    };

    let method = "aliexpress.affiliate.product.query";
    if (top) {
      method = "aliexpress.affiliate.hotproduct.query";
      // top-nál általában nem kell keyword
    } else {
      if (q) params["keywords"] = q; // egyes implementációk 'keyword' / 'keywords' – a fenti működő valtozatban 'keywords'
    }

    const result = await callAli(method, params);
    const products = pickProductsArray(result);
    if (!products.length) break;

    collected = collected.concat(products);
    pageNo++;
  }

  // vágás és map-elés
  const pageSlice = collected.slice(start, start + limit);
  return pageSlice.map(mapAliProductToDeal);
}

/* ============== Handler ============== */
export const handler: Handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const ifNoneMatch = event.headers["if-none-match"];

    const q        = (qs.get("q") || "").trim();
    const limit    = Math.max(1, Math.min(200, parseInt(qs.get("limit") || "100", 10)));
    const cursor   = qs.get("cursor");
    const start    = cursor ? (parseInt(cursor, 10) || 0) : 0;
    const pages    = Math.max(1, Math.min(6, parseInt(qs.get("pages") || "4", 10)));
    const isTop    = ["1", "true", "yes"].includes((qs.get("top") || "").toLowerCase());

    const minPrice = qs.get("minPrice") ? Number(qs.get("minPrice")) : undefined;
    const maxPrice = qs.get("maxPrice") ? Number(qs.get("maxPrice")) : undefined;

    // fő adatlekérés
    let items = await fetchAliDeals(q, { limit, start, pages, top: isTop });

    // ár szűrés (ha kérted)
    if (typeof minPrice === "number") items = items.filter(d => (d.price ?? Infinity) >= minPrice);
    if (typeof maxPrice === "number") items = items.filter(d => (d.price ?? 0) <= maxPrice);

    const nextCursor = start + limit < (start + items.length) ? String(start + limit) : null;

    const payload = {
      count: start + items.length, // a kliensnek elég az items + nextCursor
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
    // Snapshot fallback
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
