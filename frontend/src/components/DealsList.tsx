import React, { useEffect, useState } from "react";

type Deal = {
  id: string; src: string; title: string; url: string;
  wh?: string; code?: string; price?: number; orig?: number; cur?: string; end?: string;
};

export function DealsList({ filters }:{ filters:any }) {
  const [items, setItems] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const qs = new URLSearchParams(Object.entries(filters).filter(([_,v]) => v !== undefined) as any).toString();
    fetch(`/.netlify/functions/coupons?${qs}`, { headers: { "Cache-Control": "no-cache" } })
      .then(r => r.json())
      .then(d => { if (!alive) return; setItems(d.items || []); setLoading(false); })
      .catch(() => setLoading(false));
    return () => { alive = false; };
  }, [JSON.stringify(filters)]);

  if (loading) return <div className="p-4 text-neutral-400">Betöltés…</div>;
  if (!items.length) return <div className="p-4 text-neutral-400">Nincs találat.</div>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3">
      {items.map(d => (
        <a key={d.id} href={d.url} target="_blank" rel="noopener"
           className="block bg-neutral-900 rounded-lg p-3 hover:ring-2 ring-amber-400 transition">
          <div className="mb-2 font-semibold text-white line-clamp-2">{d.title}</div>
          <div className="text-sm text-neutral-300">
            {d.price ? `$${d.price}` : ""} {d.orig ? <span className="line-through opacity-60 ml-2">${d.orig}</span> : null}
          </div>
          <div className="text-xs text-neutral-500 mt-1">{d.wh || "—"} {d.end ? `• lejár: ${new Date(d.end).toLocaleDateString()}` : ""}</div>
        </a>
      ))}
    </div>
  );
}
