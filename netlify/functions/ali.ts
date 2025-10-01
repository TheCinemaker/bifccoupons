// netlify/functions/ali.ts
import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import axios from "axios";

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

const {
  ALIEXPRESS_APP_KEY,
  ALIEXPRESS_APP_SECRET,
  ALIEXPRESS_TRACKING_ID,
} = process.env;

let LAST_JSON = ""; let LAST_ETAG = "";

const PAGE_CAP = 5;         // katalógus keresés max 5 oldal
const PAGE_SIZE = 40;       // 40/db oldal
const HOT_TARGET = 200;     // top hypolt cél darabszám

const md5 = (s: string) => crypto.createHash("md5").update(s).digest("hex");
const etagOf = (json: string) => md5(json);

function toISO(d?: string | number | Date) { if (!d) return undefined; const dt = new Date(d); return isNaN(dt.getTime()) ? undefined : dt.toISOString(); }
function parseMoney(v: any): number | undefined {
  if (v == null) return undefined;
  let s = String(v).trim(); if (!s) return undefined;
  s = s.replace(/\u00A0/g," ").replace(/\s+/g,"");
  const hasC = s.includes(","), hasD = s.includes(".");
  if (hasC && !hasD) s = s.replace(",",".");
  else if (hasC && hasD) { if (s.lastIndexOf(",")>s.lastIndexOf(".")) s = s.replace(/\./g,"").replace(",","."); else s = s.replace(/,/g,""); }
  s = s.replace(/[^\d.]/g,""); const parts = s.split("."); if (parts.length>2){ const dec=parts.pop(); s=parts.join("")+"."+dec; }
  const num = parseFloat(s); return Number.isFinite(num)?num:undefined;
}
function normalizeUrl(u?: string): string | undefined {
  if (!u) return undefined;
  const withProto = u.startsWith("//") ? `https:${u}` : u;
  const https = withProto.replace(/^http:/i, "https:");
  try { return encodeURI(https); } catch { return https; }
}
function scoreDeal(d: Deal): number {
  let s = 0;
  if (d.code) s += 12;
  if (d.price && d.orig && d.price < d.orig) { const disc = 100*(1-d.price/d.orig); s += Math.min(8, Math.max(0, disc/5)); }
  return s;
}

function signAli(params: Record<string,string>): string {
  if (!ALIEXPRESS_APP_SECRET) throw new Error("ALIEXPRESS_APP_SECRET hiányzik");
  const keys = Object.keys(params).sort();
  const qs = keys.map(k=>`${k}${params[k]}`).join("");
  const base = ALIEXPRESS_APP_SECRET + qs;
  return crypto.createHmac("sha256", ALIEXPRESS_APP_SECRET).update(base).digest("hex").toUpperCase();
}

async function callAli(method: string, apiParams: Record<string, any>) {
  if (!ALIEXPRESS_APP_KEY || !ALIEXPRESS_APP_SECRET || !ALIEXPRESS_TRACKING_ID) {
    throw new Error("AliExpress API környezeti változók hiányoznak");
  }
  const common: Record<string,string> = {
    app_key: ALIEXPRESS_APP_KEY,
    sign_method: "sha256",
    timestamp: String(Date.now()),
    format: "json",
    method,
    ...Object.fromEntries(Object.entries(apiParams).map(([k,v])=>[k,String(v)])),
  };
  const sign = signAli(common);
  const { data } = await axios.get("https://api-sg.aliexpress.com/sync", { params: { ...common, sign }, timeout: 15000 });
  if (data?.error_response) throw new Error(`${data.error_response?.msg || "AliExpress API hiba"} (code: ${data.error_response?.code || "?"})`);
  const topKey = Object.keys(data)[0];
  const result = data?.[topKey]?.result;
  if (!result || result.resp_code !== 200) throw new Error(`AliExpress API hiba: ${result?.resp_msg || "Ismeretlen"}`);
  return result;
}

function mapAliItem(p:any): Deal {
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
    updated: toISO(Date.now()),
    tags: [],
  };
}

async function fetchAliCatalog(keyword: string, page: number, pageSize: number) {
  const res = await callAli("aliexpress.affiliate.product.query", {
    keywords: keyword,
    tracking_id: ALIEXPRESS_TRACKING_ID!,
    page_no: page,
    page_size: pageSize,
    sort: "LAST_VOLUME_DESC", // „hypolt”: eladási volumen szerinti
  });
  const list = res.products?.product || res.products || [];
  return Array.isArray(list) ? list : [];
}

