import React, { useEffect, useState } from "react";

type Deal = {
  id: string;
  src: "sheets";
  store: "Banggood" | "Geekbuying";
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

// Beépített SVG fallback – “no picture”
const FALLBACK_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='512' height='320' viewBox='0 0 512 320'>
      <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0%' stop-color='#1f2937'/><stop offset='100%' stop-color='#111827'/>
      </linearGradient></defs>
      <rect width='512' height='320' fill='url(#g)'/>
      <g fill='#9ca3af' font-family='system-ui,Segoe UI,Roboto,Ubuntu,Arial' text-anchor='middle'>
        <text x='256' y='170' font-size='20'>no picture</text>
      </g>
    </svg>`
  );

export function DealsList({ filters }: { filters: any }) {
  const [items, setItems] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
  let alive = true;
  setLoading(true);

  const qs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== "")
  ).toString();

  const endpoint = filters.source === "banggood" ? "bg" : "coupons";
  const url = `/.netlify/functions/${endpoint}?${qs}${qs ? "&" : ""}_=${Date.now()}`;

  fetch(url, { headers: { "Cache-Control": "no-cache" } })
    .then((r) => r.json())
    .then((d) => {
      if (!alive) return;
      setItems(d.items || []);
      setLoading(false);
    })
    .catch(() => setLoading(false));

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
          `&src=${encodeURIComponent(d.src || "")}` +
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
                onError={(e) => {
                  const img = e.currentTarget as HTMLImageElement;
                  img.onerror = null; // ne loopoljon
                  img.src = FALLBACK_SVG;
                }}
              />
            </div>

            <div className="mb-1 text-xs text-amber-300">{d.store}</div>

            <div className="mb-2 font-semibold text-white line-clamp-2">
              {d.title}
            </div>

            <div className="text-sm text-neutral-200">
              {price}
              {orig ? <span className="line-through opacity-60 ml-2">{orig}</span> : null}
            </div>

            <div className="text-xs text-neutral-500 mt-1">
              {d.wh || "No warehouse"} {ends ? `• ${ends}` : ""}
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
