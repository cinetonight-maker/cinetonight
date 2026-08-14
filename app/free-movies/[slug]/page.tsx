import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Icon from "@/components/Icon";
import { getClassics, getClassic, enrichClassic, getClassicsEnriched, classicEmbedUrl } from "@/lib/classics";
import { baseUrl } from "@/lib/site";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";

interface Params { params: Promise<{ slug: string }> }

// Cached (ISR): rendered once, reused for 3600s, then refreshed in the
// background. Turns bot storms into cache hits instead of function runs.
export const revalidate = 3600;
export async function generateStaticParams() {
  return (await getClassics()).map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const classic = await getClassic(slug);
  if (!classic) notFound();
  const title = `Watch ${classic.title} (${classic.year}) Free Online — Full Movie, Legal`;
  // Intent phrase first, snippet-capped — Google truncates ~160 chars.
  const description = `Watch ${classic.title} (${classic.year}) full movie free & legally. ${classic.desc}`.slice(0, 158);
  const url = `${baseUrl()}/free-movies/${classic.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, type: "video.movie", url },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ClassicWatchPage({ params }: Params) {
  const { slug } = await params;
  const classic = await getClassic(slug);
  if (!classic) notFound();

  const { movie, posterUrl } = await enrichClassic(classic);
  const others = (await getClassicsEnriched()).filter((c) => c.classic.slug !== slug).slice(0, 6);

  // VideoObject + Movie structured data: full watchable film on the page is
  // exactly what Google's video rich results want; contentUrl points at the
  // public-domain source, embedUrl at what we render.
  const crumbs = breadcrumbJsonLd([
    { name: "Home", path: "/" }, { name: "Free Movies", path: "/free-movies" }, { name: classic.title },
  ]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Movie",
    name: classic.title,
    datePublished: String(classic.year),
    description: classic.desc,
    image: posterUrl,
    url: `${baseUrl()}/free-movies/${classic.slug}`,
    genre: classic.genre,
    duration: undefined,
    aggregateRating: movie?.rating
      ? { "@type": "AggregateRating", ratingValue: movie.rating, bestRating: 10, ratingCount: movie.votes || 1 }
      : undefined,
    video: {
      "@type": "VideoObject",
      name: `${classic.title} (${classic.year}) — Full Movie`,
      description: classic.desc,
      thumbnailUrl: posterUrl,
      embedUrl: classicEmbedUrl(classic),
      uploadDate: `${classic.year}-01-01`,
      isFamilyFriendly: true,
    },
  };

  return (
    <div className="page">
      {/* eslint-disable-next-line react/no-danger -- static JSON-LD built above, not user input */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {/* eslint-disable-next-line react/no-danger -- static JSON-LD */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs).replace(/</g, "\\u003c") }} />

      <div className="crumb">
        <Link href="/">Home</Link><span className="sep">›</span>
        <Link href="/free-movies">Free Movies</Link><span className="sep">›</span>
        <span className="cur">{classic.title}</span>
      </div>

      <div className="page__head">
        <h1>{classic.title} <span className="fm__year">({classic.year})</span></h1>
        <p>
          {[classic.genre, classic.runtime, movie ? `★ ${movie.rating.toFixed(1)}` : null].filter(Boolean).join(" · ")}
          {" · "}<span className="fm__legal"><Icon name="check" size={13} /> Free &amp; legal — public domain</span>
        </p>
      </div>

      {/* The player IS the page — 16:9, full width of the main column. */}
      <div className="fmplayer">
        <iframe
          src={classicEmbedUrl(classic)}
          title={`${classic.title} (${classic.year}) — full movie`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
        />
      </div>

      <section className="sec">
        <div className="sec__head"><h2>About {classic.title}</h2></div>
        <div className="fm__about">
          <div className="fm__poster">
            <Image fill alt={`${classic.title} poster`} src={posterUrl} sizes="(max-width: 760px) 40vw, 220px" />
          </div>
          <div>
            <p>{movie?.desc && movie.desc !== "No synopsis available yet." ? movie.desc : classic.desc}</p>
            <p className="fm__note">
              {classic.source.type === "archive"
                ? "This film is in the public domain — its copyright has expired — and is streamed here via the nonprofit Internet Archive's player. "
                : "This film is streamed here via its official YouTube upload — embedded exactly as the rights holder published it. "}
              Watching it is completely free and completely legal.{" "}
              <Link href="/free-movies">How does that work?</Link>
            </p>
            {movie && movie.cast.length > 0 && (
              <p className="fm__cast"><strong>Cast:</strong> {movie.cast.slice(0, 6).map((c) => c.name).join(", ")}</p>
            )}
          </div>
        </div>
      </section>

      {others.length > 0 && (
        <section className="sec">
          <div className="sec__head">
            <div className="sec__titles">
              <h2>More Free Classics</h2>
              <p className="sec__sub">Also free to watch, also 100% legal</p>
            </div>
            <Link className="sec__all" href="/free-movies">View All</Link>
          </div>
          <div className="grid">
            {others.map(({ classic: c, posterUrl: p }) => (
              <Link key={c.slug} className="fmc" href={`/free-movies/${c.slug}`}>
                <div className="fmc__poster">
                  <Image fill alt={`${c.title} (${c.year}) poster`} src={p} sizes="(max-width: 760px) 45vw, 180px" />
                  <span className="fmc__badge">FREE</span>
                  <span className="fmc__play"><Icon name="play" size={18} /></span>
                </div>
                <div className="fmc__t">{c.title}</div>
                <div className="fmc__m">{[c.year, c.genre].filter(Boolean).join(" · ")}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
