import matter from "gray-matter";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

export type Post = {
  slug: string;
  title: string;
  date: string;      // ISO
  cover?: string;
  tags?: string[];
  html: string;
  excerpt: string;
};

// Vite: olvassuk be RAW szövegként a .md fájlokat
// Pl.: src/blog/posts/kukirin-g2-pro.md
const modules = import.meta.glob("./posts/**/*.md", { as: "raw", eager: true }) as Record<string, string>;

function slugFromPath(path: string) {
  // "./posts/folder/name.md" -> "name"
  const m = path.match(/\/([^\/]+)\.md$/);
  return m ? m[1] : path;
}

export function loadAllPosts(): Post[] {
  const out: Post[] = [];

  for (const [path, raw] of Object.entries(modules)) {
    const { data, content } = matter(raw); // <-- kap stringet, nincs Buffer
    const htmlUnsafe = md.render(content);
    const html = DOMPurify.sanitize(htmlUnsafe);

    // excerpt = első 160 karakter plain szöveg
    const plain = content.replace(/[#>*_`\[\]()\-!\n\r]+/g, " ").replace(/\s+/g, " ").trim();
    const excerpt = plain.slice(0, 160) + (plain.length > 160 ? "…" : "");

    out.push({
      slug: slugFromPath(path),
      title: data.title || "Cím nélkül",
      date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
      cover: data.cover || undefined,
      tags: Array.isArray(data.tags) ? data.tags : data.tags ? String(data.tags).split(",").map((s: string) => s.trim()) : [],
      html,
      excerpt,
    });
  }

  // legújabb elöl
  out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return out;
}

export function loadPost(slug: string): Post | null {
  const all = loadAllPosts();
  return all.find(p => p.slug === slug) || null;
}
