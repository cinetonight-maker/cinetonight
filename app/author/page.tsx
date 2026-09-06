import Link from "next/link";
import type { Metadata } from "next";
import { AUTHORS } from "@/lib/authors";
import { baseUrl } from "@/lib/site";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";

/* An index of the individual /author/[slug] pages - those pages existed but
 * had no listing and no nav entry pointing at them, so the only way to
 * reach one was to already be reading an article by that person. This page
 * plus the Footer's "Our Writers" link (components/Footer.tsx) are what
 * make the roster actually reachable from the site's navigation. */
export const revalidate = 600;

export function generateMetadata(): Metadata {
  const url = `${baseUrl()}/author`;
  return {
    title: "Our Writers - CineTonight",
    description: "Meet the people who write, review and fact-check what you read on CineTonight.",
    alternates: { canonical: url },
  };
}

export default function AuthorsIndexPage() {
  const crumbs = breadcrumbJsonLd([
    { name: "Home", path: "/" }, { name: "Blog", path: "/blog" }, { name: "Our Writers" },
  ]);
  return (
    <div className="page">
      {/* eslint-disable-next-line react/no-danger -- static JSON-LD built above */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs).replace(/</g, "\\u003c") }} />
      <div className="article">
        <span className="article__cat">CineTonight</span>
        <h1 className="article__t">Our Writers</h1>
        <div className="article__body">
          <p>The people who write, review and fact-check what you read on CineTonight.</p>
        </div>
        <div className="related__grid" style={{ marginTop: 24 }}>
          {AUTHORS.map((a) => (
            <Link className="related__c" key={a.slug} href={`/author/${a.slug}`}>
              <span className="related__cat">{a.role}</span>
              <span className="related__t">{a.name}</span>
              <span className="related__m">{a.short}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
