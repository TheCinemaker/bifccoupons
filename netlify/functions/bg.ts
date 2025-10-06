// netlify/functions/bg.ts
import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import axios from "axios";

/* ================= Types ================= */
type Deal = {
  id: string;
  src: "banggood";
  store: "Banggood";
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
const { BANGGOOD_API_KEY, BANGGOOD_API_SECRET, BANGGOOD_AFFILIATE_PARAM } = process.env;

/* ============ In-memory cache =========== */
let ACCESS_TOKEN: { token: string; ts: number } | null = null;
let LAST_JSON = "";
let LAST_ETAG = "";

const TOKEN_TTL = 50 * 60 * 1000; // 50 perc
const PAGE_CAP  = 5;              // max 5 oldal / request

/* ================ Utils ================= */
const md5 = (s: string) => crypto.createHash("md5").update(s).digest("hex");
const etagOf = (json: string) => md5(json);

function sign(params: Record<string, any>) {
  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&");
  return md5(sorted);
}
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
  const https = u.replace(/^http:/i, "https:");
  try { return encodeURI(https); } catch { return https; }
}
function appendAffiliate(u: string): string {
  const p = (BANGGOOD_AFFILIATE_PARAM || "").trim();
  if (!p) return u;
  return u.includes("?") ? `${u}&p=${encodeURIComponent(p)}` : `${u}?p=${encodeURIComponent(p)}`;
}
function scoreDeal(d: Deal): number {
  let score = 0;
  if ((d.wh || "").toUpperCase() !== "CN") score += 10;
  if (d.end) {
    const days = Math.max(0, (new Date(d.end).getTime() - Date.now()) / 86400000);
    score += 10 - Math.min(10, days);
  }
  if (d.price && d.orig && d.price < d.orig) {
    const disc = 100 * (1 - d.price / d.orig);
    score += Math.min(8, Math.max(0, disc / 5));
  }
  return score;
}

/* ========== Banggood auth/token ========= */
async function getAccessToken(): Promise<string> {
  if (!BANGGOOD_API_KEY || !BANGGOOD_API_SECRET) throw new Error("BG API env hiányzik");
  const now = Date.now();
  if (ACCESS_TOKEN && (now - ACCESS_TOKEN.ts) < TOKEN_TTL) return ACCESS_TOKEN.token;

  const timestamp = Math.floor(now / 1000);
  const noncestr = Math.random().toString(36).slice(2);
  const signature = sign({ api_key: BANGGOOD_API_KEY, api_secret: BANGGOOD_API_SECRET, noncestr, timestamp });

  const { data } = await axios.get("https://affapi.banggood.com/getAccessToken", {
    params: { api_key: BANGGOOD_API_KEY, noncestr, timestamp, signature },
    timeout: 8000,
  });

  const token = data?.result?.access_token;
  if (!token) throw new Error("Nem kaptunk access_token-t");
  ACCESS_TOKEN = { token, ts: now };
  return token;
}

/* ============== Coupons API ============== */
async function fetchCouponPage(token: string, page: number) {
  const { data } = await axios.get("https://affapi.banggood.com/coupon/list", {
    headers: { "access-token": token },
    params: { type: 2, page },
    timeout: 10000,
  });
  return data?.result || {};
}

function mapCouponToDeal(c: any): Deal {
  let name: string =
    (c.promo_link_standard || "")
      .split("/")
      .pop()
      ?.replace(/-/g, " ")
      ?.replace(/\?.*$/g, "")
      ?.replace(/!.*$/g, "") || c.only_for || "Banggood deal";

  const stdRaw: string = c.promo_link_standard || "";
  const shortRaw: string = c.promo_link_short || "";
  const shortHttps = shortRaw ? shortRaw.replace(/^http:/i, "https:") : "";
  const safeStd = normalizeUrl(stdRaw) || "";
  const finalUrl = appendAffiliate(shortHttps || safeStd || "#");

  return {
    id: `banggood:${md5(`${c.promo_link_standard || ""}|${c.coupon_code || ""}`)}`,
    src: "banggood",
    store: "Banggood",
    title: name,
    image: normalizeUrl(c.coupon_img) || undefined,
    url: finalUrl,
    short: shortHttps || undefined,
    price: parseMoney(c.condition) ?? parseMoney(c.original_price),
    orig: parseMoney(c.original_price),
    cur: c.currency || "USD",
    code: c.coupon_code || undefined,
    wh: c.warehouse || undefined,
    start: toISO(c.coupon_date_start),
    end: toISO(c.coupon_date_end),
    updated: toISO(Date.now()),
    tags: [],
    residual: c.coupon_residual ? Number(c.coupon_residual) : undefined,
  };
}

/* ============== Catalog (HTML) fallback ==============
   - Közvetlenül a banggood.com/search/{q}.html oldalról próbálunk termékeket kinyerni.
   - Akamai néha 403-at dob; próbálunk "böngésző" UA-val.
   - Ha nem megy, legalább 1 “keresés” kártyát visszaadunk. */
