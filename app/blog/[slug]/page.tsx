import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Icon from "@/components/Icon";
import { getBlog, getBlogs } from "@/lib/data";
import { img } from "@/lib/images";
import { baseUrl } from "@/lib/site";

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

export async function generateStaticParams() {
  const blogs = await getBlogs();
  return blogs.map((b) => ({ slug: b.slug }));
}
export const dynamicParams = true;
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const b = await getBlog(slug);
  if (!b) return { title: "Not found" };
  const url = `${baseUrl()}/blog/${b.slug}`;
  const image = b.imageUrl || img(`article-${b.slug}`, 1000, 500);
  return {
    title: b.title,
    description: b.excerpt,
    // Per-page `alternates` fully replaces the root layout's (where the RSS
    // autodiscovery link normally lives), so it has to be repeated here.
    alternates: { canonical: url, types: { "application/rss+xml": "/rss.xml" } },
    openGraph: { title: b.title, description: b.excerpt, type: "article", url, images: [{ url: image }] },
    twitter: { card: "summary_large_image", title: b.title, description: b.excerpt, images: [image] },
  };
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const b = await getBlog(slug);
  if (!b) notFound();

  const image = b.imageUrl || img(`article-${b.slug}`, 1000, 500);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: b.title,
    description: b.excerpt,
    image,
    datePublished: isoDate(b.date),
    author: { "@type": "Organization", name: "MOVIEX Editorial" },
    mainEntityOfPage: `${baseUrl()}/blog/${b.slug}`,
  };

  return (
    <div className="page">
      {/* eslint-disable-next-line react/no-danger -- static JSON-LD we built above, not user input */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <div className="article">
        <span className="article__cat">{b.cat}</span>
        <h1 className="article__t">{b.title}</h1>
        <div className="article__meta">By Editorial Desk · {b.date} · {b.read} read</div>
        <div className="article__img"><Image fill alt="" src={image} sizes="(max-width: 900px) 100vw, 760px" priority /></div>
        <div className="article__body">
          {(b.body ?? [b.excerpt]).map((p, i) => <p key={i}>{p}</p>)}
        </div>
        <div style={{ marginTop: 24 }}>
          <Link className="btn btn--ghost" href="/blog"><Icon name="chevl" size={15} /> Back to Blog</Link>
        </div>
      </div>
    </div>
  );
}
