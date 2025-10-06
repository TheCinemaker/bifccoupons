// netlify/functions/ali.ts

import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import axios from "axios";

// ===== Types & Utils (változatlan) =====
type Deal = { id: string; src: "aliexpress"; store: "AliExpress"; title: string; url: string; image?: string; price?: number; orig?: number; cur?: string; code?: string; wh?: string; updated?: string; };
function toISO(d?: any): string | undefined { return d ? new Date(d).toISOString() : undefined; }
function parseMoney(v: any): number | undefined { if (v==null) return; let s=String(v).trim().replace(/[^\d.,]/g,'').replace(',','.'); const n=parseFloat(s); return isFinite(n)?n:undefined; }
function normalizeUrl(u?: string): string | undefined { if(!u) return; const p=u.startsWith("//")?`https:${u}`:u; return encodeURI(p.replace(/^http:/i,"https:")); }
function mapAliItem(p: any): Deal { return { id: `ali:${p.product_id}`, src:"aliexpress", store:"AliExpress", title:p.product_title, url:p.promotion_link, image:normalizeUrl(p.product_main_image_url), price:parseMoney(p.target_sale_price), orig:parseMoney(p.original_price), cur:p.target_sale_price_currency, code:undefined, wh:p.ship_from_country, updated:toISO(Date.now()) }; }

// ===== Handler (VÉGLEGES, JAVÍTOTT VÁLASZKEZELÉSSEL) =====
export const handler: Handler = async (event) => {
    const { ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET, ALIEXPRESS_TRACKING_ID } = process.env;

    if (!ALIEXPRESS_APP_KEY || !ALIEXPRESS_APP_SECRET || !ALIEXPRESS_TRACKING_ID) {
        return { statusCode: 500, body: JSON.stringify({ error: "AliExpress API konfigurációs hiba." }) };
    }

    try {
        const qs = new URLSearchParams(event.queryStringParameters || {});
        const q = (qs.get("q") || "").trim();
        const wantTop = ["1", "true", "yes"].includes((qs.get("top") || "").toLowerCase());
        
        const searchLimit = 30;
        const topLimit = 100;

        let method = '';
        let apiParams: Record<string, any> = {
            tracking_id: ALIEXPRESS_TRACKING_ID,
            target_currency: "USD",
            target_language: "EN",
        };

        if (q) {
            method = "aliexpress.affiliate.product.query";
            apiParams.keywords = q;
            apiParams.page_size = searchLimit;
        } else if (wantTop) {
            method = "aliexpress.affiliate.hotproduct.query"; // Visszatettem a hotproductot, mert most már tudjuk, hogy működik
            apiParams.page_size = topLimit;
        }

        if (!method) {
            return { statusCode: 200, body: JSON.stringify({ count: 0, items: [] }) };
        }

        // --- API Hívás Logika (A helyes aláírással) ---
        const callAliBusinessAPI = async (m: string, p: Record<string, any>) => {
            const commonParams: Record<string, string> = {
                app_key: ALIEXPRESS_APP_KEY,
                sign_method: "sha256",
                timestamp: String(Date.now()),
                method: m,
                ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])),
            };

            const sortedKeys = Object.keys(commonParams).sort();
            const stringToSign = sortedKeys.map(key => `${key}${commonParams[key]}`).join("");
            const signature = crypto.createHmac("sha256", ALIEXPRESS_APP_SECRET).update(stringToSign).digest("hex").toUpperCase();
            
            const finalParams = { ...commonParams, sign: signature };

            const { data } = await axios.get("https://api-sg.aliexpress.com/sync", {
                params: finalParams,
                timeout: 8000,
            });

            // ---- EZ A RÉSZ A JAVÍTÁS ----
            if (data?.error_response) throw new Error(data.error_response.sub_msg || data.error_response.msg);

            // Dinamikusan keressük meg a válasz kulcsot, ami a metódus nevéből van képezve
            const responseKey = m.replace(/\./g, '_') + '_response';
            const result = data?.[responseKey]?.result;
            
            if (!result || result.resp_code !== 200) {
                console.error("[ali.ts] API válasz hiba. Teljes válasz:", JSON.stringify(data, null, 2));
                throw new Error(`AliExpress API hiba: ${result?.resp_msg || "Ismeretlen válaszstruktúra"}`);
            }
            return result;
        };

        const result = await callAliBusinessAPI(method, apiParams);
        const rawItems = result.products?.product || [];
        const totalItems = result.total_record_count || rawItems.length;

        const items = rawItems.map(mapAliItem);
        const payload = { count: totalItems, items, meta: {} };
        return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };

    } catch (e: any) {
        console.error(`[ali.ts] Végzetes hiba: ${e.message}`);
        return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
};
