import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

export type Post = {
  slug: string;
  title: string;
  date: string;
  cover?: string;
  tags?: string[];
  html: string;
  excerpt: string;
};

const modules = import.meta.glob("./posts/**/*.md", { as: "raw", eager: true }) as Record<string, string>;

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

function parseFrontmatter(raw: string): { data: Record<string, any>; content: string } {
  const data: Record<string, any> = {};
  let content = raw;

  if (raw.startsWith("---")) {
    const end = raw.indexOf("\n---", 3);
    if (end !== -1) {
      const header = raw.slice(3, end).trim();
      content = raw.slice(end + 4);
      for (const line of header.split(/\r?\n/)) {
        const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (!m) continue;
        const key = m[1].trim();
        let val = m[2].trim();
        if (/^\[.*\]$/.test(val)) {
          data[key] = val
            .slice(1, -1)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        } else {
          data[key] = val.replace(/^["']|["']$/g, "");
        }
      }
    }
  }
  return { data, content };
}

function slugFromPath(p: string) {
  const m = p.match(/\/([^\/]+)\.md$/);
  return m ? m[1] : p;
}

export function loadAllPosts(): Post[] {
  const out: Post[] = [];
  for (const [path, raw] of Object.entries(modules)) {
    const { data, content } = parseFrontmatter(raw);
    const htmlUnsafe = md.render(content);
    const html = DOMPurify.sanitize(htmlUnsafe);

    const plain = content.replace(/[#>*_`\[\]()\-!\n\r]+/g, " ").replace(/\s+/g, " ").trim();
    const excerpt = plain.slice(0, 160) + (plain.length > 160 ? "…" : "");

    out.push({
      slug: slugFromPath(path),
      title: data.title || "Cím nélkül",
      date: data.date ? new Date(String(data.date)).toISOString() : new Date().toISOString(),
      cover: data.cover || undefined,
      tags: Array.isArray(data.tags)
        ? data.tags
        : data.tags
        ? String(data.tags).split(",").map((s: string) => s.trim())
        : [],
      html,
      excerpt,
    });
  }
  out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return out;
}

export function loadPost(slug: string): Post | null {
  return loadAllPosts().find((p) => p.slug === slug) || null;
}
