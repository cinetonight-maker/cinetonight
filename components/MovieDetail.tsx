import Link from "next/link";
import Image from "next/image";
import Icon from "./Icon";
import WatchlistButton from "./WatchlistButton";
import TicketStub from "./TicketStub";
import BlogSection from "./BlogSection";
import CommentsSection from "./CommentsSection";
import MovieCard from "./MovieCard";
import { toCard, type Movie } from "@/lib/types";
import type { WatchPayload } from "@/lib/watchRows";
import { personId } from "@/lib/data";
import { personTmdbId, type SeasonInfo } from "@/lib/tmdb";
import { posterLg, profile, backdrop } from "@/lib/images";
import { factualAbout, displayRating, displayRuntime, displayCert, displayField, displayPeople, validYear, releaseStatus } from "@/lib/quality";
import InlineTrailer from "./InlineTrailer";
import WhereToWatch from "./WhereToWatch";
import EpisodePicker from "./EpisodePicker";

function Det({ rows }: { rows: [string, string | null][] }) {
  // Phase 2: a null value means "we don't have this" — the row is skipped
  // entirely instead of rendering a dash or a fake value.
  return <>{rows.filter((r): r is [string, string] => Boolean(r[1])).map(([k, v]) => (
    <div className="det" key={k}><span className="det__k">{k}</span><span className="det__v">{v}</span></div>
  ))}</>;
}

