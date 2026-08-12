import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import MovieCard from "@/components/MovieCard";
import { CHANNELS, channelBySlug, channelTitles } from "@/lib/channels";
import { tmdbConfigured } from "@/lib/tmdb";
import { baseUrl } from "@/lib/site";

// Next.js 15+ resolves dynamic route params asynchronously (a Promise
// instead of a plain object) — has to be awaited before use.
interface Params { params: Promise<{ slug: string }> }

export const dynamic = "force-dynamic";
export function generateStaticParams() {
  return CHANNELS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const channel = channelBySlug(slug);
  // notFound() here (not just in the page body) so the response carries a
  // real 404 STATUS — thrown only from the streamed body, an unknown slug
  // returns the 404 page with a 200 status, which Google treats as a
  // soft-404 and can index as a real (junk) page.
  if (!channel) notFound();
  // "Latest X Movies & Web Series" + "watch trailers" is the long-tail
  // phrasing people actually search for a platform's lineup — same
  // strategy as the movie detail pages' titles.
  const title = `Latest ${channel.name} Movies & Web Series — Watch Trailers`;
  const description = `${channel.desc}. Browse what's streaming on ${channel.name} right now — latest movies and web series with ratings, trailers and where-to-watch info, updated live.`;
  const url = `${baseUrl()}/channel/${channel.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, type: "website", url },
    twitter: { card: "summary", title, description },
  };
}

export default async function ChannelPage({ params }: Params) {
  const { slug } = await params;
  const channel = channelBySlug(slug);
  if (!channel) notFound();

  const [movies, shows] = await Promise.all([
    channelTitles(channel, "movie", 18),
    channelTitles(channel, "series", 12),
  ]);

  return (
    <div className="page">
      <div className="crumb">
        <Link href="/">Home</Link><span className="sep">›</span>
        <span className="cur">{channel.name}</span>
      </div>

      <div className="page__head chan__head">
        <span
          className="chan__badge"
          style={{
            background: `color-mix(in srgb, ${channel.color} 24%, #15151f)`,
            color: channel.color,
            border: `1px solid color-mix(in srgb, ${channel.color} 55%, transparent)`,
          }}
        >
          {channel.name[0]}
        </span>
        <div>
          <h1>{channel.name} — Latest Movies &amp; Shows</h1>
          <p>{channel.desc}. Updated live — tap any title for its trailer, cast and details.</p>
        </div>
      </div>

      {!tmdbConfigured && (
        <div className="empty">Live channel data needs TMDB_API_KEY in .env.local.</div>
      )}

      {movies.length > 0 && (
        <section className="sec">
          <div className="sec__head">
            <div className="sec__titles">
              <h2>Popular Movies on {channel.name}</h2>
              <p className="sec__sub">The most-watched films streaming on {channel.name} right now</p>
            </div>
          </div>
          <div className="grid">
            {movies.map((m) => <MovieCard key={m.id} movie={m} />)}
          </div>
        </section>
      )}

      {shows.length > 0 && (
        <section className="sec">
          <div className="sec__head">
            <div className="sec__titles">
              <h2>Popular Web Series on {channel.name}</h2>
              <p className="sec__sub">Binge-worthy shows &amp; originals on {channel.name}</p>
            </div>
          </div>
          <div className="grid">
            {shows.map((m) => <MovieCard key={m.id} movie={m} />)}
          </div>
        </section>
      )}

      {tmdbConfigured && !movies.length && !shows.length && (
        <div className="empty">No live availability data for {channel.name} right now — check back soon.</div>
      )}

      {/* Cross-links to every other channel — good for visitors (one tap to
          the next platform) and for crawlers (every channel page links to
          every other, so the whole set gets discovered from any one). */}
      <section className="sec">
        <div className="sec__head">
          <div className="sec__titles">
            <h2>More Channels</h2>
            <p className="sec__sub">Browse what&apos;s streaming on other platforms</p>
          </div>
        </div>
        <div className="chan__links">
          {CHANNELS.filter((c) => c.slug !== channel.slug).map((c) => (
            <Link
              key={c.slug}
              className="gchip"
              href={`/channel/${c.slug}`}
              style={{ borderColor: `color-mix(in srgb, ${c.color} 40%, var(--line))` }}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
