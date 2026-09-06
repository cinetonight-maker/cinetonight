import Link from "next/link";
import Image from "next/image";
import Icon from "../Icon";
import WatchlistButton from "../WatchlistButton";
import TicketStub from "../TicketStub";
import BlogSection from "../BlogSection";
import CommentsSection from "../CommentsSection";
import MovieCard from "../MovieCard";
import InlineTrailer from "../InlineTrailer";
import WhereToWatch from "../WhereToWatch";
import V2Rail from "./V2Rail";
import EpisodePicker from "../EpisodePicker";
import { toCard, type Movie } from "@/lib/types";
import type { WatchPayload } from "@/lib/watchRows";
import type { MovieIntel } from "@/lib/intel";
import { hasVerdict, hasTake } from "@/lib/intel";
import { tonightFit, fitMinutes, moodMatches } from "@/lib/tonightFit";
import { MOODS } from "@/lib/moods";
import { canonicalGenre, canonicalBrowsePath } from "@/lib/genres";
import { personId } from "@/lib/data";
import { personTmdbId, type SeasonInfo, type SeriesFacts } from "@/lib/tmdb";
import { posterLg, profile } from "@/lib/images";
import {
  factualAbout, displayRating, displayRuntime, displayCert, displayField,
  displayPeople, validYear, releaseStatus,
} from "@/lib/quality";

/* ============================================================================
 * V2 Movie Detail template (docs/V2-BUILD-PATH.md, Phase 2).
 *
 * Layout, as it now stands (it has moved on from the original v2.png
 * canvas in several places, each on request):
 *   trailer banner -> identity card WITH Where to Watch inside it -> a row
 *   of short decision panels (About plus either the reviewed Snapshot /
 *   Expect / Best For, or the computed fit boxes) -> Cast -> Details ->
 *   More Like This (a rail) -> Reviews. Beside that, a sticky sidebar
 *   holding the alternative pick and Tonight Profile. The guides row sits
 *   BELOW both columns at full page width (founder decision, 1 Sep 2026).
 * Where to Watch is in the HERO, not the sidebar: the sidebar falls to the
 * bottom of the page on a phone, which buried the page's main question.
 *
 * Every CineTonight-owned decision module (Tonight Verdict, Snapshot, What
 * to Expect, Best For, the Take, Tonight Profile, the alternative card) is
 * DATA-GATED on a reviewed `movie_intel` row (lib/intel.ts): no row → the
 * module does not render, and the page is the sparse/Level-B state — the
 * deliberate default for the long tail. Facts, availability, cast, trailer
 * and recommendations render for every title exactly as before.
 *
 * Same route, same data functions, same client islands (WhereToWatch,
 * InlineTrailer, WatchlistButton, TicketStub, EpisodePicker, comments) —
 * this file only recomposes them. No new fetches besides the cached intel
 * read the page already performed.
 * ========================================================================= */

const LEVEL_DOTS: Record<1 | 2 | 3, boolean[]> = {
  1: [true, false, false],
  2: [true, true, false],
  3: [true, true, true],
};

function Dots({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="v2m-dots" aria-hidden="true">
      {LEVEL_DOTS[level].map((on, i) => <i key={i} className={on ? "on" : undefined} />)}
    </span>
  );
}

function Kv({ rows }: { rows: [string, string | null][] }) {
  return <>{rows.filter((r): r is [string, string] => Boolean(r[1])).map(([k, v]) => (
    <div className="v2m-kv" key={k}><span className="v2m-kv__k">{k}</span><span className="v2m-kv__v">{v}</span></div>
  ))}</>;
}

/** Factual, computed reasons for a "similar pick" when no human-curated
 *  alternative exists for this title (lib/intel.ts's altReasons is a
 *  reviewed field, only present with a movie_intel row). Every line here is
 *  derived straight from values we hold for both titles - shared genres,
 *  comparable runtime, the pick's own rating - never an invented "why
 *  you'll like this". A reason we cannot back with a real value is simply
 *  not emitted, same rule as tonightFit(). */
function computedAltReasons(movie: Movie, alt: Movie): string[] {
  const reasons: string[] = [];

  const shared = alt.genres.filter((g) => movie.genres.includes(g));
  if (shared.length > 0) {
    reasons.push(`Same genre: ${shared.slice(0, 2).join(" & ")}`);
  }

  const a = fitMinutes(movie.runtime);
  const b = fitMinutes(alt.runtime);
  if (a !== null && b !== null && Math.abs(a - b) <= 20) {
    const altRuntime = displayRuntime(alt.runtime);
    if (altRuntime) reasons.push(`Similar runtime (${altRuntime})`);
  }

  const altRating = displayRating(alt);
  if (altRating) reasons.push(`Rated ${altRating}/10`);

  return reasons;
}

