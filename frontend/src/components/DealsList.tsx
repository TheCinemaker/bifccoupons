import React, { useEffect, useState } from "react";

// Típusdefiníciók
type Deal = {
  id: string;
  src?: string;
  store?: string;
  title: string;
  url:string;
  short?: string;
  wh?: string;
  code?: string;
  price?: number;
  orig?: number;
  cur?: string;
  end?: string;
  image?: string;
};

type Filters = {
  q?: string;
  wh?: string;
  store?: string;
  sort?: "price_asc" | "price_desc" | "store_asc" | "store_desc";
  limit?: number;
  source?: "sheets" | "banggood" | "aliexpress";
  catalog?: "1";
  minPrice?: number;
  maxPrice?: number;
};

// Konstansok és segédfüggvények (változatlan)
const FALLBACK_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='512' height='256' viewBox='0 0 512 256'>
      <rect width='512' height='256' fill='#111827'/>
      <text x='50%' y='52%' fill='#9ca3af' font-family='system-ui,Segoe UI,Roboto,Ubuntu,Arial' text-anchor='middle' font-size='16'>no image</text>
    </svg>`
  );

function formatPrice(v?: number, cur?: string) {
  if (v == null) return "";
  const c = (cur || "USD").toUpperCase();
  const sym = c === "USD" ? "$" : c === "EUR" ? "€" : c;
  return `${sym}${v.toFixed(2)}`;
}

function dedupe(list: Deal[]): Deal[] {
  const seen = new Set<string>();
  const out: Deal[] = [];
  for (const d of list) {
    const key = `${d.id}::${d.url}::${d.code || ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(d);
    }
  }
  return out;
}

function inferStore(d: Deal): string {
  if (d.store) return d.store;
  const u = (d.url || d.short || "").toLowerCase();
  if (u.includes("banggood")) return "Banggood";
  if (u.includes("geekbuying")) return "Geekbuying";
  if (u.includes("aliexpress")) return "AliExpress";
  return "Egyéb";
}

// JAVÍTOTT getItems: Visszaadja a teljes választ (items + meta)
async function getItems(url: string): Promise<{ items: Deal[]; meta?: any }> {
  try {
    const r = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
    if (!r.ok) return { items: [] }; // Hiba esetén üres tömb
    const j = await r.json();
    return { items: j.items || [], meta: j.meta };
  } catch (error) {
    console.error("Fetch error:", error);
    return { items: [] };
  }
}

