import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import MovieCard from "@/components/MovieCard";
import { CHANNELS, channelBySlug, channelTitlesForRegion } from "@/lib/channels";
import { tmdbConfigured } from "@/lib/tmdb";
import { visitorRegion, regionName } from "@/lib/region";
import { baseUrl } from "@/lib/site";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { channelLogoUrl } from "@/lib/channelLogoManifest";
import { toCard } from "@/lib/types";

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
  const title = `${channel.name}: Latest Movies & Shows to Watch`;
  const description = `${channel.desc}. What's streaming on ${channel.name} now — movies & web series with trailers and ratings, updated live.`.slice(0, 158);
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

  // Same guard ChannelCardRich uses: a logoFile missing from the manifest
  // (lib/channelLogoManifest.ts — not a disk check, the server has no
  // filesystem on Cloudflare) falls back to the letter badge, never a
  // broken image.
  const logoExists = !!channelLogoUrl(channel.logoFile);

  const region = await visitorRegion();
  const [movieRes, showRes] = await Promise.all([
    channelTitlesForRegion(channel, "movie", 18, region),
    channelTitlesForRegion(channel, "series", 12, region),
  ]);
  const movies = movieRes.titles;
  const shows = showRes.titles;
  const usedRegion = movieRes.titles.length ? movieRes.usedRegion : showRes.usedRegion;
  const showingFallbackRegion = usedRegion !== region && (movies.length > 0 || shows.length > 0);

  const crumbs = breadcrumbJsonLd([
    { name: "Home", path: "/" }, { name: channel.name },
  ]);

  return (
    <div className="page">
      {/* eslint-disable-next-line react/no-danger -- static JSON-LD */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs).replace(/</g, "\\u003c") }} />
      <div className="crumb">
        <Link href="/">Home</Link><span className="sep">›</span>
        <span className="cur">{channel.name}</span>
      </div>

      <div className="page__head chan__head">
        {logoExists ? (
          // eslint-disable-next-line @next/next/no-img-element -- tiny self-hosted brand asset
          <img
            className="chan__headlogo"
            src={`/channel-logos/${channel.logoFile}`}
            alt={`${channel.name} logo`}
            style={channel.logoInvert ? { filter: "invert(1)" } : undefined}
          />
        ) : (
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
        )}
        <div>
          <h1>Latest Movies &amp; Shows on {channel.name}</h1>
          <p>{channel.desc}. Updated live. Tap any title for its trailer, cast and details.</p>
        </div>
      </div>

      {!tmdbConfigured && (
        <div className="empty">Live channel data needs TMDB_API_KEY in .env.local.</div>
      )}

      {showingFallbackRegion && (
        <p className="chan__regionnote">
          {channel.name} availability isn&apos;t tracked for {regionName(region)} yet, so here is its {regionName(usedRegion)} lineup.
        </p>
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
            {movies.map((m) => <MovieCard key={m.id} movie={toCard(m)} />)}
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
            {shows.map((m) => <MovieCard key={m.id} movie={toCard(m)} />)}
          </div>
        </section>
      )}

      {tmdbConfigured && !movies.length && !shows.length && (
        <div className="empty">No live availability data for {channel.name} right now. Check back soon.</div>
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
