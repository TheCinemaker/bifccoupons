import React, { useEffect, useState } from "react";

type Deal = {
  id: string;
  src: string;
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

export function DealsList({ filters }: { filters: any }) {
  const [items, setItems] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const qs = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v !== undefined) as any
    ).toString();

    fetch(`/.netlify/functions/coupons?${qs}`, { headers: { "Cache-Control": "no-cache" } })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setItems(d.items || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    return () => {
      alive = false;
    };
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

  if (loading) return <div className="p-4 text-neutral-400">Betöltés…</div>;
  if (!items.length) return <div className="p-4 text-neutral-400">Nincs találat.</div>;

  return (
    <div className="grid grid-cols-1 sm-grid-cols-2 md-grid-cols-3 gap-3 p-3">
      {items.map((d) => {
        const out = d.short || d.url;
        const go = `/.netlify/functions/go?u=${encodeURIComponent(out)}`;
        const price = formatPrice(d.price, d.cur);
        const orig = d.orig ? formatPrice(d.orig, d.cur) : "";
        const ends = d.end ? `lejár: ${new Date(d.end).toLocaleDateString("hu-HU")}` : "";
        
        // JAVÍTÁS: A változót a JSX-en kívül definiáljuk!
        const imgSrc = d.image ? `/.netlify/functions/img?u=${encodeURIComponent(d.image)}` : null;

        return (
          <a
            key={d.id}
            href={go}
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-neutral-900 rounded-lg p-3 hover:ring-2 ring-amber-400 transition flex flex-col"
          >
            {/* JAVÍTÁS: Egyszerű feltételes renderelés */}
            {imgSrc && (
              <img
                src={imgSrc}
                alt={d.title} // Fontos az akadálymentesítéshez!
                className="w-full h-40 object-cover rounded-md mb-2 bg-neutral-800"
                loading="lazy"
                decoding="async"
              />
            )}

            <div className="mb-2 font-semibold text-white line-clamp-2 flex-grow">
              {d.title}
            </div>

            <div className="mt-auto"> {/* Alulra igazítás a flex containerben */}
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
                <div className="mt-3 text-xs text-neutral-400">
                  Nincs kuponkód – akciós ár
                </div>
              )}
            </div>
          </a>
        );
      })}
    </div>
  );
}
