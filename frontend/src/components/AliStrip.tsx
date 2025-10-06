import React, { useEffect, useState } from "react";

type Deal = {
  id: string;
  title: string;
  url: string;
  short?: string;
  image?: string;
  price?: number;
  orig?: number;
  cur?: string;
};

const FALLBACK_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512' viewBox='0 0 512 512'>
      <rect width='512' height='512' fill='#111827'/>
      <text x='50%' y='52%' text-anchor='middle' fill='#9ca3af' font-size='22' font-family='system-ui,Segoe UI,Roboto,Ubuntu,Arial'>no image</text>
    </svg>`
  );

function fmt(v?: number, cur?: string) {
  if (v == null) return "";
  const c = (cur || "USD").toUpperCase();
  const sym = c === "USD" ? "$" : c === "EUR" ? "€" : c;
  return `${sym}${v.toFixed(2)}`;
}

export function AliStrip() {
  const [items, setItems] = useState<Deal[]>([]);

  useEffect(() => {
    let alive = true;
    fetch(`/.netlify/functions/ali?top=1&limit=12`, { headers: { "Cache-Control": "no-cache" } })
      .then(r => r.json())
      .then(d => { if (alive) setItems(d.items || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!items.length) return null;

  return (
    <section className="max-w-6xl mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-white font-semibold">AliExpress TOP</h2>
        <small className="text-neutral-400">válogatás</small>
      </div>
      <div className="grid grid-flow-col auto-cols-[70%] sm:auto-cols-[33%] md:auto-cols-[25%] gap-3 overflow-x-auto pb-2">
        {items.map((d) => {
          const out = d.short || d.url;
          const go = `/.netlify/functions/go?u=${encodeURIComponent(out)}&src=AliExpress`;
          const imgSrc = d.image ? `/.netlify/functions/img?u=${encodeURIComponent(d.image)}` : FALLBACK_SVG;
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
                  onError={(e) => { const img = e.currentTarget as HTMLImageElement; img.onerror = null; img.src = FALLBACK_SVG; }}
                />
              </div>
              <div className="mb-1 font-semibold text-white line-clamp-2">{d.title}</div>
              <div className="text-sm text-neutral-200">{fmt(d.price, d.cur)}</div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
