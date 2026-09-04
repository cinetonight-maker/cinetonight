import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Icon from "@/components/Icon";
import CommentsSection from "@/components/CommentsSection";
import FollowStrip from "@/components/FollowStrip";
import { getBlog, getBlogs } from "@/lib/data";
import { faqPairs } from "@/lib/blogSeo";
import { img } from "@/lib/images";
import { baseUrl } from "@/lib/site";
import { redirectOrNotFound } from "@/lib/redirectMap";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { renderMarkdown, markdownToText } from "@/lib/markdown";
import { relatedPosts } from "@/lib/linkGraph";
import { authorFor } from "@/lib/authors";
import { metaDescription } from "@/lib/metaDesc";

/** b.date is a display string like "Aug 1, 2024" — best-effort parse for
 *  JSON-LD's ISO datePublished; falls back to omitting the field rather
 *  than emitting an invalid date if it doesn't parse. */
function isoDate(display: string): string | undefined {
  const d = new Date(display);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

// Next.js 15+ resolves dynamic route params asynchronously (a Promise
// instead of a plain object) — has to be awaited before use.
interface Params { params: Promise<{ slug: string }> }

/** Metadata for a page whose record could not be resolved.
 *
 *  NOTE (unresolved): notFound() renders the 404 view but the response still
 *  carries HTTP 200 - a soft 404. Verified locally that Next's own unmatched
 *  route 404s correctly while notFound() does not, and that a loading.tsx
 *  boundary is NOT the cause. Until the status is fixed, these directives are
 *  what stop crawlers keeping and re-fetching invented ids, which matters here
 *  because the id space is unbounded (any tmdb-* number). Check the deployed
 *  Worker before assuming it is broken in production too. */
const NOT_FOUND_META = { title: "Not found", robots: { index: false, follow: false } } as const;


// force-dynamic, NOT ISR — and this is a deliberate trade (Phase 4B-2).
//
// Measured in the Worker: with ISR on, every INVENTED slug made Next render the
// not-found result and PERSIST it — one permanent R2 object per junk URL, 77 KB
// and up, on an unbounded space. Ten junk slugs produced ten objects. The same
// mechanism took the bucket to 2.79M objects / 211 GB once already, which is
// why /person/[id] and /[slug] were made force-dynamic before this.
//
// The middleware guard (lib/pathGuard.ts) stops malformed slugs earlier and for
// free, but it cannot know which well-formed slugs are real without a database
// lookup — so only this closes the hole completely.
//
// WHAT IT COSTS: a real article is no longer persisted between requests. It is
// still absorbed by the Cloudflare edge cache (next.config.mjs gives /blog/:path*
// `s-maxage=3600`), which is FREE, unlike the R2 incremental cache. Googlebot
// receives identical HTML either way, so nothing about indexing changes. The
// Supabase read behind it is still cached on its own tier, so this adds no
// database traffic.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const b = await getBlog(slug);
  if (!b) return NOT_FOUND_META;
  const url = `${baseUrl()}/blog/${b.slug}`;
  const image = b.imageUrl || img(`article-${b.slug}`, 1000, 500);
  // Social share image falls back to the featured image — the ideal 1200x630
  // crop is rarely the ideal blog-card crop, so the dashboard can set both.
  const shareImage = b.ogImage || image;
  // Canonical override (supabase/blog_seo.sql). Blank — which is the right
  // answer for almost every article — means the post is its own canonical.
  // A relative value is resolved against metadataBase, same as everywhere else.
  const canonical = b.canonicalUrl?.trim() || url;
  return {
    // Dashboard SEO overrides win when set; title/excerpt are the fallback.
    title: b.metaTitle || b.title,
    description: metaDescription(b.metaDescription || b.excerpt),
    // Per-page `alternates` fully replaces the root layout's (where the RSS
    // autodiscovery link normally lives), so it has to be repeated here.
    alternates: { canonical, types: { "application/rss+xml": "/rss.xml" } },
    // Per-article noindex. `follow` stays ON: a hidden article's links to real
    // pages should still carry value, same rule as /person/[id].
    ...(b.noindex ? { robots: { index: false, follow: true } } : {}),
    // Secondary keywords are a planning aid first, but emitting them costs
    // nothing and some non-Google services still read the tag.
    ...(b.secondaryKeywords?.length
      ? { keywords: [b.focusKeyword, ...b.secondaryKeywords].filter(Boolean) as string[] }
      : {}),
    openGraph: { title: b.title, description: b.excerpt, type: "article", url, images: [{ url: shareImage }] },
    twitter: { card: "summary_large_image", title: b.title, description: b.excerpt, images: [shareImage] },
  };
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const b = await getBlog(slug);
  // A slug with no post is the ONLY place the redirect table is consulted, so
  // a request for a real article never pays for the redirect system existing.
  // Either redirects or 404s — never returns. See lib/redirectMap.ts.
  if (!b) return redirectOrNotFound(`/blog/${slug}`);

  const image = b.imageUrl || img(`article-${b.slug}`, 1000, 500);
  // getBlogs() is already in React's per-render cache (getBlog uses it for its
  // membership check), so this adds no database query and no cache entry.
  const related = relatedPosts(await getBlogs(), b, 3);
  const crumbs = breadcrumbJsonLd([
    { name: "Home", path: "/" }, { name: "Blog", path: "/blog" }, { name: b.title },
  ]);

  const postAuthor = authorFor(b.author);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: b.title,
    // Excerpt is the intended summary; fall back to the opening of the article
    // itself rather than emitting an empty description.
    description: b.excerpt || metaDescription(markdownToText(b.body)),
    image,
    datePublished: isoDate(b.date),
    // Freshness. Google reads dateModified when deciding how recently a page
    // was genuinely revised, so it must reflect a real edit — it comes from the
    // row's own updated_at, never from "now", which would claim every crawl was
    // an update and is the kind of lie that gets lastmod signals ignored.
    ...(b.updatedAt ? { dateModified: isoDate(b.updatedAt) } : {}),
    // A NAMED PERSON, not an organisation.
    //
    // This used to say Organization "CineTonight Editorial", which tells a
    // search or answer engine nothing about who is accountable for the piece.
    // The author comes from the post's own `author` column, falling back to
    // the default author when it is empty or the column does not exist yet
    // (see lib/authors.ts and supabase/blog_author.sql), so this is correct
    // for every existing post without anyone editing one.
    author: {
      "@type": "Person",
      name: postAuthor.name,
      jobTitle: postAuthor.role,
      url: `${baseUrl()}/author/${postAuthor.slug}`,
      ...(postAuthor.sameAs.length ? { sameAs: postAuthor.sameAs } : {}),
    },
    // Required for an Article rich result. Without a publisher carrying a logo
    // the markup is valid but ineligible.
    publisher: {
      "@type": "Organization",
      name: "CineTonight",
      logo: { "@type": "ImageObject", url: `${baseUrl()}/logo-512.png` },
    },
    mainEntityOfPage: `${baseUrl()}/blog/${b.slug}`,
  };

  /* FAQ markup, built from the article's own FAQ section.
   *
   * This is the single highest-value piece of structured data on the site:
   * Google's AI summaries and the answer engines quote FAQ entries close to
   * verbatim, but only where FAQPage says that is what they are. Authors write
   * the questions as headings and get the schema for free.
   *
   * Emitted only when the article really has an FAQ — an empty FAQPage would
   * be a claim about the page that is not true. */
  // Legacy rows still hold the body as an array of paragraphs; joining is what
  // lib/markdown.ts does for the same reason, so both shapes are handled here.
  const faq = faqPairs(Array.isArray(b.body) ? b.body.join("\n\n") : b.body ?? "");
  const faqJsonLd = faq.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faq.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      }
    : null;

  return (
    <div className="page">
      {/* eslint-disable-next-line react/no-danger -- static JSON-LD we built above, not user input */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      {/* eslint-disable-next-line react/no-danger -- static JSON-LD */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs).replace(/</g, "\\u003c") }} />
      {faqJsonLd && (
        // eslint-disable-next-line react/no-danger -- built from the post body above, not user input
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c") }} />
      )}
      <div className="article">
        <span className="article__cat">{b.cat}</span>
        <h1 className="article__t">{b.title}</h1>
        <div className="article__meta">
          By <Link className="article__author" href={`/author/${postAuthor.slug}`}>{postAuthor.name}</Link>
          {" · "}{b.date} · {b.read} read
        </div>
        <div className="article__img"><Image fill alt={b.imageAlt || b.title} src={image} sizes="(max-width: 900px) 100vw, 760px" priority /></div>
        {/* Rendered by lib/markdown.ts — the SAME function the admin preview
            uses, so what an author sees before publishing is what ships.
            That module escapes every "<" before parsing, so no raw HTML from
            the database can reach this page: the only tags here are ones
            `marked` built from Markdown syntax, with link/image URLs checked
            against a scheme allow-list. Legacy array bodies render
            identically (they are joined with blank lines), so posts written
            before the CMS update are unchanged. */}
        {/* eslint-disable-next-line react/no-danger -- sanitized by renderMarkdown (escape-then-parse) */}
        <div className="article__body" dangerouslySetInnerHTML={{ __html: renderMarkdown(b.body ?? b.excerpt) }} />

        {related.length > 0 && (
          /* Every article now links on to three more. This is the single
             cheapest SEO improvement available here: it gives Google a real
             path between articles instead of leaving each one a dead end, and
             it gives a reader who finished this piece somewhere to go.
             Costs no extra database work — getBlogs() is already loaded and
             React-cached for this render. */
          <aside className="related" aria-labelledby="related-h">
            <h2 className="related__h" id="related-h">Read next</h2>
            <div className="related__grid">
              {related.map((r) => (
                <Link className="related__c" key={r.slug} href={`/blog/${r.slug}`}>
                  <span className="related__cat">{r.cat}</span>
                  <span className="related__t">{r.title}</span>
                  <span className="related__m">{r.read} read</span>
                </Link>
              ))}
            </div>
          </aside>
        )}

        <CommentsSection
          movie={{ id: `blog-${b.slug}`, title: b.title, rating: 0 }}
          heading="Comments"
          showScore={false}
        />
        <FollowStrip />
        <div style={{ marginTop: 24 }}>
          <Link className="btn btn--ghost" href="/blog"><Icon name="chevl" size={15} /> Back to Blog</Link>
        </div>
      </div>
    </div>
  );
}
