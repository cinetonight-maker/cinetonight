import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { supabasePublic } from "@/lib/supabase/public";
import { baseUrl } from "@/lib/site";

// force-dynamic ON PURPOSE - this used to be ISR, and that was a spray hole.
// This catch-all matches EVERY root-level path no other route claims, so any
// bot (or anyone malicious) hitting /random-junk-1, /random-junk-2, ... was
// minting a fresh R2 page-cache entry per URL, forever, at Class A write
// prices. These pages (about, privacy, contact...) get little traffic, so
// rendering per-request costs near nothing - and the slug LIST below is one
// stable cached query, so a spray never even reaches the database.
export const dynamic = "force-dynamic";

marked.setOptions({ breaks: true });

/** Root-level custom pages: /contact, /about-us, /privacy-policy, ... —
 *  the /p/ prefix carried no meaning and cost URL keywords. Next gives
 *  static routes precedence, so this catch-all only sees paths no real
 *  route claimed; unknown slugs 404. /p/<slug> permanently redirects here
 *  (see app/p/[slug]/page.tsx) so old links and indexed URLs keep working. */
/** Published slugs, as ONE stable query URL - so it lives in the data cache
 *  as a single reusable entry no matter what garbage path gets requested.
 *  Never query per-slug before checking this list: a per-slug query embeds
 *  the attacker-controlled slug in the fetch URL, and every unique URL is a
 *  fresh data-cache write. */
const publishedSlugs = cache(async (): Promise<Set<string>> => {
  const supabase = supabasePublic();
  if (!supabase) return new Set();
  const { data } = await supabase.from("pages").select("slug").eq("status", "published");
  return new Set((data ?? []).map((r: { slug: string }) => r.slug));
});

const getPage = cache(async (slug: string) => {
  const supabase = supabasePublic();
  if (!supabase) return null;
  // Membership first - unknown slugs stop HERE, at the shared cached list,
  // and never generate a per-slug query URL.
  if (!(await publishedSlugs()).has(slug)) return null;
  const { data } = await supabase
    .from("pages")
    .select("title, content, status")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return data;
});

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