// próbálunk „hot products”-t; ha nem megy, fallback volumennel
async function fetchAliTopHot(targetCount = HOT_TARGET) {
  const out:any[] = [];
  // 1) próba: hot product API (ha nincs, hibát dob → fallback)
  try {
    let page = 1;
    while (out.length < targetCount && page <= PAGE_CAP) {
      const r = await callAli("aliexpress.affiliate.hotproduct.query", {
        tracking_id: ALIEXPRESS_TRACKING_ID!,
        page_no: page,
        page_size: PAGE_SIZE,
      });
      const arr = r.products?.product || r.products || [];
      if (!arr?.length) break;
      out.push(...arr);
      page++;
    }
  } catch {
    // 2) fallback: kulcsszó nélküli toplista (különböző általános kulcsszavakkal)
    const seeds = ["", "electronics", "gadget", "smart", "hot"];
    for (const kw of seeds) {
      let page = 1;
      while (out.length < targetCount && page <= PAGE_CAP) {
        const arr = await fetchAliCatalog(kw, page, PAGE_SIZE);
        if (!arr.length) break;
        out.push(...arr);
        page++;
      }
      if (out.length >= targetCount) break;
    }
  }
  return out.slice(0, targetCount);
}

export const handler: Handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const ifNoneMatch = event.headers["if-none-match"];

    const q = (qs.get("q") || "").trim();
    const qLower = q.toLowerCase();
    const minPrice = qs.get("minPrice") ? Number(qs.get("minPrice")) : undefined;
    const maxPrice = qs.get("maxPrice") ? Number(qs.get("maxPrice")) : undefined;
    const sort = (qs.get("sort") || "").toLowerCase();
    const limit = Math.max(1, Math.min(200, parseInt(qs.get("limit") || "100", 10)));
    const cursor = qs.get("cursor");
    const pages = Math.max(1, Math.min(PAGE_CAP, parseInt(qs.get("pages") || "2", 10)));
    const wantTop = ["1","true","yes"].includes((qs.get("top") || "").toLowerCase());

    // 1) adatgyűjtés
    const raw:any[] = [];
    if (wantTop && !q) {
      raw.push(...await fetchAliTopHot(200));
    } else if (q) {
      let p = 1;
      while (p <= pages) {
        const arr = await fetchAliCatalog(q, p, PAGE_SIZE);
        if (!arr.length) break;
        raw.push(...arr);
        p++;
      }
    }

    // 2) map + dedupe
    const seen = new Set<string>();
    let items: Deal[] = [];
    for (const it of raw) {
      const d = mapAliItem(it);
      const key = md5(`${d.url}|${d.code || ""}`);
      if (!seen.has(key)) { seen.add(key); items.push(d); }
    }

    // 3) front-kompat szűrések
    if (qLower) {
      items = items.filter(d =>
        d.title.toLowerCase().includes(qLower) ||
        (d.code || "").toLowerCase().includes(qLower)
      );
    }
    if (typeof minPrice === "number") items = items.filter(d => (d.price ?? Infinity) >= minPrice);
    if (typeof maxPrice === "number") items = items.filter(d => (d.price ?? 0) <= maxPrice);

    // 4) rendezés
    if (sort === "price_asc")      items.sort((a,b)=>(a.price ?? Infinity)-(b.price ?? Infinity));
    else if (sort === "price_desc")items.sort((a,b)=>(b.price ?? -Infinity)-(a.price ?? -Infinity));
    else if (sort === "store_asc" || sort === "store_desc") {
      items.sort((a,b)=> sort==="store_asc" ? (a.store||"").localeCompare(b.store||"") : (b.store||"").localeCompare(a.store||""));
    } else {
      items = items.map(d=>({d,s:scoreDeal(d)})).sort((a,b)=>b.s-a.s).map(x=>x.d);
    }

    // 5) meta + lapozás
    const whs:string[] = []; const stores = ["AliExpress"];
    const start = cursor ? parseInt(cursor,10)||0 : 0;
    const pageItems = items.slice(start, start+limit);
    const nextCursor = start+limit < items.length ? String(start+limit) : null;

    const payload = { count: items.length, items: pageItems, nextCursor, updatedAt: new Date().toISOString(), meta: { warehouses: whs, stores } };
    const json = JSON.stringify(payload); const etg = etagOf(json);
    if (ifNoneMatch && ifNoneMatch===etg) return { statusCode: 304, headers: { ETag: etg, "Cache-Control": "public, max-age=120, stale-while-revalidate=30" }, body: "" };

    LAST_JSON = json; LAST_ETAG = etg;
    return { statusCode: 200, headers: { "Content-Type":"application/json", "Cache-Control":"public, max-age=120, stale-while-revalidate=30", "ETag": etg }, body: json };
  } catch (e:any) {
    if (LAST_JSON) return { statusCode: 200, headers: { "Content-Type":"application/json", "Cache-Control":"public, max-age=60", "ETag": LAST_ETAG, "X-Fallback":"snapshot" }, body: LAST_JSON };
    return { statusCode: 500, body: JSON.stringify({ error: e?.message || "Server error" }) };
  }
};