/** A decision-relevant FRAME for the runtime, not the runtime itself - the
 *  hero identity card already prints the literal figure, so Tonight Profile
 *  repeating "1h 59m" verbatim added nothing. Same three buckets tonightFit()
 *  already reasons from (<=90 / <=120 / longer); series are skipped, same as
 *  there - a single "runtime" doesn't describe a multi-episode watch. */
function runtimeFeel(movie: Movie): string | null {
  if (movie.kind === "series") return null;
  const mins = fitMinutes(movie.runtime);
  if (mins === null) return null;
  const pretty = displayRuntime(movie.runtime);
  if (mins <= 90) return `Short evening (${pretty})`;
  if (mins <= 120) return `About two hours (${pretty})`;
  return `Full evening (${pretty})`;
}

/** A rating LABEL, not the rating itself - the hero already shows the raw
 *  "7.3/10 - 12.4K ratings" figure. Same thresholds tonightFit() uses for
 *  its own "well reviewed" / "hidden gem" lines; a title that clears none
 *  of them just gets no row here, same restraint as everywhere else in
 *  this file - a middling score isn't reframed as a positive one. */
function ratingContext(movie: Movie): string | null {
  const rating = displayRating(movie);
  if (!rating) return null;
  const r = Number(rating);
  const votes = movie.votes ?? 0;
  if (votes < 20) return null;
  if (r >= 7.5 && votes < 1500) return "Hidden gem";
  if (r >= 8) return "Well reviewed";
  if (r >= 7) return "Safe pick";
  return null;
}

