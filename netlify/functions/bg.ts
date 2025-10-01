// netlify/functions/bg.ts

import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import axios from "axios";

// Típusok (változatlan)
type Deal = { id: string; src: "banggood"; store: "Banggood"; title: string; url: string; short?: string; image?: string; price?: number; orig?: number; cur?: string; code?: string; wh?: string; start?: string; end?: string; updated?: string; };

// Környezeti változók (változatlan)
const { BANGGOOD_API_KEY, BANGGOOD_API_SECRET } = process.env;

// Cache és segédfüggvények (változatlan)
let ACCESS_TOKEN: { token: string; ts: number } | null = null;
const TOKEN_TTL = 50 * 60 * 1000;
const md5 = (s: string) => crypto.createHash("md5").update(s).digest("hex");
function toISO(d?: string | number | Date) { if (!d) return undefined; const dt = new Date(d); return isNaN(dt.getTime()) ? undefined : dt.toISOString(); }
function parseMoney(v: any): number | undefined { if (v == null) return undefined; let s = String(v).trim(); if (!s) return undefined; s = s.replace(/\u00A0/g, " ").replace(/\s+/g, ""); const hasComma = s.includes(","), hasDot = s.includes("."); if (hasComma && !hasDot) s = s.replace(",", "."); else if (hasComma && hasDot) { if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", "."); else s = s.replace(/,/g, ""); } s = s.replace(/[^\d.]/g, ""); const parts = s.split("."); if (parts.length > 2) { const dec = parts.pop(); s = parts.join("") + "." + dec; } const num = parseFloat(s); return Number.isFinite(num) ? num : undefined; }
function normalizeUrl(u?: string): string | undefined { if (!u) return undefined; const https = u.replace(/^http:/i, "https:"); try { return encodeURI(https); } catch { return https; } }
function sign(params: Record<string, any>) { const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&"); return md5(sorted); }

// Banggood API specifikus függvények (változatlan)
async function getAccessToken(): Promise<string> {
    if (!BANGGOOD_API_KEY || !BANGGOOD_API_SECRET) throw new Error("BG API env hiányzik");
    const now = Date.now();
    if (ACCESS_TOKEN && (now - ACCESS_TOKEN.ts) < TOKEN_TTL) return ACCESS_TOKEN.token;
    const timestamp = Math.floor(now / 1000);
    const noncestr = Math.random().toString(36).slice(2);
    const signature = sign({ api_key: BANGGOOD_API_KEY, api_secret: BANGGOOD_API_SECRET, noncestr, timestamp });
    const { data } = await axios.get("https://affapi.banggood.com/getAccessToken", { params: { api_key: BANGGOOD_API_KEY, noncestr, timestamp, signature }, timeout: 8000 });
    const token = data?.result?.access_token;
    if (!token) throw new Error("Nem kaptunk access_token-t");
    ACCESS_TOKEN = { token, ts: now };
    return token;
}

// Mapping függvények (változatlan)
function mapProductToDeal(p: any): Deal { return { id: `bg-prod:${p.product_id}`, src: "banggood", store: "Banggood", title: p.product_name, url: p.product_url, image: normalizeUrl(p.view_image), price: parseMoney(p.product_coupon_price ?? p.product_price), orig: parseMoney(p.product_price), cur: "USD", code: p.coupon_code || undefined, updated: toISO(Date.now()) }; }
function mapCouponToDeal(c: any): Deal { return { id: `bg-coup:${md5(c.promo_link_standard)}`, src: "banggood", store: "Banggood", title: (c.promo_link_standard || "").split("/").pop()?.replace(/-/g, " ") || c.only_for, url: c.promo_link_standard, short: (c.promo_link_short || "").replace(/^http:/i, "https:"), image: normalizeUrl(c.coupon_img), price: parseMoney(c.condition) ?? parseMoney(c.original_price), orig: parseMoney(c.original_price), cur: c.currency || "USD", code: c.coupon_code, wh: c.warehouse, end: toISO(c.coupon_date_end), updated: toISO(Date.now()) }; }

// Handler - ÚJ, EGYSZERŰSÍTETT LOGIKÁVAL
export const handler: Handler = async (event) => {
    try {
        const qs = new URLSearchParams(event.queryStringParameters || {});
        const q = (qs.get("q") || "").trim();
        const wantTop = ["1", "true", "yes"].includes((qs.get("top") || "").toLowerCase());
        const limit = parseInt(qs.get("limit") || "100", 10);

        console.log(`[bg.ts] Handler elindult. Keresőszó: "${q}", Top kérés: ${wantTop}`);

        const token = await getAccessToken();
        let finalDeals: Deal[] = [];

        // 1. ESET: Van keresőszó -> AGRESSZÍV PÁRHUZAMOS KERESÉS
        if (q) {
            console.log(`[bg.ts] MÓD: KERESÉS a következőre: "${q}"`);

            const [productResults, couponResults] = await Promise.all([
                axios.get("https://affapi.banggood.com/product/list", { headers: { "access-token": token }, params: { keyword: q, page: 1 } }).then(r => r.data?.result?.product_list || []),
                axios.get("https://affapi.banggood.com/coupon/list", { headers: { "access-token": token }, params: { type: 2, page: 1 } }).then(r => r.data?.result?.coupon_list || [])
            ]);

            console.log(`[bg.ts] Nyers eredmény: ${productResults.length} termék, ${couponResults.length} kupon`);

            const dealsFromProducts = productResults.map(mapProductToDeal);
            const dealsFromCoupons = couponResults
                .filter((c: any) => (c.only_for || "").toLowerCase().includes(q.toLowerCase()))
                .map(mapCouponToDeal);
            
            console.log(`[bg.ts] Feldolgozott eredmény: ${dealsFromProducts.length} termék, ${dealsFromCoupons.length} releváns kupon`);

            finalDeals = [...dealsFromProducts, ...dealsFromCoupons];
        }
        // 2. ESET: Nincs keresőszó, de TOP termékeket kérnek
        else if (wantTop) {
            console.log("[bg.ts] MÓD: TOP TERMÉKEK");
            const { data } = await axios.get("https://affapi.banggood.com/product/list", { headers: { "access-token": token }, params: { keyword: "", page: 1, sort: "hot" } });
            const rawProducts = data?.result?.product_list || [];
            console.log(`[bg.ts] Nyers TOP eredmény: ${rawProducts.length} termék`);
            finalDeals = rawProducts.slice(0, limit).map(mapProductToDeal);
        }

        // Deduplikáció
        const seen = new Set<string>();
        const uniqueDeals: Deal[] = [];
        for (const d of finalDeals) {
            const key = `${d.url}|${d.code || ""}`;
            if (!seen.has(key)) { seen.add(key); uniqueDeals.push(d); }
        }
        console.log(`[bg.ts] Végleges találatok száma: ${uniqueDeals.length}`);
        
        const payload = { count: uniqueDeals.length, items: uniqueDeals, nextCursor: null, updatedAt: new Date().toISOString(), meta: { warehouses: [], stores: ["Banggood"] } };
        return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };

    } catch (e: any) {
        console.error("[bg.ts] VÉGZETES HIBA:", e.message);
        return { statusCode: 500, body: JSON.stringify({ error: e.message || "Server error" }) };
    }
};
