import React from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { loadAllPosts } from "./utils";

export default function BlogList() {
  const posts = loadAllPosts();

  if (!posts.length) {
    return <div className="p-4 text-neutral-400">Még nincs bejegyzés.</div>;
  }

  return (
    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {posts.map(p => (
        <Link key={p.slug} to={`/blog/${p.slug}`} className="block bg-neutral-900 rounded-lg overflow-hidden hover:ring-2 ring-amber-400 transition">
          {p.cover ? (
            <img src={p.cover} alt={p.title} className="w-full h-40 object-cover" loading="lazy" decoding="async" />
          ) : (
            <div className="w-full h-40 bg-neutral-800" />
          )}
          <div className="p-3">
            <div className="text-xs text-neutral-400 mb-1">{format(new Date(p.date), "yyyy. MM. dd.")}</div>
            <div className="font-semibold text-white line-clamp-2">{p.title}</div>
            {p.excerpt && <div className="text-sm text-neutral-300 mt-1 line-clamp-2">{p.excerpt}</div>}
          </div>
        </Link>
      ))}
    </div>
  );
}
