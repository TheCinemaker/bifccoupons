// frontend/src/components/DealsList.tsx
import React, { useEffect, useState } from "react";

type Deal = {
  id: string;
  src: string;
  store?: string;
  title: string;
  url: string;
  short?: string;
  wh?: string;
  code?: string;
  price?: number;
  orig?: number;
  cur?: string;
  end?: string;
  image?: string;
};

function formatPrice(v?: number, cur?: string) {
  if (v == null) return "";
  const c = (cur || "USD").toUpperCase();
  const sym = c === "USD" ? "$" : c === "EUR" ? "€" : c;
  return `${sym}${v.toFixed(2)}`;
}

const FALLBACK_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512' viewBox='0 0 512 512'>
    <rect width='512' height='512' fill='#111827'/>
    <text x='50%' y='52%' fill='#9ca3af' text-anchor='middle' font-size='18' font-family='system-ui,Segoe UI,Roboto'>no image</text>
  </svg>`);

export function DealsList({ filters }: { filters: any }) {
  const [items, setItems] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const qsBase = new URLSearchParams(
          Object.entries(filters).filter(([k,v]) => v !== undefined && k !== "store") as any
        );

        // Ha üres a kereső és AliExpress bolt van kiválasztva → TOP 200
        if ((filters.store === "AliExpress") && (!filters.q || !String(filters.q).trim())) {
          const u = `/.netlify/functions/ali?top=1&limit=200&${qsBase.toString()}`;
          const r = await fetch(u, { headers: { "Cache-Control":"no-cache" } }).then(x=>x.json());
          if (!alive) return;
          setItems(r.items || []);
          setLoading(false);
          return;
        }

        // Egyébként: párhuzamos aggregálás (Sheets + BG + Ali)
        const urls:string[] = [
          `/.netlify/functions/coupons?${qsBase.toString()}`,
          `/.netlify/functions/bg?catalog=1&${qsBase.toString()}`,
          `/.netlify/functions/ali?${qsBase.toString()}`
        ];

        const results = await Promise.all(urls.map(u =>
          fetch(u, { headers: { "Cache-Control":"no-cache" } })
            .then(r => r.ok ? r.json() : Promise.resolve({ items: [] }))
            .catch(() => ({ items: [] }))
        ));

        let merged:Deal[] = results.flatMap(r => r.items || []);

        // Store szűrő a fronton is (biztonság kedvéért)
        if (filters.store) {
          merged = merged.filter(d => (d.store || d.src)?.toLowerCase() === filters.store.toLowerCase());
        }

        // Dedupe (url+code)
        const seen = new Set<string>();
        const uniq:Deal[] = [];
        for (const d of merged) {
          const key = `${d.url}|${d.code || ""}`;
          if (!seen.has(key)) { seen.add(key); uniq.push(d); }
        }

        // Rendezés
        const s = filters.sort;
        if (s === "price_asc") uniq.sort((a,b)=>(a.price ?? Infinity)-(b.price ?? Infinity));
        else if (s === "price_desc") uniq.sort((a,b)=>(b.price ?? -Infinity)-(a.price ?? -Infinity));
        else if (s === "store_asc" || s === "store_desc") {
          uniq.sort((a,b)=> s==="store_asc"
            ? (a.store || a.src || "").localeCompare(b.store || b.src || "")
            : (b.store || b.src || "").localeCompare(a.store || a.src || "")
          );
        }

        if (!alive) return;
        setItems(uniq);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [JSON.stringify(filters)]);

  async function copyCode(e: React.MouseEvent, deal: Deal) {
    e.preventDefault();
    if (!deal.code) return;
    try {
      await navigator.clipboard.writeText(deal.code);
      setCopiedId(deal.id);
      setTimeout(() => setCopiedId((id) => (id === deal.id ? null : id)), 1500);
    } catch {}
  }

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
          `&src=${encodeURIComponent(d.src || d.store || "")}` +
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
                draggable={false}
                sizes="(min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
                onError={(e) => { const img = e.currentTarget as HTMLImageElement; img.onerror = null; img.src = FALLBACK_SVG; }}
              />
            </div>

            <div className="mb-1 text-xs uppercase text-neutral-400">{d.store || d.src}</div>

            <div className="mb-2 font-semibold text-white line-clamp-2">{d.title}</div>

            <div className="text-sm text-neutral-200">
              {price}
              {orig ? <span className="line-through opacity-60 ml-2">{orig}</span> : null}
            </div>

            <div className="text-xs text-neutral-500 mt-1">
              {(d.wh || "—")} {ends ? `• ${ends}` : ""}
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
