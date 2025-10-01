// frontend/src/components/DealsList.tsx

import React, { useEffect, useState, useRef } from "react";

// Típusok és segédfüggvények (változatlan)
type Deal = { id: string; src: string; store?: string; title: string; url: string; short?: string; wh?: string; code?: string; price?: number; orig?: number; cur?: string; end?: string; image?: string; };
function formatPrice(v?: number, cur?: string) { /* ... */ return v != null ? `${(cur || "USD") === "USD" ? "$" : "€"}${v.toFixed(2)}` : ""; }
const FALLBACK_SVG = "data-image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512' viewBox='0 0 512 512'><rect width='512' height='512' fill='#111827'/><text x='50%' y='52%' fill='#9ca3af' text-anchor='middle' font-size='18' font-family='system-ui,Segoe UI,Roboto'>no image</text></svg>`);

export function DealsList({ filters }: { filters: any }) {
  const [items, setItems] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Ref a keresési kérések követésére, hogy elkerüljük a versenyhelyzetet
  const fetchIdRef = useRef(0);

  useEffect(() => {
    // --- DEBOUNCE LOGIKA ---
    // Várunk 300ms-ot a gépelés befejezése után, mielőtt keresést indítunk.
    const debounceTimer = setTimeout(() => {
      
      const fetchDeals = async () => {
        const currentFetchId = ++fetchIdRef.current;
        setLoading(true);
        
        try {
          const q = (filters.q || "").trim();
          let finalItems: Deal[] = [];

          console.log(`--- [DealsList] Új futás #${currentFetchId} | Keresőszó: "${q}" | Bolt: "${filters.store || 'Nincs'}" ---`);

          // 1. SZABÁLY: A KERESŐ MINDENT VISZ
          if (q) {
            console.log(`[DealsList] #${currentFetchId} MÓD: KERESÉS`);
            const qs = new URLSearchParams(filters as any).toString();
            const urls = [
              `/.netlify/functions/coupons?${qs}`,
              `/.netlify/functions/bg?${qs}`,
              `/.netlify/functions/ali?${qs}`
            ];
            
            const results = await Promise.all(
              urls.map(u => fetch(u).then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })))
            );

            // Csak akkor frissítjük az állapotot, ha ez a legfrissebb kérés
            if (currentFetchId !== fetchIdRef.current) {
              console.log(`[DealsList] #${currentFetchId} Elavult kérés, eldobva.`);
              return;
            }
            finalItems = results.flatMap(r => r.items || []);

          // 2. SZABÁLY: NINCS KERESÉS, DE VAN BOLT
          } else if (filters.store) {
            let url = '';
            switch (filters.store) {
              case "AliExpress": url = `/.netlify/functions/ali?top=1&limit=200`; break;
              default: url = `/.netlify/functions/coupons?store=${filters.store}&limit=200`; break;
            }
            if (url) {
              const res = await fetch(url).then(r => r.json());
              if (currentFetchId === fetchIdRef.current) finalItems = res.items || [];
            }
          // 3. SZABÁLY: ALAPÉRTELMEZETT NÉZET
          } else {
            const defaultUrls = [
              '/.netlify/functions/coupons?store=Banggood&limit=3',
              '/.netlify/functions/coupons?store=Geekbuying&limit=3',
              '/.netlify/functions/coupons?store=Gshopper&limit=3',
              '/.netlify/functions/ali?top=1&limit=3',
              '/.netlify/functions/bg?top=1&limit=3'
            ];
            const results = await Promise.all(defaultUrls.map(u => fetch(u).then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] }))));
            if (currentFetchId === fetchIdRef.current) finalItems = results.flatMap(r => r.items || []);
          }

          if (currentFetchId !== fetchIdRef.current) {
            console.log(`[DealsList] #${currentFetchId} Elavult kérés a feldolgozás előtt, eldobva.`);
            return;
          }

          console.log(`[DealsList] #${currentFetchId} Találatok feldolgozás előtt: ${finalItems.length} db`);
          
          const seen = new Set<string>();
          const uniq: Deal[] = [];
          for (const d of finalItems) {
            const key = `${d.url}|${d.code || ""}`;
            if (!seen.has(key)) { seen.add(key); uniq.push(d); }
          }

          const s = filters.sort;
          if (s === "price_asc") uniq.sort((a,b)=>(a.price ?? Infinity)-(b.price ?? Infinity));
          else if (s === "price_desc") uniq.sort((a,b)=>(b.price ?? -Infinity)-(a.price ?? -Infinity));

          console.log(`[DealsList] #${currentFetchId} Végleges, egyedi találatok: ${uniq.length} db`);
          setItems(uniq);
        } catch (error) {
          console.error(`[DealsList] #${currentFetchId} VÉGZETES HIBA:`, error);
          setItems([]);
        } finally {
          setLoading(false);
        }
      };

      fetchDeals();

    }, 300); // 300ms várakozás

    // Cleanup: ha a filterek változnak, mielőtt lejárna a timer, töröljük a régit
    return () => clearTimeout(debounceTimer);
  }, [JSON.stringify(filters)]);
  
  // A JSX rész (loading, copyCode, return) változatlan
  async function copyCode(e: React.MouseEvent, deal: Deal) { e.preventDefault(); if (!deal.code) return; try { await navigator.clipboard.writeText(deal.code); setCopiedId(deal.id); setTimeout(() => setCopiedId((id) => (id === deal.id ? null : id)), 1500); } catch {} }
  if (loading) { return <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3">{Array.from({ length: 9 }).map((_, i) => <div key={i} className="bg-neutral-900 rounded-lg p-3"><div className="w-full h-40 rounded-md mb-2 bg-neutral-800 animate-pulse" /><div className="h-4 w-3/4 bg-neutral-800 rounded mb-2 animate-pulse" /><div className="h-3 w-1/2 bg-neutral-800 rounded mb-1 animate-pulse" /><div className="h-3 w-1/3 bg-neutral-800 rounded animate-pulse" /></div>)}</div>; }
  if (!items.length) { return <div className="p-6 text-center text-neutral-400"><h3 className="text-lg font-semibold text-white mb-2">Nincs találat</h3><p>Próbálj más kulcsszót, vagy válassz egy boltot a fenti listából a legnépszerűbb termékekért.</p></div>; }
  return ( <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3">{items.map((d) => { const out = d.short || d.url; const go = `/.netlify/functions/go?u=${encodeURIComponent(out)}&src=${encodeURIComponent(d.store || d.src || "")}&code=${encodeURIComponent(d.code || "")}`; const imgSrc = d.image ? `/.netlify/functions/img?u=${encodeURIComponent(d.image)}` : FALLBACK_SVG; const price = formatPrice(d.price, d.cur); const orig = d.orig ? formatPrice(d.orig, d.cur) : ""; const ends = d.end ? `lejár: ${new Date(d.end).toLocaleDateString("hu-HU")}` : ""; return ( <a key={d.id} href={go} target="_blank" rel="noopener noreferrer nofollow ugc" className="block bg-neutral-900 rounded-lg p-3 hover:ring-2 ring-amber-400 transition"><div className="relative w-full h-40 mb-2"><img src={imgSrc} alt={d.title} className="absolute inset-0 w-full h-full object-cover rounded-md bg-neutral-800" loading="lazy" decoding="async" draggable={false} onError={(e) => { const img = e.currentTarget as HTMLImageElement; img.onerror = null; img.src = FALLBACK_SVG; }} /></div><div className="mb-1 text-xs uppercase text-neutral-400">{d.store || d.src}</div><div className="mb-2 font-semibold text-white line-clamp-2">{d.title}</div><div className="text-sm text-neutral-200">{price} {orig ? <span className="line-through opacity-60 ml-2">{orig}</span> : null}</div><div className="text-xs text-neutral-500 mt-1">{(d.wh || "—")} {ends ? `• ${ends}` : ""}</div>{d.code ? <div className="mt-3 flex items-center gap-2"><span className="text-xs font-mono px-2 py-1 rounded bg-neutral-800 text-neutral-100 border border-neutral-700">{d.code}</span><button className="text-xs px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30" onClick={(e) => copyCode(e, d)}> {copiedId === d.id ? "✔ Másolva" : "Másolás"} </button></div> : <div className="mt-3 text-xs text-neutral-400">Nincs kuponkód – akciós ár</div>}</a> ); })}</div> );
}