async function fetchBgCatalog(q: string, limit = 24): Promise<Deal[]> {
  const base = `https://www.banggood.com/search/${encodeURIComponent(q)}.html`;
  const searchUrl = appendAffiliate(base);

  try {
    const { data: html, status } = await axios.get(searchUrl, {
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      // fontos: ne kövessünk 301→http
      maxRedirects: 3,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    if (status >= 300) throw new Error(`HTTP ${status}`);

    const products: Deal[] = [];
    const used = new Set<string>();

    // 1) robust: keressük a -p-12345.html mintájú termék linkeket
    const reLink = /href="([^"]+?-p-\d+\.html[^"]*)"/gi;
    let m: RegExpExecArray | null;
    while ((m = reLink.exec(html)) && products.length < limit) {
      let href = m[1];
      if (!href.startsWith("http")) {
        // relatív → abszolút
        href = "https://www.banggood.com" + (href.startsWith("/") ? "" : "/") + href;
      }
      // dedupe URL alapján
      const key = href.split("?")[0];
      if (used.has(key)) continue;
      used.add(key);

      // cím kinyerése (próbáljuk alt/title; ha nincs, a slugból)
      // keresünk közelben alt/title-t
      const around = html.slice(Math.max(0, m.index - 500), Math.min(html.length, m.index + 800));
      let titleMatch =
        /alt="([^"]{5,120})"/i.exec(around)?.[1] ||
        /title="([^"]{5,120})"/i.exec(around)?.[1];
      if (!titleMatch) {
        // slug → nice text
        const slug = href.split("/").pop() || "";
        titleMatch = decodeURIComponent(slug.replace(/-/g, " ").replace(/\?.*$/, "").replace(/\.html$/i, ""));
      }

      // kép kinyerése (data-original | src)
      let imgMatch =
        /data-original="(https?:\/\/[^"]+\.(?:jpe?g|png|webp)[^"]*)"/i.exec(around)?.[1] ||
        /src="(https?:\/\/[^"]+\.(?:jpe?g|png|webp)[^"]*)"/i.exec(around)?.[1];

      // ár kinyerése (USD/EUR szám)
      let priceMatch =
        /(?:USD|US\$|\$|EUR|€)\s*([0-9][\d.,\s]{0,12})/i.exec(around)?.[1] ||
        /price[^>]*>\s*([0-9][\d.,\s]{0,12})/i.exec(around)?.[1];

      products.push({
        id: `banggood:catalog:${md5(href)}`,
        src: "banggood",
        store: "Banggood",
        title: titleMatch.trim(),
        url: appendAffiliate(normalizeUrl(href) || href),
        image: normalizeUrl(imgMatch || ""),
        price: parseMoney(priceMatch),
        orig: undefined,
        cur: "USD",
        updated: toISO(Date.now()),
        tags: [],
      });
    }

    if (products.length) return products;

    // ha semmit se tudtunk kinyerni, adjunk legalább egy keresés-link kártyát
    return [{
      id: `banggood-search:${md5(q)}`,
      src: "banggood",
      store: "Banggood",
      title: `Banggood keresés: “${q}”`,
      url: searchUrl,
      updated: toISO(Date.now()),
      cur: "USD",
      tags: [],
    }];
  } catch {
    // Akamai / 403 eset – minimális fallback
    return [{
      id: `banggood-search:${md5(q)}`,
      src: "banggood",
      store: "Banggood",
      title: `Banggood keresés: “${q}”`,
      url: searchUrl,
      updated: toISO(Date.now()),
      cur: "USD",
      tags: [],
    }];
  }
}

/* ============== Handler ============== */
export const handler: Handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const ifNoneMatch = event.headers["if-none-match"];

    const q = (qs.get("q") || "").trim();
    const whFilter = (qs.get("wh") || "").toUpperCase();
    const minPrice = qs.get("minPrice") ? Number(qs.get("minPrice")) : undefined;
    const maxPrice = qs.get("maxPrice") ? Number(qs.get("maxPrice")) : undefined;
    const sort = (qs.get("sort") || "").toLowerCase();
    const limit = Math.max(1, Math.min(200, parseInt(qs.get("limit") || "100", 10)));
    const cursor = qs.get("cursor");
    const pageDepth = Math.max(1, Math.min(PAGE_CAP, parseInt(qs.get("pages") || "3", 10)));
    const wantCatalog = ["1","true","yes"].includes((qs.get("catalog") || "").toLowerCase());

    // token + kuponok
    const token = await getAccessToken();
    let page = 1, pages = 1;
    const allCoupons: any[] = [];
    while (page <= pages && page <= pageDepth) {
      const res = await fetchCouponPage(token, page);
      const list: any[] = res?.coupon_list || [];
      pages = res?.page_total || page;
      allCoupons.push(...list);
      page++;
    }

    // map → Deal
    let items: Deal[] = allCoupons.map(mapCouponToDeal);

    // ha keresünk és kérik a katalógust is → húzzuk be a BG kereső találatait
    if (q && wantCatalog) {
      const catalogItems = await fetchBgCatalog(q, Math.max(12, Math.min(60, limit)));
      // merge (dedupe url alapú)
      const seen = new Set(items.map(d => (d.url || "").split("?")[0]));
      for (const it of catalogItems) {
        const key = (it.url || "").split("?")[0];
        if (!seen.has(key)) {
          items.push(it);
          seen.add(key);
        }
      }
    }

    // szűrések
    if (q) {
      const ql = q.toLowerCase();
      items = items.filter(d =>
        (d.title || "").toLowerCase().includes(ql) ||
        (d.code || "").toLowerCase().includes(ql)
      );
    }
    if (whFilter) items = items.filter(d => (d.wh || "").toUpperCase() === whFilter);
    if (typeof minPrice === "number") items = items.filter(d => (d.price ?? Infinity) >= minPrice);
    if (typeof maxPrice === "number") items = items.filter(d => (d.price ?? 0) <= maxPrice);

    // rendezés
    if (sort === "price_asc") {
      items.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    } else if (sort === "price_desc") {
      items.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
    } else {
      items = items.map(d => ({ d, s: scoreDeal(d) }))
                   .sort((a, b) => b.s - a.s)
                   .map(x => x.d);
    }

    // meta (raktárak)
    const whs = Array.from(new Set(items.map(x => x.wh).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
    const stores = ["Banggood"];

    // lapozás
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
