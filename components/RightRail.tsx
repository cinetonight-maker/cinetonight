import Link from "next/link";
import Image from "next/image";
import Icon from "./Icon";
import NewsletterForm from "./NewsletterForm";
import type { Movie } from "@/lib/types";
import { getMovies, getBlogs, genresOf, trendingNow } from "@/lib/data";
import { img, poster } from "@/lib/images";

export function Widget({ title, all, children }: { title: string; all?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="widget">
      <div className="widget__h"><h3>{title}</h3>{all}</div>
      {children}
    </div>
  );
}

export async function TrendingWidget() {
  const movies = await getMovies();
  return (
    <Widget title="Trending Now" all={<Link href="/trending">View All</Link>}>
      {trendingNow(movies, 5).map((m, i) => (
        <Link key={m.id} className="trow" href={`/movie/${m.id}`}>
          <span className="trow__rank">{i + 1}</span>
          <div className="trow__th"><Image fill alt={`${m.title} poster`} src={poster(m, "w342")} sizes="44px" /></div>
          <div>
            <div className="trow__t">{m.title}</div>
            <div className="trow__m">{[m.year || null, m.genres[0] || null].filter(Boolean).join(" · ")}</div>
            {m.rating > 0 && <div className="trow__r"><Icon name="star" size={11} /> {m.rating.toFixed(1)}</div>}
          </div>
        </Link>
      ))}
    </Widget>
  );
}

export async function GenresWidget() {
  const movies = await getMovies();
  const genres = genresOf(movies);
  return (
    <Widget title="Genres" all={<Link href="/genres">All</Link>}>
      <div className="tags">
        {genres.slice(0, 9).map((g) => (
          <Link key={g} className="tag" href={`/movies?genre=${encodeURIComponent(g)}`}>{g}</Link>
        ))}
      </div>
    </Widget>
  );
}

export async function BlogWidget() {
  const blogs = await getBlogs();
  return (
    <Widget title="From the Blog" all={<Link href="/blog">All</Link>}>
      {blogs.map((b) => (
        <Link key={b.slug} className="bmini" href={`/blog/${b.slug}`}>
          <div className="bmini__th"><Image fill alt={b.title} src={b.imageUrl || img(`bw-${b.slug}`, 160, 110)} sizes="72px" /></div>
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
      <NewsletterForm />
    </div>
  );
}

/** Reference-style compact sidebar rows: poster thumb, bold title, a
 *  year + star-rating meta line, and a two-line synopsis — a lot of
 *  scannable info in a small area, so the sidebar sells each title
 *  instead of just naming it. */
export function PosterWidget({ title, movies, href = "/movies" }: { title: string; movies: Movie[]; href?: string }) {
  return (
    <Widget title={title} all={<Link href={href}>More</Link>}>
      {movies.map((m) => (
        <Link key={m.id} className="srow" href={`/movie/${m.id}`}>
          <div className="srow__th"><Image fill alt={`${m.title} poster`} src={poster(m, "w342")} sizes="64px" /></div>
          <div className="srow__body">
            <div className="srow__t">{m.title}</div>
            <div className="srow__meta">
              <span className="srow__y"><Icon name="cal" size={11} /> {m.year || "—"}</span>
              {m.rating > 0 && <span className="srow__r"><Icon name="star" size={11} /> {m.rating.toFixed(1)}</span>}
            </div>
            {m.desc && <p className="srow__x">{m.desc}</p>}
          </div>
        </Link>
      ))}
    </Widget>
  );
}
