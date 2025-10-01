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
const {
  ALIEXPRESS_APP_KEY,
  ALIEXPRESS_APP_SECRET,
  ALIEXPRESS_TRACKING_ID,
} = process.env;

/* ============ In-memory cache =========== */
let LAST_JSON = "";
let LAST_ETAG = "";

/* ================ Limits ================= */
const PAGE_CAP = 3;        // max ennyi katalógus oldal / kérés
const PAGE_SIZE = 40;      // termék / oldal (API limitjei mellett rugalmas)

/* ================ Utils ================= */
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
  const withProto = u.startsWith("//") ? `https:${u}` : u;
  const https = withProto.replace(/^http:/i, "https:");
  try { return encodeURI(https); } catch { return https; }
}

function scoreDeal(d: Deal): number {
  let score = 0;
  if (d.code) score += 12; // ha lenne kupon, egy kis boost
  if (d.price && d.orig && d.price < d.orig) {
    const disc = 100 * (1 - d.price / d.orig);
    score += Math.min(8, Math.max(0, disc / 5));
  }
  return score;
}

/* ========== AliExpress API sign & call ========== */
/* A jelenlegi Open Platform (sync endpoint) aláírása:
 * - kulcs-érték párok kulcs szerint rendezve, összefűzve: key + value
 * - string elejére az APP_SECRET kerül
 * - HMAC-SHA256 (key = APP_SECRET), nagybetűs hex
 */
function signAliExpress(params: Record<string, string>): string {
  if (!ALIEXPRESS_APP_SECRET) throw new Error("ALIEXPRESS_APP_SECRET hiányzik");
  const sortedKeys = Object.keys(params).sort();
  const queryString = sortedKeys.map(k => `${k}${params[k]}`).join("");
  const stringToSign = ALIEXPRESS_APP_SECRET + queryString;
  return crypto.createHmac("sha256", ALIEXPRESS_APP_SECRET)
               .update(stringToSign)
               .digest("hex")
               .toUpperCase();
}

async function callAliExpressApi(method: string, apiParams: Record<string, any>) {
  if (!ALIEXPRESS_APP_KEY || !ALIEXPRESS_APP_SECRET || !ALIEXPRESS_TRACKING_ID) {
    throw new Error("AliExpress API környezeti változók hiányoznak");
  }

  const common: Record<string, string> = {
    app_key: ALIEXPRESS_APP_KEY,
    sign_method: "sha256",
    timestamp: String(Date.now()),
    format: "json",
    method,
    // NOTE: minden paramétert stringgé alakítunk:
    ...Object.fromEntries(Object.entries(apiParams).map(([k, v]) => [k, String(v)])),
  };

  const sign = signAliExpress(common);
  const { data } = await axios.get("https://api-sg.aliexpress.com/sync", {
    params: { ...common, sign },
    timeout: 15000,
  });

  if (data?.error_response) {
    const msg = `${data.error_response?.msg || "AliExpress API hiba"} (code: ${data.error_response?.code || "?"})`;
    throw new Error(msg);
  }

  // A válasz gyökér kulcsa a metódusfüggő response név:
  const topKey = Object.keys(data)[0];
  const result = data?.[topKey]?.result;
  if (!result || result.resp_code !== 200) {
    throw new Error(`AliExpress API hiba: ${result?.resp_msg || "Ismeretlen hiba a válaszban"}`);
  }
  return result;
}

/* ========== Catalog keresés (aliexpress.affiliate.product.query) ========== */
function mapAliItemToDeal(p: any): Deal {
  // Ár & pénznem – több mezőverziót is kezelünk
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
    // Ali termékeknél kuponkód ritkán jön vissza a product.query-ben:
    code: p.coupon_code || undefined,
    updated: toISO(Date.now()),
    tags: [],
  };
}

async function fetchAliCatalog(keyword: string, pageNo: number, pageSize: number) {
  const result = await callAliExpressApi("aliexpress.affiliate.product.query", {
    keywords: keyword,
    tracking_id: ALIEXPRESS_TRACKING_ID!,
    page_no: pageNo,
    page_size: pageSize,
    // Opcionális: sorting az Ali oldal felé (nem ugyanaz, mint a front rendezés)
    // sort: "SALE_PRICE_ASC" | "SALE_PRICE_DESC" | "LAST_VOLUME_DESC" | ...
  });

  // A struktúra lehet: result.products vagy result.products.product
  const products = result.products?.product || result.products || [];
  return Array.isArray(products) ? products : [];
}

/* ============== Handler ============== */
export const handler: Handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const ifNoneMatch = event.headers["if-none-match"];

    const q = (qs.get("q") || "").trim();
    const qLower = q.toLowerCase();

    const minPrice = qs.get("minPrice") ? Number(qs.get("minPrice")) : undefined;
    const maxPrice = qs.get("maxPrice") ? Number(qs.get("maxPrice")) : undefined;

    const sort = (qs.get("sort") || "").toLowerCase(); // price_asc | price_desc | store_asc | store_desc (front oldali logika)
    const limit = Math.max(1, Math.min(200, parseInt(qs.get("limit") || "100", 10)));
    const cursor = qs.get("cursor");
    const pageDepth = Math.max(1, Math.min(PAGE_CAP, parseInt(qs.get("pages") || "2", 10)));

    // --- 1) Ha van kulcsszó: katalógus keresés több oldalon
    const itemsRaw: any[] = [];
    if (q) {
      let page = 1;
      while (page <= pageDepth) {
        const chunk = await fetchAliCatalog(q, page, PAGE_SIZE);
        if (!chunk.length) break;
        itemsRaw.push(...chunk);
        page++;
      }
    }

    // --- 2) Map → Deal + dedupe (url|code alapján)
    const seen = new Set<string>();
    let items: Deal[] = [];
    for (const p of itemsRaw) {
      const d = mapAliItemToDeal(p);
      const key = md5(`${d.url}|${d.code || ""}`);
      if (!seen.has(key)) {
        seen.add(key);
        items.push(d);
      }
    }

    // --- 3) Szűrések (front kompatibilis)
    if (qLower) {
      items = items.filter(d =>
        d.title.toLowerCase().includes(qLower) ||
        (d.code || "").toLowerCase().includes(qLower)
      );
    }
    if (typeof minPrice === "number") items = items.filter(d => (d.price ?? Infinity) >= minPrice);
    if (typeof maxPrice === "number") items = items.filter(d => (d.price ?? 0) <= maxPrice);

    // --- 4) Rendezés (front szabályok szerint)
    if (sort === "price_asc") {
      items.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    } else if (sort === "price_desc") {
      items.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
    } else if (sort === "store_asc" || sort === "store_desc") {
      items.sort((a, b) =>
        sort === "store_asc"
          ? (a.store || "").localeCompare(b.store || "")
          : (b.store || "").localeCompare(a.store || "")
      );
    } else {
      // alap okos rangsor
      items = items.map(d => ({ d, s: scoreDeal(d) }))
                   .sort((a, b) => b.s - a.s)
                   .map(x => x.d);
    }

    // --- 5) Meta + paginálás
    const whs: string[] = [];         // Ali-nál nincs raktár infónk katalógusban
    const stores = ["AliExpress"];

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
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=120, stale-while-revalidate=30",
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
