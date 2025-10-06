// netlify/functions/search.ts
import type { Handler } from "@netlify/functions";
import axios from "axios";
import crypto from "crypto";

/* ============== Types ============== */
type Deal = {
  id: string;
  src?: string;       // "sheets" | "banggood" | "aliexpress" | ...
  store?: string;     // "Banggood" | "Geekbuying" | "AliExpress"
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
};

type SortKey = "price_asc" | "price_desc" | "store_asc" | "store_desc";

/* ============== Utils ============== */
const md5 = (s: string) => crypto.createHash("md5").update(s).digest("hex");
const etagOf = (json: string) => md5(json);

function inferStore(d: Deal): string {
  if (d.store) return d.store;
  const u = (d.url || "").toLowerCase();
  if (u.includes("banggood.")) return "Banggood";
  if (u.includes("geekbuying.")) return "Geekbuying";
  if (u.includes("aliexpress.")) return "AliExpress";
  return "";
}
function dedupe(items: Deal[]): Deal[] {
  const seen = new Set<string>();
  const out: Deal[] = [];
  for (const d of items) {
    const urlNoQuery = (d.url || "").split("?")[0];
    const key = d.id || `${urlNoQuery}::${d.code || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}
function scoreDeal(d: Deal): number {
  let s = 0;
  const wh = (d.wh || "").toUpperCase();
  if (wh && wh !== "CN") s += 10;
  if (d.end) {
    const days = Math.max(0, (new Date(d.end).getTime() - Date.now()) / 86400000);
    s += (10 - Math.min(10, days));
  }
  if (d.price != null && d.orig && d.price < d.orig) {
    const disc = 100 * (1 - d.price / d.orig);
    s += Math.min(8, Math.max(0, disc / 5));
  }
  return s;
}
function sortItems(items: Deal[], sort?: SortKey): Deal[] {
  if (sort === "price_asc") return [...items].sort((a,b)=>(a.price ?? Infinity)-(b.price ?? Infinity));
  if (sort === "price_desc") return [...items].sort((a,b)=>(b.price ?? -Infinity)-(a.price ?? -Infinity));
  if (sort === "store_asc" || sort === "store_desc") {
    return [...items].sort((a,b)=>{
      const ax = inferStore(a).toLowerCase();
      const bx = inferStore(b).toLowerCase();
      const cmp = ax.localeCompare(bx);
      return sort === "store_asc" ? cmp : -cmp;
    });
  }
  // “okos” alap
  return [...items].map(d=>({d,s:scoreDeal(d)})).sort((a,b)=>b.s-a.s).map(x=>x.d);
}

/* ============== HTTP helpers ============== */
function siteBase() {
  // Netlify ad URL/DEPLOY_URL envet; fallback local dev
  return process.env.URL || process.env.DEPLOY_URL || "http://localhost:8888";
}
async function fetchItems(pathAndQuery: string): Promise<Deal[]> {
  try {
    const base = siteBase();
    const { data } = await axios.get(`${base}${pathAndQuery}`, {
      timeout: 12000,
      heade
