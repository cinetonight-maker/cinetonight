import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AUTHORS, authorBySlug } from "@/lib/authors";
import { getBlogs } from "@/lib/data";
import { baseUrl } from "@/lib/site";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { authorFor } from "@/lib/authors";

interface Params { params: Promise<{ slug: string }> }

/* The people behind the content, as real pages.
 *
 * WHY: article JSON-LD used to name an Organization as its author, which tells
 * a search or answer engine almost nothing. A Person with a role, a bio and a
 * body of work attached is the strongest E-E-A-T signal a small site can add,
 * and it costs one route.
 *
 * Static: the roster is a hard-coded array, so every author page prerenders.
 * The post list underneath revalidates on the same tier as the blog index. */
export async function generateStaticParams() {
  return AUTHORS.map((a) => ({ slug: a.slug }));
}
export const dynamicParams = false;
export const revalidate = 600;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const a = authorBySlug(slug);
  if (!a) return { title: "Not found", robots: { index: false, follow: false } };
  const url = `${baseUrl()}/author/${a.slug}`;
  return {
    title: `${a.name}, ${a.role}`,
    description: a.short,
    alternates: { canonical: url, types: { "application/rss+xml": "/rss.xml" } },
    openGraph: { title: `${a.name} — CineTonight`, description: a.short, type: "profile", url },
  };
}

export default async function AuthorPage({ params }: Params) {
  const { slug } = await params;
  const a = authorBySlug(slug);
  if (!a) notFound();

  // Posts credited to this author, newest first. authorFor() resolves the
  // fallback too, so the default author's page lists every unattributed post
  // rather than looking empty.
  const posts = (await getBlogs()).filter((b) => authorFor(b.author).slug === a.slug);

  const url = `${baseUrl()}/author/${a.slug}`;
  const personJsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: a.name,
    jobTitle: a.role,
    description: a.short,
    url,
    // Only emitted when real profiles exist. An invented sameAs points the
    // entity graph at somebody who is not this person, which is worse than
    // saying nothing.
    ...(a.sameAs.length ? { sameAs: a.sameAs } : {}),
    worksFor: { "@type": "Organization", name: "CineTonight", url: baseUrl() },
  };
  const crumbs = breadcrumbJsonLd([
    { name: "Home", path: "/" }, { name: "Blog", path: "/blog" }, { name: a.name },
  ]);

  return (
    <div className="page">
      {/* eslint-disable-next-line react/no-danger -- static JSON-LD built above */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd).replace(/</g, "\\u003c") }} />
      {/* eslint-disable-next-line react/no-danger -- static JSON-LD */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs).replace(/</g, "\\u003c") }} />

      <div className="article">
        <span className="article__cat">{a.role}</span>
        <h1 className="article__t">{a.name}</h1>
        <div className="article__body">
          {a.bio.map((p, i) => <p key={i}>{p}</p>)}
        </div>

        {posts.length > 0 && (
          <aside className="related" aria-labelledby="by-h">
            <h2 className="related__h" id="by-h">
              {posts.length === 1 ? "1 article" : `${posts.length} articles`} by {a.name}
            </h2>
            <div className="related__grid">
              {posts.map((p) => (
                <Link className="related__c" key={p.slug} href={`/blog/${p.slug}`}>
                  <span className="related__cat">{p.cat}</span>
                  <span className="related__t">{p.title}</span>
                  <span className="related__m">{p.date} · {p.read} read</span>
                </Link>
              ))}
            </div>
          </aside>
        )}

        <div style={{ marginTop: 24 }}>
          <Link className="btn btn--ghost" href="/about-us">About CineTonight</Link>
        </div>
      </div>
    </div>
  );
}
