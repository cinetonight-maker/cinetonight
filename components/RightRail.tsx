import Link from "next/link";
import Icon from "./Icon";
import type { Movie } from "@/lib/types";
import { BLOGS, GENRES, trendingNow } from "@/lib/data";
import { img, poster } from "@/lib/images";

export function Widget({ title, all, children }: { title: string; all?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="widget">
      <div className="widget__h"><h3>{title}</h3>{all}</div>
      {children}
    </div>
  );
}

export function TrendingWidget() {
  return (
    <Widget title="Trending Now" all={<Link href="/trending">View All</Link>}>
      {trendingNow(5).map((m, i) => (
        <Link key={m.id} className="trow" href={`/movie/${m.id}`}>
          <span className="trow__rank">{i + 1}</span>
          <div className="trow__th">{/* eslint-disable-next-line @next/next/no-img-element */}<img loading="lazy" alt="" src={poster(m, "w342")} /></div>
          <div>
            <div className="trow__t">{m.title}</div>
            <div className="trow__m">{[m.year || null, m.genres[0] || null].filter(Boolean).join(" · ")}</div>
            <div className="trow__r"><Icon name="star" size={11} /> {m.rating.toFixed(1)}</div>
          </div>
        </Link>
      ))}
    </Widget>
  );
}

export function GenresWidget() {
  return (
    <Widget title="Genres" all={<Link href="/genres">All</Link>}>
      <div className="tags">
        {GENRES.slice(0, 9).map((g) => (
          <Link key={g} className="tag" href={`/movies?genre=${encodeURIComponent(g)}`}>{g}</Link>
        ))}
      </div>
    </Widget>
  );
}

export function BlogWidget() {
  return (
    <Widget title="From the Blog" all={<Link href="/blog">All</Link>}>
      {BLOGS.map((b) => (
        <Link key={b.slug} className="bmini" href={`/blog/${b.slug}`}>
          <div className="bmini__th">{/* eslint-disable-next-line @next/next/no-img-element */}<img loading="lazy" alt="" src={img(`bw-${b.slug}`, 160, 110)} /></div>
          <div><div className="bmini__t">{b.title}</div><div className="bmini__d">{b.date} · {b.read}</div></div>
        </Link>
      ))}
    </Widget>
  );
}

export function NewsWidget() {
  return (
    <div className="news">
      <h3>Never miss a premiere</h3>
      <p>Get weekly picks and blog posts in your inbox.</p>
      <input placeholder="you@email.com" aria-label="Email" />
      <button type="button">Subscribe</button>
    </div>
  );
}

/** Compact row list (thumb + title/meta/rating) — narrower than a poster grid,
 *  so the sidebar can stay slim while still showing several titles. */
export function PosterWidget({ title, movies, href = "/movies" }: { title: string; movies: Movie[]; href?: string }) {
  return (
    <Widget title={title} all={<Link href={href}>More</Link>}>
      {movies.map((m) => (
        <Link key={m.id} className="trow" href={`/movie/${m.id}`}>
          <div className="trow__th">{/* eslint-disable-next-line @next/next/no-img-element */}<img loading="lazy" alt="" src={poster(m, "w342")} /></div>
          <div>
            <div className="trow__t">{m.title}</div>
            <div className="trow__m">{[m.year || null, m.genres[0] || null].filter(Boolean).join(" · ")}</div>
            <div className="trow__r"><Icon name="star" size={11} /> {m.rating.toFixed(1)}</div>
          </div>
        </Link>
      ))}
    </Widget>
  );
}
