import type { Handler } from "@netlify/functions";
import { URL } from "url";

const {
  BANGGOOD_AFFILIATE_PARAM,         // pl. "ED23236044949201608N"
  UTM_SOURCE = "kvbm",
  UTM_MEDIUM = "pwa",
  UTM_CAMPAIGN = "coupons",
} = process.env;

function isBanggood(u: URL) {
  return /(^|\.)banggood\.com$/i.test(u.hostname);
}

function ensureHttps(u: URL) {
  if (u.protocol === "http:") u.protocol = "https:";
}

function addQueryParam(u: URL, key: string, value?: string | null) {
  if (!value) return;
  if (!u.searchParams.has(key)) u.searchParams.set(key, value);
}

export const handler: Handler = async (event) => {
  try {
    const uRaw = event.queryStringParameters?.u || "";
    if (!uRaw) return { statusCode: 400, body: "Missing u" };

    const src = event.queryStringParameters?.src || "";   // opcionális méréshez
    const code = event.queryStringParameters?.code || ""; // opcionális méréshez

    // céllink felépítése
    const target = new URL(uRaw, "https://example.com");
    if (!/^https?:/i.test(target.protocol)) {
      // ha relatív vagy rossz protocol jött, dobjuk vissza
      return { statusCode: 400, body: "Invalid URL" };
    }
    ensureHttps(target);

    // —— Affiliate param: BANGGOOD ——
    if (isBanggood(target) && BANGGOOD_AFFILIATE_PARAM) {
      // csak akkor tesszük rá, ha MÉG NINCS "p=" a linken
      if (!target.searchParams.has("p")) {
        target.searchParams.set("p", BANGGOOD_AFFILIATE_PARAM);
      }
    }

    // —— UTM-ek (nem írjuk felül, ha már vannak) ——
    addQueryParam(target, "utm_source", UTM_SOURCE);
    addQueryParam(target, "utm_medium", UTM_MEDIUM);
    addQueryParam(target, "utm_campaign", UTM_CAMPAIGN);
    if (src) addQueryParam(target, "utm_content", src.toString());
    if (code) addQueryParam(target, "coupon", code.toString());

    return {
      statusCode: 302,
      headers: {
        Location: target.toString(),
        "Cache-Control": "no-store",
      },
      body: "",
    };
  } catch (e: any) {
    return { statusCode: 500, body: e?.message || "go error" };
  }
};
