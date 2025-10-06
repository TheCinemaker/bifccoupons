import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import axios from "axios";

/* ===== Types ===== */
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
};

const { ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET, ALIEXPRESS_TRACKING_ID } = process.env;

const toISO = (d?: any) => (d ? new Date(d).toISOString() : undefined);
function parseMoney(v: any): number | undefined {
  if (v==null) return;
  let s=String(v).trim().replace(/[^\d.,]/g,'');
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  else if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  }
  const n=parseFloat(s);
  return isFinite(n)?n:undefined;
}
function normalizeUrl(u?: string) {
  if(!u) return;
  const p=u.startsWith("//")?`https:${u}`:u;
  return encodeURI(p.replace(/^http:/i,"https:"));
}
function mapAliItem(p: any): Deal {
  return {
    id: `ali:${p.product_id}`,
    src: "aliexpress",
    store: "AliExpress",
    title: p.product_title,
    url: normalizeUrl(p.promotion_link) || "#",
    image: normalizeUrl(p.product_main_image_url),
    price: parseMoney(p.target_sale_price),
    orig: parseMoney(p.target_original_price ?? p.original_price),
    cur: p.target_sale_price_currency || "USD",
    code: undefined,
    wh: p.ship_from_country,
    updated: toISO(Date.now()),
  };
}

async function callAli(method: string, apiParams: Record<string, any>) {
  if (!ALIEXPRESS_APP_KEY || !ALIEXPRESS_APP_SECRET || !ALIEXPRESS_TRACKING_ID) {
    throw new Error("AliExpress API konfigurációs hiba.");
  }

  const commonParams: Record<string, string> = {
    app_key: ALIEXPRESS_APP_KEY,
    sign_method: "sha256",
    timestamp: String(Date.now()),
    method,
    ...Object.fromEntries(Object.entries(apiParams).map(([k, v]) => [k, String(v)])),
  };

  // Helyes aláírás: kulcsok ABC-sorrendben, concat key+value, HMAC-SHA256(secret), hex upper
  const sorted = Object.keys(commonParams).sort();
  const stringToSign = sorted.map(k => `${k}${commonParams[k]}`).join("");
  const sign = crypto.createHmac("sha256", ALIEXPRESS_APP_SECRET!).update(stringToSign).digest("hex").toUpperCase();

  const { data } = await axios.get("https://api-sg.aliexpress.com/sync", {
    params: { ...commonParams, sign },
    timeout: 10000,
  });

  if (data?.error_response) {
    throw new Error(`${data.error_response.msg || "AliExpress API hiba"} (code: ${data.error_response.code || "?"})`);
  }

  const responseKey = method.replace(/\./g, "_") + "_response";
  const result = data?.[responseKey]?.result;
  if (!result || result.resp_code !== 200) {
    throw new Error(result?.resp_msg || "AliExpress API hiba: ismeretlen válasz");
  }
  return result;
}

/* ===== Handler ===== */
export const handler: Handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const q = (qs.get("q") || "").trim();
    const wantTop = ["1","true","yes"].includes((qs.get("top") || "").toLowerCase());
    const limit = Math.min(100, parseInt(qs.get("limit") || "50", 10));

    let method = "";
    let params: Record<string, any> = {
      tracking_id: ALIEXPRESS_TRACKING_ID,
      target_currency: "USD",
      target_language: "EN",
      page_size: String(limit),
    };

    if (q) {
      method = "aliexpress.affiliate.product.query";
      params.keywords = q;
    } else if (wantTop) {
      method = "aliexpress.affiliate.hotproduct.query";
    } else {
      return { statusCode: 200, headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ count: 0, items: [] }) };
    }

    const result = await callAli(method, params);
    const rawItems = result.products?.product || [];
    const items: Deal[] = rawItems.map(mapAliItem);

    return { statusCode: 200, headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ count: items.length, items, meta: { stores: ["AliExpress"], warehouses: [] } }) };
  } catch (e:any) {
    return { statusCode: 500, headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ error: e?.message || "Server error" }) };
  }
};
