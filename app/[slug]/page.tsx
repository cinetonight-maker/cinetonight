import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { redirectOrNotFound } from "@/lib/redirectMap";
import { supabasePublic, PUBLIC_TTL } from "@/lib/supabase/public";
import { baseUrl } from "@/lib/site";
import { renderMarkdown, markdownToText } from "@/lib/markdown";

// force-dynamic ON PURPOSE - this used to be ISR, and that was a spray hole.
// This catch-all matches EVERY root-level path no other route claims, so any
// bot (or anyone malicious) hitting /random-junk-1, /random-junk-2, ... was
// minting a fresh R2 page-cache entry per URL, forever, at Class A write
// prices. These pages (about, privacy, contact...) get little traffic, so
// rendering per-request costs near nothing - and the slug LIST below is one
// stable cached query, so a spray never even reaches the database.
export const dynamic = "force-dynamic";

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
  // Tagged so an admin Publish/Update of any page can mark this list stale.
  const supabase = supabasePublic(PUBLIC_TTL.stable, ["cms:pages"]);
  if (!supabase) return new Set();
  const { data } = await supabase.from("pages").select("slug").eq("status", "published");
  return new Set((data ?? []).map((r: { slug: string }) => r.slug));
});

const getPage = cache(async (slug: string) => {
  // Both the collection tag and this page's own tag, so one page can be
  // refreshed without disturbing the others.
  const supabase = supabasePublic(PUBLIC_TTL.stable, ["cms:pages", `cms:page:${slug}`]);
  if (!supabase) return null;
  // Membership first - unknown slugs stop HERE, at the shared cached list,
  // and never generate a per-slug query URL.
  if (!(await publishedSlugs()).has(slug)) return null;
  // select("*") on purpose: the SEO columns (meta_title, meta_description)
  // arrive with supabase/pages_cms.sql, and naming a column that does not
  // exist yet would fail the whole query and 404 every page. "*" is one fixed
  // query URL either way, so it costs nothing in cache terms.
  // Trashed pages are forced to status=draft when they are binned, so the
  // filter below already keeps them off the site.
  const { data } = await supabase
    .from("pages")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return data as { title: string; content: string; meta_title?: string | null; meta_description?: string | null } | null;
});

/** Strip markdown syntax down to a plain-text meta description — these
 *  pages (legal pages, etc.) previously had no description at all, which
 *  means Google falls back to guessing a snippet from the rendered page,
 *  and there's no canonical, either. */
function excerptFrom(markdown: string, maxLen = 160): string | undefined {
  const text = markdownToText(markdown);
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
    // Dashboard SEO overrides win when set; the title and the opening of the
    // page are the fallback, same rule as blog posts.
    title: page.meta_title || page.title,
    description: page.meta_description || excerptFrom(page.content || ""),
    alternates: { canonical: `${baseUrl()}/${slug}` },
  };
}

export default async function CustomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPage(slug);
  // Same contract as /blog/[slug]: the redirect table is only consulted for a
  // path that was going to 404 anyway. This is the route that covers
  // /contact-us and every other retired root-level address.
  if (!page) return redirectOrNotFound(`/${slug}`);

  return (
    <div className="page">
      <div className="ad__panel" style={{ maxWidth: 820, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 18 }}>{page.title}</h1>
        {/* Rendered through lib/markdown.ts, NOT raw marked.parse().
           Previously this trusted the database row completely: any HTML in a
           page's content was injected verbatim, so a compromised admin login
           (or a bad paste) could put a <script> on a public page. The shared
           renderer escapes "<" before parsing, so only Markdown-constructed
           tags can exist, and link/image URLs are scheme-checked. */}
        {/* eslint-disable-next-line react/no-danger -- sanitized by renderMarkdown (escape-then-parse) */}
        <div className="pagecontent" dangerouslySetInnerHTML={{ __html: renderMarkdown(page.content) }} />
      </div>
    </div>
  );
}
