import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { supabasePublic } from "@/lib/supabase/public";
import { baseUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

marked.setOptions({ breaks: true });

/** Root-level custom pages: /contact, /about-us, /privacy-policy, ... —
 *  the /p/ prefix carried no meaning and cost URL keywords. Next gives
 *  static routes precedence, so this catch-all only sees paths no real
 *  route claimed; unknown slugs 404. /p/<slug> permanently redirects here
 *  (see app/p/[slug]/page.tsx) so old links and indexed URLs keep working. */
async function getPage(slug: string) {
  const supabase = supabasePublic();
  if (!supabase) return null;
  const { data } = await supabase
    .from("pages")
    .select("title, content, status")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return data;
}

/** Strip markdown syntax down to a plain-text meta description — these
 *  pages (legal pages, etc.) previously had no description at all, which
 *  means Google falls back to guessing a snippet from the rendered page,
 *  and there's no canonical, either. */
function excerptFrom(markdown: string, maxLen = 160): string | undefined {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;
  return text.length > maxLen ? `${text.slice(0, maxLen - 1).trimEnd()}…` : text;
}

// Next.js 15+ resolves dynamic route params asynchronously (a Promise
// instead of a plain object) — has to be awaited before use.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) return { title: "Page" };
  return {
    title: page.title,
    description: excerptFrom(page.content || ""),
    alternates: { canonical: `${baseUrl()}/${slug}` },
  };
}

export default async function CustomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) return notFound();

  return (
    <div className="page">
      <div className="ad__panel" style={{ maxWidth: 820, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 18 }}>{page.title}</h1>
        {/* Page content is written in the dashboard by an authenticated admin
           only (never public input), so rendering the parsed markdown as
           HTML here is the same trust boundary as everything else in this
           admin-authored content model (blog posts, movie descriptions). */}
        <div className="pagecontent" dangerouslySetInnerHTML={{ __html: marked.parse(page.content || "") as string }} />
      </div>
    </div>
  );
}