export default function MovieDetail({ movie, seasons = [], suggestions = [], watch = null }: { movie: Movie; seasons?: SeasonInfo[]; suggestions?: Movie[]; watch?: WatchPayload | null }) {
  const isSeries = movie.kind === "series";
  const status = releaseStatus(movie);

  // Phase 2: every cell goes through a display helper — a missing value
  // hides the row (Det skips nulls) instead of showing 0 / NR / a dash.
  const rating = displayRating(movie);
  const minfo: [string, string | null][][] = [
    [
      ["Release Year", validYear(movie.year) ? String(movie.year) : null],
      ["Status", status === "upcoming" ? "Upcoming" : null],
      ["Runtime", displayRuntime(movie.runtime)],
      ["Language", displayField(movie.language)],
      ["Certification", displayCert(movie.cert)],
    ],
    [
      ["Genres", movie.genres.filter(Boolean).join(", ") || null],
      ["Votes", movie.votes ? movie.votes.toLocaleString("en-US") : null],
      [isSeries ? "Created By" : "Director", displayPeople(movie.director)],
      ["Writers", displayPeople(movie.writers)],
    ],
    [
      ["Type", isSeries ? "Web Series" : "Feature Film"],
      // Zero votes never masquerades as a real score; upcoming titles have
      // no audience yet, so "Not rated yet" only appears for released work.
      ["Rating", rating ? `${rating} out of 10` : status === "released" ? "Not rated yet" : null],
      ["Cast", movie.cast.length ? `${movie.cast.length} credited` : null],
    ],
  ];
  // Factual-only About: built strictly from verified data (lib/quality).
  // No invented audience/critic reception; future titles get future wording.
  const about = factualAbout(movie);

  return (
    <>
      {/* Inline trailer banner — plays IN PLACE at the top of the page
          (reference-mock pattern), no fullscreen modal takeover. */}
      <InlineTrailer movie={movie} />

      {/* Compact reference-style detail bar under the trailer: small
          poster, title + genre chips + one meta line, actions to the
          right. The long synopsis lives in "About" further down — this
          block's job is identification + actions, in as little vertical
          space as possible. */}
      <section className="dbar">
        <div className="dbar__poster">
          <Image fill alt={`${movie.title} poster`} src={posterLg(movie)} sizes="(max-width: 900px) 30vw, 120px" priority />
        </div>
        <div className="dbar__body">
          <h1 className="dbar__title">{movie.title}</h1>
          <div className="dbar__chips">
            {movie.genres.slice(0, 3).map((g) => (
              <Link key={g} className="dbar__chip" href={`/movies?genre=${encodeURIComponent(g)}`}>{g}</Link>
            ))}
          </div>
          <div className="dbar__meta">
            {rating && <><span className="dbar__rate"><Icon name="star" size={13} /> {rating}</span>
            <span className="dot">·</span></>}{validYear(movie.year) && <span>{movie.year}</span>}
            {status === "upcoming" && <><span className="dot">·</span><span className="cert">Upcoming</span></>}
            {displayRuntime(movie.runtime) && <><span className="dot">·</span><span>{movie.runtime}</span></>}
            {displayCert(movie.cert) && <><span className="dot">·</span><span className="cert">{movie.cert}</span></>}
          </div>
        </div>
        <div className="dbar__acts">
          {/* No Watch Now button here — the inline trailer right above IS
              the play action; a second play button was redundant. */}
          <WatchlistButton id={movie.id} kind={movie.kind} surface={movie.kind === "series" ? "series_detail" : "movie_detail"} />
          <TicketStub movie={movie} />
        </div>
      </section>

      <section className="sec">
        <WhereToWatch movie={movie} surface={movie.kind === "series" ? "series_detail" : "movie_detail"} initial={watch} />
      </section>

      {/* Series only: pick a season → tap an episode → its trailer plays.
          seasons is fetched server-side (app/movie/[id]/page.tsx) and is
          [] for films and for series TMDB doesn't know, so this renders
          nothing in those cases. */}
      {isSeries && movie.tmdbId != null && seasons.length > 0 && (
        <EpisodePicker
          tvId={movie.tmdbId}
          showTitle={movie.title}
          seasons={seasons}
          fallbackTrailerKey={movie.trailerKey ?? null}
        />
      )}

      {movie.cast.length > 0 && <section className="sec">
        <div className="sec__head"><h2>Cast</h2></div>
        <div className="railwrap"><div className="rail castrail">
          {movie.cast.map((c) => (
            // Prefer the TMDB-id route when we have one (works for cast on
            // both local-catalogue and live-fetched titles); fall back to
            // the name-slug route, which only resolves for people who
            // appear in the local catalogue (see app/person/[id]/page.tsx).
            <Link className="castc" href={`/person/${c.tmdbId ? personTmdbId(c.tmdbId, c.name) : personId(c.name)}`} key={c.name}>
              <div className="castc__ph"><Image fill alt={c.name} src={profile(c)} sizes="64px" /></div>
              <div className="castc__n">{c.name}</div>
              <div className="castc__r">as {c.character}</div>
            </Link>
          ))}
        </div></div>
      </section>}

      <section className="sec">
        <div className="sec__head"><h2>Movie Info &amp; Details</h2></div>
        <div className="minfo">{minfo.map((rows, i) => <div key={i}><Det rows={rows} /></div>)}</div>
      </section>

      <section className="sec">
        <div className="sec__head"><h2>About {movie.title}</h2></div>
        <div className="about">
          <div className="about__body">
            {about.map((p, i) => <p key={i}>{p}</p>)}
            <Link className="about__btn" href="/blog">Read More on the Blog <Icon name="chevr" size={15} /></Link>
          </div>
          <div className="about__img"><Image fill alt={`${movie.title} backdrop`} src={backdrop(movie, "w780")} sizes="(max-width: 900px) 100vw, 380px" /></div>
        </div>
      </section>

      {/* Suggestions sit between the movie's own content and the
          community sections, and only where the sidebar (which shows
          Related on wide screens) is hidden. */}
      {suggestions.length > 0 && (
        <section className="sec related-below">
          <div className="sec__head">
            <div className="sec__titles">
              <h2>You Might Also Like</h2>
              <p className="sec__sub">More like {movie.title}, picked from what people are watching</p>
            </div>
          </div>
          <div className="grid">
            {suggestions.map((s) => <MovieCard key={s.id} movie={toCard(s)} />)}
          </div>
        </section>
      )}

      <CommentsSection movie={movie} />

      {/* The sidebar already has a compact BlogWidget, but the sidebar is
          hidden below 1200px (see .pageaside), which left mobile visitors
          with no blog content at all on this page. */}
      <BlogSection count={3} />
    </>
  );
}
