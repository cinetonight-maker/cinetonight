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
import EpisodePicker from "../EpisodePicker";
import { toCard, type Movie } from "@/lib/types";
import type { WatchPayload } from "@/lib/watchRows";
import type { MovieIntel } from "@/lib/intel";
import { hasVerdict, hasTake } from "@/lib/intel";
import { personId } from "@/lib/data";
import { personTmdbId, type SeasonInfo, type SeriesFacts } from "@/lib/tmdb";
import { posterLg, profile, backdrop } from "@/lib/images";
import {
  factualAbout, displayRating, displayRuntime, displayCert, displayField,
  displayPeople, validYear, releaseStatus,
} from "@/lib/quality";

/* ============================================================================
 * V2 Movie Detail template (docs/V2-BUILD-PATH.md, Phase 2).
 *
 * Layout is the LOCKED design from the "CineTonight V2" canvas / the static
 * exports in the handover package: a contained hero card inside a two-column
 * layout so Where to Watch sits beside the identity in the first viewport
 * (spec 5.3), a sticky decision sidebar, exploration modules down the main
 * column, Related Guides at the BOTTOM (founder decision, 1 Sep 2026).
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

export default function MovieDetailV2({
  movie, seasons = [], suggestions = [], watch = null, intel = null, altMovie = null, seriesFacts = null,
}: {
  movie: Movie;
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

  // Where-to-Watch status line for the hero — built from the same payload
  // the sidebar island receives, honest about fallback regions, silent
  // when the server-side check failed (the island still self-loads).
  const streamingRows = watch?.rows?.length ?? 0;
  const heroStatus = watch && streamingRows > 0
    ? watch.fallbackRegion
      ? `Showing ${watch.countryName} availability — not confirmed for your country yet`
      : `Streaming in ${watch.countryName} · ${streamingRows} option${streamingRows === 1 ? "" : "s"}`
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
  const statusLabel = seriesFacts?.status === "returning" ? "Returning — more episodes coming"
    : seriesFacts?.status === "ended" ? "Ended — complete story"
    : seriesFacts?.status === "cancelled" ? "Cancelled"
    : seriesFacts?.status === "in-production" ? "In production — not yet released"
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

  const details: [string, string | null][] = [
    ["Release Year", validYear(movie.year) ? String(movie.year) : null],
    ["Status", status === "upcoming" ? "Upcoming" : null],
    ["Runtime", displayRuntime(movie.runtime)],
    ["Language", displayField(movie.language)],
    ["Certification", displayCert(movie.cert)],
    ["Genres", movie.genres.filter(Boolean).join(", ") || null],
    [isSeries ? "Created By" : "Director", directors],
    ["Writers", displayPeople(movie.writers)],
    ["Type", isSeries ? "Web Series" : "Feature Film"],
  ];

  return (
    <div className="v2m">
      <div className="v2m-cols">
        {/* ============================== MAIN ============================== */}
        <div className="v2m-main">

          {/* HERO — contained card; identity + immediate action (5.3) */}
          <section className="v2m-hero">
            <div className="v2m-hero__bg" aria-hidden="true">
              <Image fill alt="" src={backdrop(movie, "w1280")} sizes="(max-width: 1200px) 100vw, 1100px" priority />
            </div>
            <div className="v2m-hero__in">
              <a className="v2m-hero__poster" href="#trailer" aria-label={`Play ${movie.title} trailer`}>
                <Image fill alt={`${movie.title} poster`} src={posterLg(movie)} sizes="(max-width: 900px) 30vw, 216px" priority />
                {rating && <span className="v2m-hero__badge"><Icon name="star" size={11} /> {rating}</span>}
                {movie.trailerKey && (
                  <span className="v2m-hero__play" aria-hidden="true"><Icon name="play" size={18} /></span>
                )}
              </a>
              <div className="v2m-hero__body">
                <div className="v2m-chips">
                  {movie.genres.slice(0, 3).map((g) => (
                    <Link key={g} className="v2m-chip" href={`/movies?genre=${encodeURIComponent(g)}`}>{g}</Link>
                  ))}
                  <span className="v2m-chip v2m-chip--type">{isSeries ? "Series" : "Movie"}</span>
                </div>
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
                    <span className="v2m-hero__ratenote">(external rating — not a CineTonight score)</span>
                  </div>
                )}
                <div className="v2m-hero__acts">
                  <a className="v2m-btn v2m-btn--primary" href="#watch">See Watching Options</a>
                  {movie.trailerKey && <a className="v2m-btn" href="#trailer"><Icon name="play" size={14} /> Play Trailer</a>}
                  <WatchlistButton id={movie.id} kind={movie.kind} surface={isSeries ? "series_detail" : "movie_detail"} />
                  <TicketStub movie={movie} />
                </div>
                {heroStatus && (
                  <div className={`v2m-hero__status${watch?.fallbackRegion ? " is-fallback" : ""}`}>
                    <i aria-hidden="true" />{heroStatus}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* 5.4 THE TONIGHT VERDICT — reviewed intel only */}
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

          {/* ABOUT + intel panels — About always renders; the rest are gated */}
          <section className="v2m-sec">
            <div className={`v2m-grid2${!hasSnapshot && !hasExpect && !hasBestFor && !hasCommitment ? " v2m-grid2--solo" : ""}`}>
              <div className="v2m-panel">
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
              {hasExpect && (
                <div className="v2m-panel">
                  <span className="v2m-kicker">What to Expect</span>
                  {intel!.expect.map((r) => (
                    <div className="v2m-kv" key={r.label}>
                      <span className="v2m-kv__k">{r.label}</span>
                      <span className="v2m-kv__v v2m-kv__v--dots">{r.value}<Dots level={r.level} /></span>
                    </div>
                  ))}
                  <div className="v2m-finenote">Editorial judgment in plain words — never a fake score.</div>
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

          {/* 5.9 THE CINETONIGHT TAKE — accountable editorial only */}
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

          {/* TRAILER + DETAILS */}
          <section className="v2m-sec" id="trailer">
            <div className="v2m-trailer-row">
              <div>
                <div className="v2m-h2row"><h2>Trailer</h2></div>
                <InlineTrailer movie={movie} />
              </div>
              <div>
                <div className="v2m-h2row"><h2>{isSeries ? "Series" : "Movie"} Details</h2></div>
                <div className="v2m-panel"><Kv rows={details} /></div>
              </div>
            </div>
          </section>

          {/* Series: seasons & episodes (existing picker, spoiler-safe) */}
          {isSeries && movie.tmdbId != null && seasons.length > 0 && (
            <section className="v2m-sec">
              <div className="v2m-h2row"><h2>Seasons &amp; Episodes</h2></div>
              <EpisodePicker
                tvId={movie.tmdbId}
                showTitle={movie.title}
                seasons={seasons}
                fallbackTrailerKey={movie.trailerKey ?? null}
              />
            </section>
          )}

          {/* 5.11 CAST & CREW — director gets standalone prominence */}
          {(movie.cast.length > 0 || firstDirector) && (
            <section className="v2m-sec">
              <div className="v2m-h2row"><h2>Cast &amp; Crew</h2></div>
              {firstDirector && (
                <div className="v2m-director">
                  <span className="v2m-director__avatar" aria-hidden="true">
                    {firstDirector.split(/\s+/).map((w) => w[0]).slice(0, 2).join("")}
                  </span>
                  <div>
                    <div className="v2m-sub">{isSeries ? "Creator" : "Director"}</div>
                    <div className="v2m-director__name">{directors}</div>
                  </div>
                </div>
              )}
              {movie.cast.length > 0 && (
                <div className="railwrap"><div className="rail castrail">
                  {movie.cast.map((c) => (
                    <Link className="castc" href={`/person/${c.tmdbId ? personTmdbId(c.tmdbId, c.name) : personId(c.name)}`} key={c.name}>
                      <div className="castc__ph"><Image fill alt={c.name} src={profile(c)} sizes="64px" /></div>
                      <div className="castc__n">{c.name}</div>
                      <div className="castc__r">as {c.character}</div>
                    </Link>
                  ))}
                </div></div>
              )}
            </section>
          )}

          {/* 5.13 MORE LIKE THIS — real recommendations, no invented reasons.
              Editorial similarity reasons arrive with the content pilot
              (Phase 6); until then cards carry facts only. */}
          {suggestions.length > 0 && (
            <section className="v2m-sec">
              <div className="v2m-h2row">
                <div>
                  <h2>More Like This</h2>
                  <p className="v2m-h2sub">More like {movie.title}, picked from what people are watching</p>
                </div>
                <Link className="v2m-more" href="/trending">See all <Icon name="chevr" size={13} /></Link>
              </div>
              {/* One clean row — an orphan wrapping card reads as a mistake;
                  See all carries the rest. */}
              <div className="grid">
                {suggestions.slice(0, 5).map((s) => <MovieCard key={s.id} movie={toCard(s)} />)}
              </div>
            </section>
          )}

          {/* 5.16 community layer — existing honest reviews module */}
          <CommentsSection movie={movie} />

          {/* 5.15 GUIDES — bottom of page (founder decision). Same honest
              heading as the homepage: these are the site's decision guides,
              not guides claiming to be about THIS title. */}
          <BlogSection count={3} title="What to Watch Guides" sub="Written guides to help you decide" />
        </div>

        {/* ============================== ASIDE ============================= */}
        <aside className="v2m-aside" id="watch">
          <div className="v2m-aside__sticky">
            <WhereToWatch movie={movie} surface={isSeries ? "series_detail" : "movie_detail"} initial={watch} />

            {hasProfile && (
              <div className="v2m-panel v2m-side">
                <h3>Tonight Profile</h3>
                <Kv rows={[
                  ["Runtime", displayRuntime(movie.runtime)],
                  ["Experience", intel!.mood],
                  ["Attention", intel!.attention],
                  ["Best for", intel!.bestForContext],
                ]} />
                <Link className="v2m-more" href="/discover">Find a {isSeries ? "series" : "movie"} that fits your night <Icon name="chevr" size={13} /></Link>
              </div>
            )}

            {hasAlt && altMovie && (
              <div className="v2m-panel v2m-side">
                <h3>Can&apos;t Watch It Tonight?</h3>
                <Link className="v2m-alt" href={`/movie/${altMovie.id}`}>
                  <div className="v2m-alt__poster">
                    <Image fill alt={`${altMovie.title} poster`} src={posterLg(altMovie)} sizes="52px" />
                  </div>
                  <div>
                    <div className="v2m-sub">Closest alternative</div>
                    <div className="v2m-alt__title">{altMovie.title}</div>
                    {validYear(altMovie.year) && (
                      <div className="v2m-alt__meta">{altMovie.year}{displayRuntime(altMovie.runtime) ? ` · ${altMovie.runtime}` : ""}</div>
                    )}
                  </div>
                </Link>
                <ul className="v2m-alt__reasons">
                  {intel!.altReasons.map((r) => <li key={r}><span aria-hidden="true">✓</span>{r}</li>)}
                </ul>
                <Link className="v2m-btn v2m-btn--primary v2m-btn--block" href={`/movie/${altMovie.id}`}>
                  Watch {altMovie.title} Instead
                </Link>
                <div className="v2m-finenote v2m-center">Based on this title&apos;s genre and runtime — not a personal claim.</div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
