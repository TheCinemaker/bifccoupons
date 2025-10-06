import matter from "gray-matter";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { JSDOM } from "jsdom"; // csak SSR környezetben kellene, de Vite devnél nem használjuk
// Tip: böngészőben DOMPurify window-ot használ; Vite buildnél elég a default import.

export type PostMeta = {
  slug: string;
  title: string;
  excerpt?: string;
  date: string;      // ISO
  cover?: string;
  tags?: string[];
};

export type Post = PostMeta & { html: string };

const md = new MarkdownIt({ linkify: true, breaks: true });

function toSlug(p: string) {
  return p
    .replace(/^.*\/posts\//, "")
    .replace(/\.md$/i, "")
    .replace(/[^a-z0-9\-\/]+/gi, "-")
    .toLowerCase();
}

export function loadAllPosts(): PostMeta[] {
  // Vite: importáljuk a Markdown fájlokat nyers szövegként
  const files = import.meta.glob("./posts/**/*.md", { as: "raw", eager: true }) as Record<string,string>;
  const out: PostMeta[] = [];

  for (const [path, raw] of Object.entries(files)) {
    const { data } = matter(raw);
    const slug = toSlug(path);
    if (!data?.title || !data?.date) continue;

    out.push({
      slug,
      title: String(data.title),
      excerpt: data.excerpt ? String(data.excerpt) : undefined,
      date: new Date(data.date).toISOString(),
      cover: data.cover ? String(data.cover) : undefined,
      tags: Array.isArray(data.tags) ? data.tags.map(String) : undefined,
    });
  }

  return out.sort((a,b) => b.date.localeCompare(a.date));
}

export function loadPost(slug: string): Post | null {
  // Keressük azt a .md-t, ami illik a slugra
  const files = import.meta.glob("./posts/**/*.md", { as: "raw", eager: true }) as Record<string,string>;
  const entry = Object.entries(files).find(([p]) => toSlug(p) === slug);
  if (!entry) return null;

  const [_, raw] = entry;
  const { data, content } = matter(raw);

  const unsafeHtml = md.render(content);
  // böngészőben DOMPurify(window) elérhető; SSR-nél kell JSDOM – itt SPA, így egyszerű:
  const html = DOMPurify.sanitize(unsafeHtml);

  return {
    slug,
    title: String(data.title || slug),
    excerpt: data.excerpt ? String(data.excerpt) : undefined,
    date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
    cover: data.cover ? String(data.cover) : undefined,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : undefined,
    html,
  };
}
