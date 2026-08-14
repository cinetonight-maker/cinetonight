import type { Metadata } from "next";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { getBlogs, getSiteSettings } from "@/lib/data";

/** The "link in bio" landing page — our own Linktree. Social profiles point
 *  here; the buttons always surface the freshest content (latest blog post
 *  is pulled live) so the bio link never goes stale. noindex: it's a
 *  navigation utility for social visitors, not search content. */
export const metadata: Metadata = {
  title: "CineTonight Links",
  robots: { index: false, follow: true },
};
export const dynamic = "force-dynamic";

export default async function LinksPage() {
  const [posts, settings] = await Promise.all([getBlogs(), getSiteSettings()]);
  const latest = posts[0];

  const buttons: { href: string; title: string; sub: string; accent?: boolean }[] = [
    ...(latest ? [{ href: `/blog/${latest.slug}`, title: `Latest: ${latest.title}`, sub: "Our newest story", accent: true }] : []),
    { href: "/", title: "What to Watch Tonight", sub: "Trailers, Top 10s and tonight's picks" },
    { href: "/free-movies", title: "Free Classic Movies", sub: "Full films, free and 100 percent legal" },
    { href: "/search", title: "Find Any Movie or Show", sub: "See where it streams in your country" },
    { href: "/follow", title: "All Our Socials", sub: "Instagram, YouTube, TikTok and more" },
  ];

  return (
    <div className="page linkshub">
      <div className="linkshub__head">
        <BrandMark size={54} />
        <h1>Cine<b>Tonight</b></h1>
        <p>Know what to watch tonight</p>
      </div>
      <div className="linkshub__list">
        {buttons.map((b) => (
          <Link key={b.href} className={`linkshub__btn${b.accent ? " linkshub__btn--hot" : ""}`} href={b.href}>
            <span className="linkshub__t">{b.title}</span>
            <span className="linkshub__s">{b.sub}</span>
          </Link>
        ))}
      </div>
      <p className="linkshub__foot">cinetonight.com{settings.contactEmail ? ` · ${settings.contactEmail}` : ""}</p>
    </div>
  );
}
