import React from "react";
import { useParams, Link } from "react-router-dom";
import { loadPost } from "./utils";

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? loadPost(slug) : null;

  if (!post) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <p className="text-neutral-400">A bejegyzés nem található.</p>
        <Link to="/blog" className="text-amber-400 hover:underline">← Vissza a bloghoz</Link>
      </div>
    );
  }

  return (
    <article className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-1">{post.title}</h1>
      <div className="text-xs text-neutral-500 mb-4">{new Date(post.date).toLocaleDateString("hu-HU")}</div>
      {post.cover ? (
        <img src={post.cover} alt="" className="w-full h-60 object-cover rounded mb-4" loading="lazy" />
      ) : null}
      <div
        className="prose prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: post.html }}
      />
      <div className="mt-6">
        <Link to="/blog" className="text-amber-400 hover:underline">← Vissza a bloghoz</Link>
      </div>
    </article>
  );
}
