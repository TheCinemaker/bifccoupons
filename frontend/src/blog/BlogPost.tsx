import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { format } from "date-fns";
import { loadPost } from "./utils";

type Deal = {
  id: string; src?: string; store?: string; title: string; url: string; short?: string;
  wh?: string; code?: string; price?: number; orig?: number; cur?: string; end?: string; image?: string;
};

function formatPrice(v?: number, cur?: string) {
  if (v == null) return "";
  const c = (cur || "USD").toUpperCase();
  const sym = c === "USD" ? "$" : c === "EUR" ? "€" : c;
  return `${sym}${v.toFixed(2)}`;
}

const FALLBACK_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='512' height='256' viewBox='0 0 512 256'>
      <rect width='512' height='256' fill='#111827'/>
      <text x='50%' y='52%' fill='#9ca3af' font-family='system-ui,Segoe UI,Roboto,Ubuntu,Arial' text-anchor='middle' font-size='16'>no image</text>
    </svg>`
  );

export default function BlogPost() {
  const { slug = "" } = useParams();
  const post = loadPost(slug);

  const [related, setRelated] = useState<Deal[]>([]);
  const [loadingRel, setLoadingRel] = useState(true);

  useEffect(() => {
    if (!post) return;
    setLoadingRel(true);

    // Elsőként tag alapján, ha nincs tag, akkor a cím első 3 kulcsszava
    const q =
      (post.tags && post.tags[0]) ||
      post.title
        .split(/\s+/)
        .filter(w => w.length > 2)
        .slice(0, 3)
        .join(" ");

    const p = new URLSearchParams({
      q,
      limit: "12",
      sort: "price_asc"
    });

    fetch(`/.netlify/functions/search?` + p.toString(), { headers: { "Cache-Control": "no-cache" } })
      .then(r => r.json())
      .then(d => setRelated(d.items || []))
      .finally(() => setLoadingRel(false));
  }, [slug, post?.title]);

  if (!post) return <div className="p-4 text-neutral-400">A bejegyzés nem található.</div>;

  const words = post.html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 200));

  const share = async () => {
    const url = window.location.href;
    if ((navigator as any).share) { try { await (navigator as any).share({ title: post.title, url }); } catch {} }
    else { await navigator.clipboard.writeText(url); alert("Link vágólapra másolva."); }
  };

  return (
    <article className="max-w-3xl mx-auto p-4">
      <div className="text-sm text-neutral-400 flex items-center justify-between mb-2">
        <span>{format(new Date(post.date), "yyyy. MM. dd.")} • {minutes} perc olvasás</span>
        <button onClick={share} className="text-amber-300 hover:text-amber-200">Megosztás</button>
      </div>

      <h1 className="text-2xl font-bold text-white mb-3">{post.title}</h1>

      {post.cover && (
        <img src={post.cover} alt="" className="w-full rounded-lg mb-4 object-cover max-h-80" loading="lazy" decoding="async" />
      )}

      <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: post.html }} />

      {/* Kapcsolódó dealek */}
      <section className="mt-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">Kapcsolódó dealek</h2>
          <Link to="/" className="text-sm text-amber-300 hover:text-amber-200">Összes deal →</Link>
        </div>

        {loadingRel ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-neutral-900 rounded-lg p-3">
                <div className="w-full h-28 rounded-md mb-2 bg-neutral-800 animate-pulse" />
                <div className="h-3 w-3/4 bg-neutral-800 rounded mb-2 animate-pulse" />
                <div className="h-3 w-1/2 bg-neutral-800 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : !related.length ? (
          <div className="text-neutral-400">Jelenleg nincs ide passzoló ajánlat.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {related.slice(0, 6).map((d) => {
              const out = d.short || d.url;
              const go =
                `/.netlify/functions/go?u=${encodeURIComponent(out)}` +
                `&src=${encodeURIComponent(d.src || "")}` +
                `&code=${encodeURIComponent(d.code || "")}`;
              const img = d.image ? `/.netlify/functions/img?u=${encodeURIComponent(d.image)}` : FALLBACK_SVG;
              const price = formatPrice(d.price, d.cur);
              const ends = d.end ? `lejár: ${new Date(d.end).toLocaleDateString("hu-HU")}` : "";

              return (
                <a key={d.id} href={go} target="_blank" rel="noopener noreferrer nofollow ugc"
                   className="block bg-neutral-900 rounded-lg p-3 hover:ring-2 ring-amber-400 transition">
                  <div className="relative w-full h-28 mb-2">
                    <img
                      src={img}
                      alt={d.title}
                      className="absolute inset-0 w-full h-full object-cover rounded-md bg-neutral-800"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_SVG; }}
                    />
                  </div>
                  <div className="text-sm font-semibold text-white line-clamp-2">{d.title}</div>
                  <div className="text-xs text-neutral-300 mt-1">{price}{d.wh ? ` • ${d.wh}` : ""}{ends ? ` • ${ends}` : ""}</div>
                  {d.code && (
                    <div className="mt-2 text-[11px] font-mono px-2 py-1 rounded bg-neutral-800 text-neutral-100 border border-neutral-700 inline-block">
                      {d.code}
                    </div>
                  )}
                </a>
              );
            })}
          </div>
        )}
      </section>

      <div className="mt-8">
        <Link to="/blog" className="text-amber-300 hover:text-amber-200">← vissza a bloghoz</Link>
      </div>
    </article>
  );
}
