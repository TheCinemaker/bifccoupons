// netlify/functions/ali.ts

import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import axios, { AxiosError } from "axios";
import http from "http";
import https from "https";

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
  const httpsUrl = withProto.replace(/^http:/i, "https:");
  try { return encodeURI(httpsUrl); } catch { return httpsUrl; }
}

// Shanghai timestamp (YYYY-MM-DD HH:mm:ss)
function shanghaiTimestamp(): string {
  const t = new Date(Date.now() + 8 * 3600 * 1000); // UTC+8
  return t.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * TOP (Affiliate) aláírás:
 * - v=2.0, sign_method=md5, format=json, method, app_key, timestamp (Asia/Shanghai), + API paramok
 * - kulcs szerint ASCII/ABC sorrend, 'sign' kihagyva
 * - secret + (k1v1k2v2...) + secret -> MD5 -> UPPERCASE
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

// ------- Axios kliens Keep-Alive + default header -------
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 10 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });

const ax = axios.create({
  timeout: 10000, // per próbálkozás
  httpAgent,
  httpsAgent,
  headers: {
    // néhány edge esetben segít
    "User-Agent": "KinabolVeddMeg/1.0 (+netlify-functions; axios)",
    "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
  },
});

// Két hivatalos TOP gateway (első a preferált)
const GATEWAYS = [
  "https://gw.api.taobao.com/router/rest",
  "https://eco.taobao.com/router/rest",
];

// Egyszerű exponenciális visszavárás
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * TOP hívás retry-val és gateway rotációval.
 * Próbák: max 3 (pl. 10s + 12s + 14s), összesen ~36s-ig. (Netlify Pro 26s limitnél állítsd kisebbre.)
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

  const baseNoSign: Record<string, string> = {
    method,
    app_key: ALIEXPRESS_APP_KEY,
    sign_method: "md5",
    timestamp: shanghaiTimestamp(), // "YYYY-MM-DD HH:mm:ss"
    format: "json",
    v: "2.0",
    ...apiStr,
  };
  const sign = signTOP(baseNoSign);
  const body = new URLSearchParams({ ...baseNoSign, sign }).toString();

  let lastErr: any = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const gw = GATEWAYS[attempt % GATEWAYS.length];
    const perTryTimeout = 10000 + attempt * 2000; // 10s, 12s, 14s

    try {
      const { data } = await ax.post(gw, body, { timeout: perTryTimeout });
      if (data?.error_response) {
        const msg = data.error_response?.sub_msg || data.error_response?.msg || "AliExpress API hiba";
        const code = data.error_response?.code || data.error_response?.sub_code || "?";
        throw new Error(`${msg} (code: ${code})`);
      }
      const topKey = Object.keys(data)[0];
      const result = data?.[topKey]?.result;
      if (!result || result?.resp_code !== 200) {
        throw new Error(`AliExpress API hiba: ${result?.resp_msg || "Ismeretlen"}`);
      }
      return result; // SIKER
    } catch (e: any) {
      lastErr = e;
      const isTimeout =
        (e as AxiosError).code === "ECONNABORTED" ||
        /timeout/i.test((e as Error).message || "");
      const isNetwork =
        (e as AxiosError).code === "ENOTFOUND" ||
        (e as AxiosError).code === "EAI_AGAIN" ||
        (e as AxiosError).code === "ECONNRESET";

      // csak hálózati/timeout hibáknál próbáljunk újra
      if (attempt < 2 && (isTimeout || isNetwork)) {
        await sleep(300 + attempt * 400); // 300ms, 700ms
        continue;
      }
      // ha API hibakód, ne ismételjünk feleslegesen
      break;
    }
  }

  throw lastErr || new Error("Ismeretlen hiba a TOP hívás során");
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
    const limit = Math.max(1, Math.min(50, parseInt(qs.get("limit") || "40", 10))); // kicsit lejjebb, hogy gyorsabb legyen
    const wantTop = ["1", "true", "yes"].includes((qs.get("top") || "").toLowerCase());
    const sort = (qs.get("sort") || "").toLowerCase();

    let rawItems: any[] = [];
    let totalItems = 0;

    if (wantTop && !q) {
      console.log("[ali.ts] Top termékek kérése (TOP gateway, retry)");
      const res = await callAliTOP("aliexpress.affiliate.hotproduct.query", {
        tracking_id: String(ALIEXPRESS_TRACKING_ID),
        page_size: String(limit),
        target_currency: "USD",
        target_language: "EN",
      });
      rawItems = res.products?.product || [];
      totalItems = res.total_record_count || (rawItems?.length || 0);

    } else if (q) {
      console.log(`[ali.ts] Keresés (TOP gateway, retry): "${q}"`);
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
