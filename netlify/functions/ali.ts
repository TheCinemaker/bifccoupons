// netlify/functions/ali.ts

import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import axios, { AxiosError } from "axios";

// ===== Types & Utils =====
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

const md5 = (s: string) => crypto.createHash("md5").update(s, "utf8").digest("hex");
const etagOf = (json: string) => md5(json);

function toISO(d?: any): string | undefined {
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt.getTime()) ? undefined : dt.toISOString();
}

function parseMoney(v: any): number | undefined {
  if (v == null) return;
  let s = String(v).trim();
  if (!s) return;
  // normalizálás: szóközök, non-digit, pont/vessző
  s = s.replace(/\u00A0/g, " ").replace(/\s+/g, "");
  const hasC = s.includes(","), hasD = s.includes(".");
  if (hasC && !hasD) s = s.replace(",", ".");
  else if (hasC && hasD) {
    // ezreselválasztó/pont-vessző kezelés
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  }
  s = s.replace(/[^\d.]/g, "");
  const parts = s.split(".");
  if (parts.length > 2) { const dec = parts.pop(); s = parts.join("") + "." + dec; }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeUrl(u?: string): string | undefined {
  if (!u) return;
  const withProto = u.startsWith("//") ? `https:${u}` : u;
  const https = withProto.replace(/^http:/i, "https:");
  try { return encodeURI(https); } catch { return https; }
}

function mapAliItem(p: any): Deal {
  const price = parseMoney(p.target_sale_price ?? p.app_sale_price ?? p.sale_price);
  const orig  = parseMoney(p.target_original_price ?? p.original_price);
  const cur   = String(p.target_currency || p.currency || p.app_sale_price_currency || "USD");
  const img   = normalizeUrl(p.product_main_image_url || p.image_url);
  const link  = normalizeUrl(p.promotion_link || p.product_url) || "#";

  return {
    id: `ali:${p.product_id || md5(p.product_url || p.product_title || JSON.stringify(p).slice(0,80))}`,
    src: "aliexpress",
    store: "AliExpress",
    title: String(p.product_title || p.product_name || "AliExpress product"),
    url: link,
    image: img,
    price, orig, cur,
    code: p.coupon_code || undefined,
    wh: p.ship_from_country || undefined,
    updated: toISO(Date.now()),
    tags: p.product_category_name ? [String(p.product_category_name)] : [],
  };
}

// ===== Sign (Business Interface /sync, HMAC-SHA256, ms timestamp) =====
function signSync(allParamsNoSign: Record<string, string>, appSecret: string): string {
  const keys = Object.keys(allParamsNoSign)
    .filter(k => k !== "sign" && allParamsNoSign[k] != null)
    .sort(); // ASCII
  const toSign = keys.map(k => `${k}${allParamsNoSign[k]}`).join("");
  return crypto.createHmac("sha256", appSecret)
    .update(toSign, "utf8")
    .digest("hex")
    .toUpperCase();
}

// ===== /sync hívás (kis retry-vel) =====
async function callAliSync(
  method: string,
  apiParams: Record<string, any>,
  creds: { appKey: string; appSecret: string },
  timeoutMs = 12000,
  retries = 1
) {
  // minden business param string
  const apiStr: Record<string, string> = Object.fromEntries(
    Object.entries(apiParams)
      .filter(([, v]) => v != null)
      .map(([k, v]) => [k, String(v)])
  );

  const baseNoSign: Record<string, string> = {
    app_key: creds.appKey,
    format: "json",
    sign_method: "sha256",
    timestamp: String(Date.now()),  // ms!
    method,                         // része a sign-nak
    ...apiStr,
  };

  const sign = signSync(baseNoSign, creds.appSecret);
  const params = { ...baseNoSign, sign };

  let lastErr: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data } = await axios.get("https://api-sg.aliexpress.com/sync", {
        params,
        timeout: timeoutMs,
      });
      if (data?.error_response) {
        const msg = data.error_response?.msg || data.error_response?.sub_msg || "AliExpress API hiba";
        const code = data.error_response?.code || data.error_response?.sub_code || "?";
        throw new Error(`${msg} (code: ${code})`);
      }
      const topKey = Object.keys(data)[0];
      const result = data?.[topKey]?.