// A komponens
export function DealsList({
  filters,
  onMeta,
}: {
  filters: Filters;
  onMeta?: (m: { warehouses: string[]; stores: string[] }) => void;
}) {
  const [items, setItems] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // JAVÍTOTT ÉS EGYSÉGESÍTETT useEffect HOOK
  useEffect(() => {
    let alive = true;
    setLoading(true);

    const q = (filters.q || "").trim();
    const hasQuery = q.length > 0;
    const lim = String(filters.limit ?? 200);
    const ts = String(Date.now()); // cache buster

    // A szűrő és rendező logikád tökéletes, egy segédfüggvénybe szervezve
    const applyClientSideFilters = (arr: Deal[]) => {
      let merged = [...arr];

      if (filters.store) {
        const want = String(filters.store).toLowerCase();
        merged = merged.filter((d) => inferStore(d).toLowerCase() === want);
      }
      if (filters.wh) {
        const WH = String(filters.wh).toUpperCase();
        if (WH === "EU") {
          merged = merged.filter((d) => (d.wh || "").toUpperCase() !== "CN");
        } else {
          merged = merged.filter((d) => (d.wh || "").toUpperCase() === WH);
        }
      }
      if (filters.minPrice != null) {
        merged = merged.filter((d) => (d.price ?? Infinity) >= Number(filters.minPrice));
      }
      if (filters.maxPrice != null) {
        merged = merged.filter((d) => (d.price ?? 0) <= Number(filters.maxPrice));
      }

      if (filters.sort === "price_asc") {
        merged.sort((x, y) => (x.price ?? Infinity) - (y.price ?? Infinity));
      } else if (filters.sort === "price_desc") {
        merged.sort((x, y) => (y.price ?? -Infinity) - (x.price ?? -Infinity));
      } else if (filters.sort === "store_asc" || filters.sort === "store_desc") {
        merged.sort((x, y) => {
          const ax = inferStore(x).toLowerCase();
          const ay = inferStore(y).toLowerCase();
          const cmp = ax.localeCompare(ay);
          return filters.sort === "store_asc" ? cmp : -cmp;
        });
      } else {
        // okos rangsor
        merged.sort((a, b) => {
          let sa = 0, sb = 0;
          const wA = (a.wh || "").toUpperCase();
          const wB = (b.wh || "").toUpperCase();
          if (wA && wA !== "CN") sa += 10;
          if (wB && wB !== "CN") sb += 10;
          if (a.end) {
            const da = Math.max(0, (new Date(a.end).getTime() - Date.now()) / 86400000);
            sa += 10 - Math.min(10, da);
          }
          if (b.end) {
            const db = Math.max(0, (new Date(b.end).getTime() - Date.now()) / 86400000);
            sb += 10 - Math.min(10, db);
          }
          if (a.price != null && a.orig && a.price < a.orig) {
            sa += Math.min(8, Math.max(0, (100 * (1 - a.price / a.orig)) / 5));
          }
          if (b.price != null && b.orig && b.price < b.orig) {
            sb += Math.min(8, Math.max(0, (100 * (1 - b.price / b.orig)) / 5));
          }
          return sb - sa;
        });
      }
      return merged;
    };

    const source = filters.source || "sheets";

    // --- EGYSÉGESÍTETT LOGIKA ---
    // Ha keresünk, VAGY ha az "Összesített" (sheets) nézeten vagyunk,
    // akkor mindhárom forrásból párhuzamosan töltünk.
    if (hasQuery || source === "sheets") {
      const couponsURL = `/.netlify/functions/coupons?q=${q}&limit=${lim}&_=${ts}`;
      const aliURL = `/.netlify/functions/ali?q=${q}&top=${hasQuery ? "" : "1"}&limit=${Math.min(Number(lim), 100)}&_=${ts}`;
      const bgURL = `/.netlify/functions/bg?q=${q}&limit=${lim}&catalog=1&_=${ts}`;

      Promise.all([getItems(couponsURL), getItems(aliURL), getItems(bgURL)])
        .then(([couponsRes, aliRes, bgRes]) => {
          if (!alive) return;

          // A meta adatokat a sheets/coupons végpontból vesszük, mert az a megbízható forrás.
          const finalStores = couponsRes.meta?.stores || ["Banggood", "Geekbuying", "AliExpress"];
          const allItems = dedupe([...couponsRes.items, ...aliRes.items, ...bgRes.items]);
          const filteredItems = applyClientSideFilters(allItems);
          
          const finalWarehouses = Array.from(new Set(filteredItems.map(d => d.wh || "").filter(Boolean))).sort();
          
          onMeta?.({ stores: finalStores, warehouses: finalWarehouses });
          setItems(filteredItems);
        })
        .catch(console.error)
        .finally(() => setLoading(false));

    } else {
      // --- DEDIKÁLT FORRÁS (Banggood Live vagy AliExpress Top) ---
      let url = "";
      if (source === "banggood") {
        url = `/.netlify/functions/bg?limit=${lim}&_=${ts}`;
      } else { // aliexpress
        url = `/.netlify/functions/ali?top=1&limit=100&_=${ts}`;
      }

      getItems(url)
        .then((response) => {
          if (!alive) return;
          const finalItems = applyClientSideFilters(response.items);

          const warehouses = Array.from(new Set(finalItems.map(d => d.wh || "").filter(Boolean))).sort();
          const stores = Array.from(new Set(finalItems.map(inferStore))).sort();

          onMeta?.({ warehouses, stores });
          setItems(finalItems);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }

    return () => { alive = false; };
  }, [JSON.stringify(filters)]); // onMeta kivéve, mert felesleges re-run-t okozhat


  // Kód másolása (változatlan)
  async function copyCode(e: React.MouseEvent, deal: Deal) {
    e.preventDefault();
    if (!deal.code) return;
    try {
      await navigator.clipboard.writeText(deal.code);
      setCopiedId(deal.id);
      setTimeout(() => setCopiedId((id) => (id === deal.id ? null : id)), 1500);
    } catch {}
  }

  // JSX rész (változatlan)
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-neutral-900 rounded-lg p-3">
            <div className="w-full h-40 rounded-md mb-2 bg-neutral-800 animate-pulse" />
            <div className="h-4 w-3/4 bg-neutral-800 rounded mb-2 animate-pulse" />
            <div className="h-3 w-1/2 bg-neutral-800 rounded mb-1 animate-pulse" />
            <div className="h-3 w-1/3 bg-neutral-800 rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }
  if (!items.length) return <div className="p-4 text-neutral-400">Nincs találat.</div>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3">
      {items.map((d) => {
        const out = d.short || d.url;
        const go =
          `/.netlify/functions/go?u=${encodeURIComponent(out)}` +
          `&src=${encodeURIComponent(d.src || inferStore(d))}` +
          `&code=${encodeURIComponent(d.code || "")}`;

        const imgSrc = d.image
          ? `/.netlify/functions/img?u=${encodeURIComponent(d.image)}`
          : FALLBACK_SVG;

        const price = formatPrice(d.price, d.cur);
        const orig = d.orig ? formatPrice(d.orig, d.cur) : "";
        const ends = d.end ? `lejár: ${new Date(d.end).toLocaleDateString("hu-HU")}` : "";

        return (
          <a
            key={d.id}
            href={go}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="block bg-neutral-900 rounded-lg p-3 hover:ring-2 ring-amber-400 transition"
          >
            <div className="relative w-full h-40 mb-2">
              <img
                src={imgSrc}
                alt={d.title}
                className="absolute inset-0 w-full h-full object-cover rounded-md bg-neutral-800"
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  const el = e.currentTarget as HTMLImageElement;
                  el.onerror = null;
                  el.src = FALLBACK_SVG;
                }}
              />
            </div>

            <div className="mb-2 font-semibold text-white line-clamp-2">{d.title}</div>

            <div className="text-sm text-neutral-200">
              {price}
              {orig ? <span className="line-through opacity-60 ml-2">{orig}</span> : null}
            </div>

            <div className="text-xs text-neutral-500 mt-1">
              {(d.store || inferStore(d))} {d.wh ? `• ${d.wh}` : ""} {ends ? `• ${ends}` : ""}
            </div>

            {d.code ? (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs font-mono px-2 py-1 rounded bg-neutral-800 text-neutral-100 border border-neutral-700">
                  {d.code}
                </span>
                <button
                  className="text-xs px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30"
                  onClick={(e) => copyCode(e, d)}
                  aria-label="Kuponkód másolása"
                  title="Kuponkód másolása"
                >
                  {copiedId === d.id ? "✔ Másolva" : "Másolás"}
                </button>
              </div>
            ) : (
              <div className="mt-3 text-xs text-neutral-400">Nincs kuponkód – akciós ár</div>
            )}
          </a>
        );
      })}
    </div>
  );
}
