import React from "react";
import { Link } from "react-router-dom";
import { loadAllPosts } from "./utils";

export default function BlogList() {
  const posts = loadAllPosts();

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-bold mb-4">Blog</h1>
      <div className="space-y-6">
        {posts.map((p) => (
          <article key={p.slug} className="bg-neutral-900 p-4 rounded-lg border border-neutral-800">
            <h2 className="text-lg font-semibold">
              <Link to={`/blog/${p.slug}`} className="hover:underline">{p.title}</Link>
            </h2>
            <div className="text-xs text-neutral-500 mb-2">{new Date(p.date).toLocaleDateString("hu-HU")}</div>
            {p.cover ? (
              <img src={p.cover} alt="" className="w-full h-48 object-cover rounded mb-3" loading="lazy" />
            ) : null}
            <p className="text-neutral-300">{p.excerpt}</p>
            <div className="mt-3">
              <Link to={`/blog/${p.slug}`} className="text-amber-400 hover:underline">Tovább →</Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
