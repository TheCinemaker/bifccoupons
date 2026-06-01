import React, { useEffect, useState, useRef } from "react";

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
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <rect width="512" height="512" fill="#111827"/>
      <text x="50%" y="52%" fill="#9ca3af" text-anchor="middle" font-size="18" font-family="system-ui,Segoe UI,Roboto">no image</text>
    </svg>`
  );

export function DealsList({ filters }: { filters: any }) {
  const [items, setItems] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    const debounce = setTimeout(() => {
      const run = async () => {
        const id = ++fetchIdRef.current;
        setLoading(true);
        setError(null);
        try {
          const params = new URLSearchParams();
          if (filters.q) params.set("q", String(filters.q).trim());
          if (filters.wh) params.set("wh", String(filters.wh));
          if (filters.store) params.set("store", String(filters.store));
          if (filters.sort) params.set("sort", String(filters.sort));
          params.set("limit", String(filters.limit ?? 120));

          const url = `/.netlify/functions/search?${params.toString()}`;
          const r = await fetch(url);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const data = await r.json();
          if (id !== fetchIdRef.current) return;
          setItems(data.items || []);
        } catch (e: any) {
          if (id !== fetchIdRef.current) return;
          console.error("[DealsList] fetch error:", e);
          setError(e?.message || "Ismeretlen hiba");
          setItems([]);
        } finally {
          if (id === fetchIdRef.current) setLoading(false);
        }
      };
      run();
    }, 250);

    return () => clearTimeout(debounce);
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
        {Array.from({ length: 9 }).map((_, i) => (
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

  if (error) {
    return (
      <div className="p-6 text-center">
        <h3 className="text-lg font-semibold text-red-300 mb-2">Hiba a betöltéskor</h3>
        <p className="text-neutral-400 text-sm">{error}</p>
        <p className="text-neutral-500 text-xs mt-2">Próbáld újratölteni az oldalt, vagy szűkíts a keresésen.</p>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="p-6 text-center text-neutral-400">
        <h3 className="text-lg font-semibold text-white mb-2">Nincs találat</h3>
        <p>Próbálj más kulcsszót, vagy válassz egy boltot a fenti listából.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3">
      {items.map((d) => {
        const out = d.short || d.url;
        const go =
          `/.netlify/functions/go?u=${encodeURIComponent(out)}` +
          `&src=${encodeURIComponent(d.store || d.src || "")}` +
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
                onError={(e) => {
                  const img = e.currentTarget as HTMLImageElement;
                  img.onerror = null;
                  img.src = FALLBACK_SVG;
                }}
              />
            </div>

            <div className="mb-1 text-xs uppercase text-neutral-400">
              {d.store || d.src}
            </div>

            <div className="mb-2 font-semibold text-white line-clamp-2">
              {d.title}
            </div>

            <div className="text-sm text-neutral-200">
              {price}
              {orig ? <span className="line-through opacity-60 ml-2">{orig}</span> : null}
            </div>

            <div className="text-xs text-neutral-500 mt-1">
              {d.wh || "—"} {ends ? `• ${ends}` : ""}
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
