// netlify/functions/bg.ts

import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import axios from "axios";

// Típusok és alap segédfüggvények (változatlan)
type Deal = { id: string; src: "banggood"; store: "Banggood"; title: string; url: string; image?: string; price?: number; orig?: number; cur?: string; code?: string; wh?: string; updated?: string; };
const md5 = (s: string) => crypto.createHash("md5").update(s).digest("hex");
function toISO(d?: any) { if (!d) return undefined; const dt = new Date(d); return isNaN(dt.getTime()) ? undefined : dt.toISOString(); }
function parseMoney(v: any): number | undefined { if (v==null) return undefined; let s=String(v).trim().replace(/[^\d.,]/g,'').replace(',','.'); const n=parseFloat(s); return isFinite(n)?n:undefined; }
function normalizeUrl(u?: string): string | undefined { if (!u) return undefined; const https = u.replace(/^http:/i, "https:"); try { return encodeURI(https); } catch { return https; } }
function sign(params: Record<string, any>) { const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&"); return md5(sorted); }

// Access Token (változatlan)
let ACCESS_TOKEN: { token: string; ts: number } | null = null;
const TOKEN_TTL = 50 * 60 * 1000;
async function getAccessToken(key:string, secret:string): Promise<string> {
    const now = Date.now();
    if (ACCESS_TOKEN && (now - ACCESS_TOKEN.ts) < TOKEN_TTL) return ACCESS_TOKEN.token;
    const timestamp = Math.floor(now / 1000);
    const noncestr = Math.random().toString(36).slice(2);
    const signature = sign({ api_key: key, api_secret: secret, noncestr, timestamp });
    const { data } = await axios.get("https://affapi.banggood.com/getAccessToken", { params: { api_key: key, noncestr, timestamp, signature } });
    const token = data?.result?.access_token;
    if (!token) throw new Error("BG Access Token hiba");
    ACCESS_TOKEN = { token, ts: now };
    return token;
}

// Mapping függvények (változatlan)
function mapProductToDeal(p: any): Deal { return { id: `bg-prod:${p.product_id}`, src: "banggood", store: "Banggood", title: p.product_name, url: p.product_url, image: normalizeUrl(p.view_image), price: parseMoney(p.product_coupon_price ?? p.product_price), orig: parseMoney(p.product_price), cur: "USD", code: p.coupon_code || undefined, updated: toISO(Date.now()) }; }
function mapCouponToDeal(c: any): Deal { return { id: `bg-coup:${md5(c.promo_link_standard)}`, src: "banggood", store: "Banggood", title: c.only_for, url: c.promo_link_standard, image: normalizeUrl(c.coupon_img), price: parseMoney(c.condition) ?? parseMoney(c.original_price), orig: parseMoney(c.original_price), cur: c.currency || "USD", code: c.coupon_code, wh: c.warehouse, updated: toISO(Date.now()) }; }


export const handler: Handler = async (event) => {
    // ---- DIAGNOSZTIKA ELEJE ----
    const BANGGOOD_API_KEY = process.env.BANGGOOD_API_KEY;
    const BANGGOOD_API_SECRET = process.env.BANGGOOD_API_SECRET;
    
    console.log(`[bg.ts] Handler indul. API kulcs betöltve: ${!!BANGGOOD_API_KEY}, Secret betöltve: ${!!BANGGOOD_API_SECRET}`);
    if (!BANGGOOD_API_KEY || !BANGGOOD_API_SECRET) {
        return { statusCode: 500, body: JSON.stringify({ error: "Banggood API kulcsok hiányoznak a szerver oldalon!" }) };
    }
    // ---- DIAGNOSZTIKA VÉGE ----

    try {
        const qs = new URLSearchParams(event.queryStringParameters || {});
        const q = (qs.get("q") || "").trim();
        const wantTop = ["1", "true", "yes"].includes((qs.get("top") || "").toLowerCase());
        const limit = parseInt(qs.get("limit") || "100", 10);

        console.log(`[bg.ts] Mód: Keresőszó="${q}", Top kérés=${wantTop}`);
        
        const token = await getAccessToken(BANGGOOD_API_KEY, BANGGOOD_API_SECRET);
        let finalDeals: Deal[] = [];

        // 1. ESET: Keresés van
        if (q) {
            console.log(`[bg.ts] Termékkeresés indul a(z) "/product/list"-en...`);
            let productResults = [];
            try {
                const { data } = await axios.get("https://affapi.banggood.com/product/list", { headers: { "access-token": token }, params: { keyword: q, page: 1 } });
                productResults = data?.result?.product_list || [];
                console.log(`[bg.ts] "/product/list" API válasz: ${productResults.length} db termék`);
                finalDeals.push(...productResults.map(mapProductToDeal));
            } catch (e: any) {
                console.error("[bg.ts] Hiba a /product/list hívása közben:", e.message);
            }

            console.log(`[bg.ts] Kuponkeresés indul a(z) "/coupon/list"-en...`);
            let couponResults = [];
            try {
                const { data } = await axios.get("https://affapi.banggood.com/coupon/list", { headers: { "access-token": token }, params: { type: 2, page: 1 } });
                couponResults = data?.result?.coupon_list || [];
                const relevantCoupons = couponResults.filter((c: any) => (c.only_for || "").toLowerCase().includes(q.toLowerCase()));
                console.log(`[bg.ts] "/coupon/list" API válasz: ${couponResults.length} kupon, ebből releváns: ${relevantCoupons.length} db`);
                finalDeals.push(...relevantCoupons.map(mapCouponToDeal));
            } catch(e: any) {
                console.error("[bg.ts] Hiba a /coupon/list hívása közben:", e.message);
            }
        }
        // 2. ESET: Top termékek kérése
        else if (wantTop) {
            console.log(`[bg.ts] Top termékek kérése a(z) "/product/list"-ről (sort=hot)`);
            const { data } = await axios.get("https://affapi.banggood.com/product/list", { headers: { "access-token": token }, params: { keyword: "", page: 1, sort: "hot" } });
            const rawProducts = data?.result?.product_list || [];
            console.log(`[bg.ts] Top termékek API válasz: ${rawProducts.length} db`);
            finalDeals = rawProducts.slice(0, limit).map(mapProductToDeal);
        }

        const seen = new Set<string>();
        const uniqueDeals = finalDeals.filter(d => { const key = `${d.url}|${d.code||""}`; if (seen.has(key)) return false; seen.add(key); return true; });
        console.log(`[bg.ts] Végleges, egyedi találatok: ${uniqueDeals.length}`);
        
        const payload = { count: uniqueDeals.length, items: uniqueDeals, meta: {} };
        return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };

    } catch (e: any) {
        console.error("[bg.ts] Végzetes hiba a handlerben:", e.message);
        return { statusCode: 500, body: JSON.stringify({ error: e.message || "Ismeretlen szerverhiba" }) };
    }
};
