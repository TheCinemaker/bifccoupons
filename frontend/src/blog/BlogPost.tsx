import React from "react";
import { useParams, Link } from "react-router-dom";
import { format } from "date-fns";
import { loadPost } from "./utils";

export default function BlogPost() {
  const { slug = "" } = useParams();
  const post = loadPost(slug);

  if (!post) return <div className="p-4 text-neutral-400">A bejegyzés nem található.</div>;

  const words = post.html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 200)); // ~200 wpm

  const share = async () => {
    const url = window.location.href;
    if ((navigator as any).share) {
      try { await (navigator as any).share({ title: post.title, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      alert("Link vágólapra másolva.");
    }
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

      <div className="mt-8">
        <Link to="/blog" className="text-amber-300 hover:text-amber-200">← vissza a bloghoz</Link>
      </div>
    </article>
  );
}
