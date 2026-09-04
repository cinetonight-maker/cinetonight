import Link from "next/link";
import Image from "next/image";
import Icon from "./Icon";
import { getBlogs } from "@/lib/data";
import GuideLink from "./GuideLink";
import type { Surface } from "@/lib/analytics";
import { PUBLIC_TTL } from "@/lib/supabase/public";
import { img } from "@/lib/images";

/** Blog teaser row.
 *
 *  `title` and `sub` are optional so a caller can reframe the block for its own
 *  context (the homepage presents these as decision guides rather than "blog
 *  posts"). Both default to the original wording, so every existing caller
 *  renders exactly as before. */
export default async function BlogSection({
  count = 3,
  title = "From the Blog",
  sub,
  analyticsSurface = "unknown",
}: {
  count?: number;
  title?: string;
  sub?: string;
  /** Where this teaser is embedded - lets GA answer "which surfaces send
   *  readers into guides". Controlled Surface value, never free text. */
  analyticsSurface?: Surface;
}) {
  // 6h tier: this teaser renders inside movie/genre/listing routes, so its
  // fetch TTL is part of THEIR revalidate ceiling. See getBlogs.
  const blogs = await getBlogs(PUBLIC_TTL.catalogue);

  // V2 layout (canvas Main "What to Watch Guides"): one featured guide with
  // its real cover, then compact rows for the rest. Same data, same links,
  // nothing invented — if only one post exists the list side stays empty.
  //
  // The rows carry each guide's OWN cover thumbnail rather than the 01/02/03
  // badges they used to. Two reasons, and the second is the important one:
  // the section sits between two image-heavy grids and was the only text-only
  // block on the page, and a numbered list implies a ranking that does not
  // exist — these are the most recent guides, not a top three.
  if (process.env.NEXT_PUBLIC_V2_THEME === "1") {
    const [feat, ...rest] = blogs;
    return (
      <section className="sec">
        <div className="sec__head">
          <div className="sec__titles">
            <h2>{title}</h2>
            {sub && <p className="sec__sub">{sub}</p>}
          </div>
          <Link className="sec__all" href="/blog">All Posts</Link>
        </div>
        {feat && (
          <div className="v2g">
            <GuideLink className="v2g-feat" href={`/blog/${feat.slug}`} slug={feat.slug} surface={analyticsSurface}>
              <Image fill alt={feat.title} src={feat.imageUrl || img(`b-${feat.slug}`, 900, 560)} sizes="(max-width: 900px) 100vw, 640px" />
              <span className="v2g-scrim" aria-hidden="true" />
              <span className="v2g-flag">Decision Guide</span>
              <span className="v2g-featbody">
                <span className="v2g-kicker">{feat.cat}</span>
                <span className="v2g-featt">{feat.title}</span>
                <span className="v2g-featx">{feat.excerpt}</span>
                <span className="v2g-featmeta">
                  <span>{feat.date} · {feat.read} read</span>
                  <span className="v2g-read">Read the guide →</span>
                </span>
              </span>
            </GuideLink>
            <div className="v2g-list">
              {rest.slice(0, 3).map((b) => (
                <GuideLink className="v2g-row" href={`/blog/${b.slug}`} slug={b.slug} surface={analyticsSurface} key={b.slug}>
                  <span className="v2g-thumb" aria-hidden="true">
                    <Image fill alt="" src={b.imageUrl || img(`b-${b.slug}`, 240, 240)} sizes="88px" />
                  </span>
                  <span className="v2g-rowbody">
                    <span className="v2g-kicker">{b.cat}</span>
                    <span className="v2g-rowt">{b.title}</span>
                    <span className="v2g-rowm">{b.read} read</span>
                  </span>
                  <span className="v2g-arrow" aria-hidden="true">→</span>
                </GuideLink>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="sec">
      <div className="sec__head">
        <div className="sec__titles">
          <h2>{title}</h2>
          {sub && <p className="sec__sub">{sub}</p>}
        </div>
        <Link className="sec__all" href="/blog">All Posts</Link>
      </div>
      <div className="blog-grid">
        {blogs.slice(0, count).map((b) => (
          <GuideLink className="blogc" href={`/blog/${b.slug}`} slug={b.slug} surface={analyticsSurface} key={b.slug}>
            <div className="blogc__img"><Image fill alt={b.title} src={b.imageUrl || img(`b-${b.slug}`, 600, 340)} sizes="(max-width: 760px) 100vw, 380px" /></div>
            <div className="blogc__b">
              <span className="blogc__cat">{b.cat}</span>
              <div className="blogc__t">{b.title}</div>
              <p className="blogc__x">{b.excerpt}</p>
              <div className="blogc__meta"><span>{b.date}</span><span>· {b.read} read</span><span className="rd">Read <Icon name="arrow" size={13} /></span></div>
            </div>
          </GuideLink>
        ))}
      </div>
    </section>
  );
}