export default function MovieDetailV2({
  movie, seasons = [], suggestions = [], watch = null, intel = null, altMovie = null, seriesFacts = null,
}: {
  movie: Movie;
  /* A `canonicalUrl` prop used to arrive here for the hero Share button.
     That button was removed, and nothing has needed the page's own URL
     since, so the prop is gone too - an unused required prop is a lint
     error waiting to happen and a false signal that this component cares
     about its address. app/movie/[id]/page.tsx still builds the canonical
     for <link rel="canonical"> and the JSON-LD, which is where it belongs. */
  seasons?: SeasonInfo[];
  suggestions?: Movie[];
  watch?: WatchPayload | null;
  intel?: MovieIntel | null;
  altMovie?: Movie | null;
  seriesFacts?: SeriesFacts | null;
}) {
  const isSeries = movie.kind === "series";
  const status = releaseStatus(movie);
  const rating = displayRating(movie);
  const about = factualAbout(movie);
  const directors = displayPeople(movie.director);
  const firstDirector = directors ? directors.split(",")[0].trim() : null;

  /* Where a genre link from this page goes. Two things were wrong with the
     hand-built `/movies?genre=${g}` this replaces:
       1. SERIES chips pointed at the MOVIES hub, so a viewer browsing Silo
          was sent to a page of films.
       2. It put the raw TMDB name in the URL, and TV genre names ("Sci-Fi &
          Fantasy", "Action & Adventure") are not names the hubs can filter
          by - exactly the empty-but-indexable duplicate URL lib/genres.ts
          was written to close.
     canonicalBrowsePath folds the TV name onto the movie name that owns the
     URL and DROPS a genre the site cannot filter by, so the worst case is
     the bare hub rather than a dead filtered page. */
  const browseHub: `/${string}` = isSeries ? "/tv-shows" : "/movies";
  const genreHref = (g: string) => canonicalBrowsePath(browseHub, g);
  /* "See all" under More Like This used to point at /trending - the site's
     popular-right-now page, which is not "more like this" by any reading.
     It points at this title's own main genre now, and says so. */
  const mainGenre = movie.genres.map(canonicalGenre).find(Boolean);
  const moreLikeThisHref = canonicalBrowsePath(browseHub, mainGenre);
  const moreLikeThisLabel = mainGenre ? `See all ${mainGenre}` : "See all";

  // Where-to-Watch status line for the hero — built from the same payload
  // the sidebar island receives, honest about fallback regions, silent
  // when the server-side check failed (the island still self-loads).
  const streamingRows = watch?.rows?.length ?? 0;
  /* NAMES, not a count. "Streaming in India · 3 options" told a reader
     nothing they could act on; every decision-shaped competitor (JustWatch,
     PlayPilot, and TMDB now too) leads with WHICH services carry it, above
     the title. Server-rendered from the same payload the panel below uses,
     so a crawler reads it too. */
  const providerNames = (watch?.rows ?? []).map((r) => r.name).filter(Boolean);
  const availLine = watch && streamingRows > 0
    ? (() => {
        // (Both arms of an earlier ternary here produced the same string;
        // the fallback-region caveat is carried by heroStatus below, not by
        // this line.)
        const where = `in ${watch.countryName}`;
        if (providerNames.length === 1) return `On ${providerNames[0]} ${where}`;
        if (providerNames.length === 2) return `On ${providerNames[0]} and ${providerNames[1]} ${where}`;
        return `On ${providerNames[0]}, ${providerNames[1]} and ${providerNames.length - 2} more ${where}`;
      })()
    : null;
  const heroStatus = watch && streamingRows > 0 && watch.fallbackRegion
    ? `Not confirmed for your country yet - showing ${watch.countryName}`
    : null;

  const snapshotRows: [string, string | null][] = intel ? [
    ["Mood", intel.mood],
    ["Pace", intel.pace],
    ["Intensity", intel.intensity],
    ["Themes", intel.themes.length ? intel.themes.join(", ") : null],
    ["Vibe", intel.vibe],
  ] : [];
  const hasSnapshot = snapshotRows.some(([, v]) => v);
  const hasExpect = !!intel && intel.expect.length > 0;
  const hasBestFor = !!intel && !!(intel.bestForWho || intel.bestForContext || intel.bestForCaution);
  const hasProfile = !!intel && !!(intel.attention || intel.mood || intel.bestForContext);
  const hasAlt = !!intel && !!altMovie && intel.altReasons.length > 0;

  // Computed fit, built once. Only actually rendered when there is no human
  // Verdict for this title - the two answer the same question and the human
  // one is better, so this stands in rather than competing with it.
  const fit = hasVerdict(intel) ? null : tonightFit(movie);
  /** Fit boxes render at all only when the engine could back at least one
   *  line - a title we know nothing about claims nothing. */
  const showFitBoxes = !!fit && fit.fits.length > 0;

  /* The sidebar's two panels, decided here rather than inside the markup,
     so the <aside> itself can be gated on having any. Both are gated, and
     a title with no reviewed row, no suggestions to draw an alternative
     from and nothing computable used to render an empty <aside> - an empty
     landmark a screen reader still announces, and a column the grid still
     reserves space for. */
  const profileRows: [string, string | null][] = hasProfile
    ? [["Experience", intel!.mood], ["Attention", intel!.attention], ["Best for", intel!.bestForContext]]
    : (() => {
        const matchedMood = MOODS.find((m) => moodMatches(movie, m.id));
        return [
          ["Mood", matchedMood ? matchedMood.label : null],
          ["Pace", runtimeFeel(movie)],
          ["Rating", ratingContext(movie)],
        ];
      })();
  const showProfile = profileRows.some(([, v]) => v);
  const showAltPanel = (hasAlt && !!altMovie) || (!hasAlt && suggestions.length > 0);
  const hasAside = showProfile || showAltPanel;

  // THE COMMITMENT (series only) — objective facts, spec §6 of the series
  // page spec: never one assumed runtime × episode count presented as fact
  // (the total is labelled approximate and only shown when TMDB carries
  // real typical runtimes); status in plain words or absent; upcoming
  // seasons never counted as released.
  const rt = seriesFacts?.runtimes ?? [];
  const rtRange = rt.length
    ? (Math.min(...rt) === Math.max(...rt) ? `${rt[0]} min (typical)` : `${Math.min(...rt)}–${Math.max(...rt)} min (typical)`)
    : null;
  const catchUp = seriesFacts?.episodes && rt.length
    ? `≈ ${Math.round((seriesFacts.episodes * (rt.reduce((a, b) => a + b, 0) / rt.length)) / 60)} hours (approx.)`
    : null;
  const statusLabel = seriesFacts?.status === "returning" ? "Returning - more episodes coming"
    : seriesFacts?.status === "ended" ? "Ended - complete story"
    : seriesFacts?.status === "cancelled" ? "Cancelled"
    : seriesFacts?.status === "in-production" ? "In production - not yet released"
    : null;
  const commitmentRows: [string, string | null][] = isSeries && seriesFacts ? [
    ["Released", seriesFacts.seasons && seriesFacts.episodes
      ? `${seriesFacts.seasons} season${seriesFacts.seasons === 1 ? "" : "s"} · ${seriesFacts.episodes} episodes`
      : seriesFacts.episodes ? `${seriesFacts.episodes} episodes` : null],
    ["Episode length", rtRange],
    ["Full catch-up", catchUp],
    ["Status", statusLabel],
    ["Latest episode", seriesFacts.lastAirDate
      ? new Date(seriesFacts.lastAirDate + "T00:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
      : null],
  ] : [];
  const hasCommitment = commitmentRows.some(([, v]) => v);

  /* Facts, minus what the page has already told the reader. "Type"
     (Feature Film / Web Series) and "Status" (Upcoming) were both printed
     as chips in the hero a screen earlier, so as rows here they were pure
     restatement. Release date is now the full date when we hold one - that
     is the one fact this block can state better than the hero, which only
     has room for the year. */
  const releaseDate = movie.releaseDate
    ? new Date(movie.releaseDate + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;
  const details: [string, string | null][] = [
    ["Release date", releaseDate ?? (validYear(movie.year) ? String(movie.year) : null)],
    ["Runtime", displayRuntime(movie.runtime)],
    ["Language", displayField(movie.language)],
    [isSeries ? "Created by" : "Director", directors],
    ["Writers", displayPeople(movie.writers)],
    ["Genres", movie.genres.filter(Boolean).join(", ") || null],
  ];

  return (
    <div className="v2m">
      {/* Visible breadcrumb - mirrors the BreadcrumbList JSON-LD built in
          app/movie/[id]/page.tsx (Home / Movies-or-TV Shows / Title)
          exactly, item for item, so the rich-result markup isn't claiming
          a page structure nothing on the page actually shows. Reuses the
          site's existing .crumb pattern (see app/free-movies/[slug]/page.tsx)
          rather than inventing a second breadcrumb style. */}
      <div className="crumb v2m-crumb">
        <Link href="/">Home</Link><span className="sep">&rsaquo;</span>
        <Link href={browseHub}>{isSeries ? "TV Shows" : "Movies"}</Link><span className="sep">&rsaquo;</span>
        <span className="cur">{movie.title}</span>
      </div>
      <div className="v2m-cols">
        {/* ============================== MAIN ============================== */}
        <div className="v2m-main">

          {/* TRAILER, then IDENTITY BAR - matches the live site's order
              (components/MovieDetail.tsx on main): a full-width trailer
              banner first, playing in place with no modal, then the
              poster/title/actions card directly under it. An earlier V2
              draft moved the trailer further down the page to keep Where
              to Watch above the fold; restored to match live on request -
              Where to Watch still sits right under the identity card
              below, just one section lower on the page now. */}
          <InlineTrailer movie={movie} />

          <section className="v2m-hero">
            <div className="v2m-hero__in">
              <div className="v2m-hero__poster">
                <Image fill alt={`${movie.title} poster`} src={posterLg(movie)} sizes="(max-width: 900px) 22vw, 132px" />
              </div>
              <div className="v2m-hero__body">
                {availLine && <p className="v2m-hero__avail">{availLine}</p>}
                <h1 className="v2m-hero__title">{movie.title}</h1>
                <div className="v2m-hero__meta">
                  {validYear(movie.year) && <span>{movie.year}</span>}
                  {displayRuntime(movie.runtime) && <span>{movie.runtime}</span>}
                  {displayCert(movie.cert) && <span className="v2m-cert">{movie.cert}</span>}
                  {status === "upcoming" && <span className="v2m-cert">Upcoming</span>}
                </div>
                {rating && (
                  <div className="v2m-hero__rating">
                    <span className="v2m-hero__score"><b>{rating}</b>/10{movie.votes ? ` · ${movie.votes.toLocaleString("en-US")} ratings` : ""}</span>
                    <span className="v2m-hero__ratenote">(external rating - not a CineTonight score)</span>
                  </div>
                )}
                <div className="v2m-chips">
                  {movie.genres.slice(0, 3).map((g) => (
                    <Link key={g} className="v2m-chip" href={genreHref(g)}>{g}</Link>
                  ))}
                  <span className="v2m-chip v2m-chip--type">{isSeries ? "Series" : "Movie"}</span>
                </div>
                <div className="v2m-hero__acts">
                  {/* Neither "See Watching Options" nor "Play Trailer" survive:
                      one scrolled away from the page's main question, which now
                      sits directly below; the other pointed at a player that is
                      now the first thing on the page. */}
                  <WatchlistButton id={movie.id} kind={movie.kind} surface={isSeries ? "series_detail" : "movie_detail"} />
                  <TicketStub movie={movie} />
                </div>
                {heroStatus && (
                  <div className="v2m-hero__status is-fallback">
                    <i aria-hidden="true" />{heroStatus}
                  </div>
                )}
              </div>
            </div>

            {/* WHERE TO WATCH, IN THE HERO - moved back on request. Every
                decision-shaped competitor (JustWatch, PlayPilot) answers
                this directly under the title rather than behind a sidebar
                scroll, and on a phone the sidebar falls to the bottom of
                the page, which buried it there. Same island, same single
                request, back where the identity card can hand it the data
                it already fetched. */}
            <div className="v2m-hero__watch" id="watch">
              <WhereToWatch movie={movie} surface={isSeries ? "series_detail" : "movie_detail"} initial={watch} />
            </div>
          </section>

          {/* 5.4 THE TONIGHT VERDICT - reviewed intel only */}
          {hasVerdict(intel) && (
            <section className="v2m-sec v2m-verdict">
              <span className="v2m-kicker">The Tonight Verdict</span>
              <h2>Is {movie.title} right for tonight?</h2>
              <p className="v2m-verdict__lead">{intel.verdictHeadline}</p>
              <div className="v2m-verdict__grid">
                <div className="v2m-verdict__col is-watch">
                  <div className="v2m-verdict__h">✓ Watch tonight if</div>
                  <ul>{intel.watchIf.map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
                <div className="v2m-verdict__col is-skip">
                  <div className="v2m-verdict__h">✕ Choose something else if</div>
                  <ul>{intel.skipIf.map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
              </div>
              {intel.chips.length > 0 && (
                <div className="v2m-chips">{intel.chips.map((c) => <span key={c} className="v2m-chip">{c}</span>)}</div>
              )}
              {(intel.hookExpectation || intel.episodeRhythm) && (
                <div className="v2m-chips">
                  {intel.episodeRhythm && <span className="v2m-chip">{intel.episodeRhythm}</span>}
                  {intel.hookExpectation && <span className="v2m-chip">{intel.hookExpectation}</span>}
                </div>
              )}
              <Link className="v2m-more" href="/discover">Tune this to my night <Icon name="chevr" size={13} /></Link>
            </section>
          )}

          {/* ABOUT + intel panels - About always renders; the rest are gated.
              Side by side in one row on wide screens (v2.png reference) -
              auto-fit wraps to fewer columns, then one, as space runs out. */}
          <section className="v2m-sec">
            {/* When the row is the computed fit (no reviewed intel), it is laid
                out as the two decision boxes side by side with About spanning
                the full width UNDER them: the two short lists are what the
                reader is here to weigh, and the synopsis reads better as one
                wide paragraph block than as a tall narrow third column beside
                them. About stays FIRST in the DOM (it is the page's actual
                description, and the only part a crawler should meet first) -
                only its visual position moves, via CSS order. */}
            <div className={`v2m-panelgrid${showFitBoxes ? " v2m-panelgrid--fit" : ""}`}>
              <div className="v2m-panel v2m-panel--about">
                <span className="v2m-kicker">About</span>
                {about.map((p, i) => <p className="v2m-about" key={i}>{p}</p>)}
              </div>
              {hasCommitment && (
                <div className="v2m-panel v2m-panel--commit">
                  <span className="v2m-kicker v2m-kicker--gold">The Commitment</span>
                  <Kv rows={commitmentRows} />
                </div>
              )}
              {hasSnapshot && (
                <div className="v2m-panel">
                  <span className="v2m-kicker">CineTonight Snapshot</span>
                  <Kv rows={snapshotRows} />
                  <div className="v2m-finenote">Editorial labels reviewed by {intel!.editor}.</div>
                </div>
              )}
              {/* TONIGHT FIT, as boxes in this row - v2.png puts a row of
                  short info panels right under the hero (Snapshot / What to
                  Expect / Best For), and that rhythm is the most useful part
                  of the mockup: three glanceable answers before any prose.
                  Those three specific panels are EDITORIAL (an Intensity or
                  a Vibe is a judgment, not a fact), so on the ~33k pages
                  with no reviewed row they cannot be filled honestly. What
                  CAN fill the same shape is the computed fit - lib/tonightFit
                  derives both lists from this title's own runtime, genres and
                  rating, asserts no opinion, and answers the question the
                  brand is built on. It used to render as a full-width block
                  of its own further down; as boxes it sits where the mockup
                  puts the glance, and it is not shown twice. */}
              {showFitBoxes && (
                <div className="v2m-panel v2m-panel--fit">
                  <span className="v2m-kicker">Right For Tonight If</span>
                  <ul className="v2m-fitlist">
                    {fit!.fits.map((l) => (
                      <li key={l.text}>
                        {l.href ? <Link className="v2m-fit__l" href={l.href}>{l.text}</Link> : l.text}
                      </li>
                    ))}
                  </ul>
                  <div className="v2m-finenote">Matched from this title&apos;s own runtime, genres and rating - not a review.</div>
                </div>
              )}
              {showFitBoxes && fit!.notFor.length > 0 && (
                <div className="v2m-panel v2m-panel--skip">
                  <span className="v2m-kicker">Probably Not If</span>
                  <ul className="v2m-fitlist">
                    {fit!.notFor.map((l) => <li key={l.text}>{l.text}</li>)}
                  </ul>
                  <Link className="v2m-more" href="/discover">Find something that fits your night <Icon name="chevr" size={13} /></Link>
                </div>
              )}
              {hasExpect && (
                <div className="v2m-panel">
                  <span className="v2m-kicker">What to Expect</span>
                  {intel!.expect.map((r) => (
                    <div className="v2m-kv" key={r.label}>
                      <span className="v2m-kv__k">{r.label}</span>
                      <span className="v2m-kv__v v2m-kv__v--dots">{r.value}<Dots level={r.level} /></span>
                    </div>
                  ))}
                  <div className="v2m-finenote">Editorial judgment in plain words - never a fake score.</div>
                </div>
              )}
              {hasBestFor && (
                <div className="v2m-panel">
                  <span className="v2m-kicker">Best For</span>
                  {intel!.bestForWho && (<><div className="v2m-sub">Who will enjoy it</div><p className="v2m-bf">{intel!.bestForWho}</p></>)}
                  {intel!.bestForContext && (<><div className="v2m-sub">Best viewing context</div><p className="v2m-bf">{intel!.bestForContext}</p></>)}
                  {intel!.bestForCaution && (<><div className="v2m-sub">Know first</div><p className="v2m-bf">{intel!.bestForCaution}</p></>)}
                </div>
              )}
            </div>
          </section>

          {/* 5.9 THE CINETONIGHT TAKE - accountable editorial only */}
          {hasTake(intel) && (
            <section className="v2m-sec v2m-take">
              <span className="v2m-kicker">The CineTonight Take</span>
              {intel.takeTitle && <h2>{intel.takeTitle}</h2>}
              <p className="v2m-take__body">&ldquo;{intel.takeBody}&rdquo;</p>
              <div className="v2m-take__byline">
                <span className="v2m-take__avatar" aria-hidden="true">CT</span>
                <div>
                  <div className="v2m-take__name">{intel.editor}</div>
                  <div className="v2m-take__date">
                    Reviewed {new Date(intel.reviewedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                    {" · "}<Link href="/contact">Corrections</Link>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 5.11 CAST & CREW - sits between the panel row and Movie Details
              (v2.png reference order: identity → panels → cast → facts). */}
          {(movie.cast.length > 0 || firstDirector) && (
            <section className="v2m-sec">
              <div className="v2m-h2row"><h2>Cast &amp; Crew</h2></div>
              {/* Director: a CARD only when there is a real photo to show.
                  Without one it used to be a 56px initials circle inside a
                  bordered card with 18px padding - a whole band of the page
                  spent on one name, and the circle read as a missing image
                  rather than a deliberate monogram at that size. With no
                  photo it is now a single text line instead. */}
              {firstDirector && (movie.directorProfile ? (
                <div className="v2m-director">
                  <span className="v2m-director__photo">
                    <Image fill alt="" src={profile({ name: firstDirector, profilePath: movie.directorProfile })} sizes="44px" />
                  </span>
                  <div>
                    <div className="v2m-sub">{isSeries ? "Creator" : "Director"}</div>
                    <div className="v2m-director__name">{directors}</div>
                  </div>
                </div>
              ) : (
                <p className="v2m-directorline">
                  <span className="v2m-directorline__k">{isSeries ? "Created by" : "Directed by"}</span>
                  <span className="v2m-directorline__v">{directors}</span>
                </p>
              ))}
              {/* Ten was every credit TMDB returned, each with a 76px circle.
                  For the long tail most of those circles were the shared
                  silhouette placeholder, so the row read as a line of grey
                  dots taking a whole band of the page. Eight now, smaller, and
                  a member with no photo gets INITIALS - the same treatment the
                  director already had. A monogram looks deliberate; a stock
                  silhouette looks broken. */}
              {movie.cast.length > 0 && (
                <div className="railwrap"><div className="rail castrail">
                  {movie.cast.slice(0, 8).map((c) => (
                    <Link className="castc" href={`/person/${c.tmdbId ? personTmdbId(c.tmdbId, c.name) : personId(c.name)}`} key={c.name}>
                      {c.profilePath ? (
                        <div className="castc__ph"><Image fill alt={c.name} src={profile(c)} sizes="60px" /></div>
                      ) : (
                        <div className="castc__ph castc__ph--mono" aria-hidden="true">
                          {c.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("")}
                        </div>
                      )}
                      <div className="castc__n">{c.name}</div>
                      <div className="castc__r">as {c.character}</div>
                    </Link>
                  ))}
                </div></div>
              )}
            </section>
          )}

          {/* MOVIE DETAILS. The "Trailers & Videos" gallery that used to sit
              beside this was removed on request: the hero banner at the top
              of the page already plays the trailer in place, so a second
              video module lower down repeated the page's own opening. */}
          <section className="v2m-sec" id="details">
            <div className="v2m-h2row"><h2>{isSeries ? "Series" : "Movie"} Details</h2></div>
            {/* The row style is the original one (label left, value right, a
                hairline between); it runs in THREE columns with a rule
                between them, stepping to two then one as space goes. Same
                facts, a third of the height of the original single ladder.
                Certification, Type and Status are deliberately absent - all
                three are already chips in the hero. */}
            <div className="v2m-panel"><div className="v2m-kvcols"><Kv rows={details} /></div></div>
          </section>

          {/* Series: seasons & episodes (existing picker, spoiler-safe).
              No heading here - EpisodePicker prints its own "Seasons &
              Episodes" heading + subtitle inside its own <section className
              ="sec">, same as MovieDetail.tsx (V1) uses it. This wrapper
              used to ALSO print an "Seasons & Episodes" h2 right above it,
              so the page carried the same heading twice back to back;
              .v2m-sec is kept purely for the consistent section-to-section
              top margin the rest of the page uses. */}
          {isSeries && movie.tmdbId != null && seasons.length > 0 && (
            <section className="v2m-sec">
              <EpisodePicker
                tvId={movie.tmdbId}
                showTitle={movie.title}
                seasons={seasons}
                fallbackTrailerKey={movie.trailerKey ?? null}
              />
            </section>
          )}

          {/* 5.13 MORE LIKE THIS - real recommendations, no invented reasons.
              Editorial similarity reasons arrive with the content pilot
              (Phase 6); until then cards carry facts only. */}
          {suggestions.length > 0 && (
            <section className="v2m-sec">
              <div className="v2m-h2row">
                <div>
                  <h2>More Like This</h2>
                  <p className="v2m-h2sub">More like {movie.title}, picked from what people are watching</p>
                </div>
                <Link className="v2m-more" href={moreLikeThisHref}>{moreLikeThisLabel} <Icon name="chevr" size={13} /></Link>
              </div>
              {/* A rail, not a grid. The grid was capped at five because a
                  sixth card wrapped onto a line of its own and read as a
                  mistake; scrolling has no such cap, so the row can now
                  carry everything the page was given instead of hiding the
                  rest behind "See all". */}
              <V2Rail>
                {suggestions.slice(0, 14).map((s) => <MovieCard key={s.id} movie={toCard(s)} />)}
              </V2Rail>
            </section>
          )}

          {/* 5.16 community layer - existing honest reviews module. Write
              a Review sits beside the heading (v2.png reference) rather
              than in the sidebar. It jumps to #review-form, not #reviews -
              the form sits below the review list inside this section, so on
              a title with several approved reviews the two ids point to
              different places on the page; anchoring on the wrapper here
              was a no-op since the button lives right next to it.
              className="v2m-sec" gives this the same top gap every other
              section on the page gets - CommentsSection's own <section
              className="sec"> only carries a bottom margin (it's shared
              with V1 and non-movie pages that don't need a top gap here),
              so without this the More Like This rail and the Reviews
              heading sat flush against each other with zero space between
              them. */}
          <div id="reviews" className="v2m-sec">
            <CommentsSection
              movie={movie}
              actions={<Link className="v2m-btn v2m-btn--primary" href="#review-form">Write a Review</Link>}
            />
          </div>

        </div>

        {/* ============================== ASIDE ============================= */}
        {/* Sidebar is optional - gated on having either panel below. */}
        {hasAside && (
        <aside className="v2m-aside">
          <div className="v2m-aside__sticky">
            {/* Tonight Profile. Reviewed rows when a movie_intel row exists
                (Experience / Attention / Best for - all editorial, none of
                them printed anywhere else on the page); the computed
                Mood / Pace / Rating, labelled "(general)", otherwise. Rows
                are built above so the aside can be gated on having any.
                v2.png puts this panel in the sidebar and that is where it
                stays - these three computed facts appeared briefly in a
                main-column panel too, and showing a reader the same three
                facts twice on one page is how a page starts feeling
                padded. Runtime is deliberately not a row: the hero prints
                it a screen earlier. No "/discover" link here either - the
                Tonight Fit "Probably Not If" box above already offers that
                exact CTA, and this panel's job is to describe the title in
                front of you, not repeat someone else's exit hatch. */}
            {showProfile && (
              <div className="v2m-panel v2m-side">
                <h3>Tonight Profile{!hasProfile && <> <span className="v2m-tag-general">(general)</span></>}</h3>
                <Kv rows={profileRows} />
                {!hasProfile && (
                  <div className="v2m-finenote">Computed from this title&apos;s own data - not an editorial review.</div>
                )}
              </div>
            )}

            {/* "Can't Watch It Tonight?" - a reviewed alternative when this
                title has one (intel.altReasons), or a computed one built
                from shared genre/runtime/rating when it doesn't. Always
                rendered here, unconditionally - not gated on whether THIS
                title currently has any streaming availability. */}
            {hasAlt && altMovie && (
              <div className="v2m-panel v2m-side">
                <h3>Can&apos;t Watch It Tonight?</h3>
                <Link className="v2m-alt" href={`/movie/${altMovie.id}`}>
                  <div className="v2m-alt__poster">
                    <Image fill alt={`${altMovie.title} poster`} src={posterLg(altMovie)} sizes="92px" />
                  </div>
                  <div className="v2m-alt__info">
                    <div className="v2m-alt__title">{altMovie.title}</div>
                    <div className="v2m-alt__meta">
                      {displayRating(altMovie) && <span className="v2m-alt__rate">&#9733; {displayRating(altMovie)}</span>}
                      {displayRuntime(altMovie.runtime) && <span>{altMovie.runtime}</span>}
                      {displayCert(altMovie.cert) && <span>{altMovie.cert}</span>}
                    </div>
                    <ul className="v2m-alt__reasons">
                      {intel!.altReasons.map((r) => <li key={r}><span aria-hidden="true">✓</span>{r}</li>)}
                    </ul>
                  </div>
                </Link>
                <Link className="v2m-btn v2m-btn--primary v2m-btn--block" href={`/movie/${altMovie.id}`}>
                  Watch Instead
                </Link>
                <Link className="v2m-more" href="/discover">See more alternatives <Icon name="chevr" size={13} /></Link>
              </div>
            )}
            {!hasAlt && suggestions.length > 0 && (
              <div className="v2m-panel v2m-side">
                <h3>Can&apos;t Watch It Tonight?</h3>
                <Link className="v2m-alt" href={`/movie/${suggestions[0].id}`}>
                  <div className="v2m-alt__poster">
                    <Image fill alt={`${suggestions[0].title} poster`} src={posterLg(suggestions[0])} sizes="92px" />
                  </div>
                  <div className="v2m-alt__info">
                    <div className="v2m-alt__title">{suggestions[0].title}</div>
                    <div className="v2m-alt__meta">
                      {displayRating(suggestions[0]) && <span className="v2m-alt__rate">&#9733; {displayRating(suggestions[0])}</span>}
                      {displayRuntime(suggestions[0].runtime) && <span>{suggestions[0].runtime}</span>}
                      {displayCert(suggestions[0].cert) && <span>{suggestions[0].cert}</span>}
                    </div>
                    <ul className="v2m-alt__reasons">
                      {computedAltReasons(movie, suggestions[0]).map((r) => <li key={r}><span aria-hidden="true">✓</span>{r}</li>)}
                    </ul>
                  </div>
                </Link>
                <Link className="v2m-btn v2m-btn--primary v2m-btn--block" href={`/movie/${suggestions[0].id}`}>
                  Watch Instead
                </Link>
                <Link className="v2m-more" href="/discover">See more alternatives <Icon name="chevr" size={13} /></Link>
                <div className="v2m-finenote v2m-center">Based on this title&apos;s genre and runtime - not a personal claim.</div>
              </div>
            )}
          </div>
        </aside>
        )}
      </div>

      {/* 5.15 GUIDES - bottom of page (founder decision), and OUTSIDE the
          two-column row on purpose: the sidebar's job is to sit beside the
          title's own content, and it ends with that content. The guides are
          the page's exit - three wide cards reading across the full page
          rather than squeezed into the main column with an empty sidebar
          gutter beside them. Same honest heading as the homepage: these are
          the site's decision guides, not guides claiming to be about THIS
          title. */}
      <div className="v2m-guides">
        <BlogSection count={3} title="What to Watch Guides" sub="Written guides to help you decide" />
      </div>
    </div>
  );
}
