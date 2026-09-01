"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Icon from "../Icon";
import WatchlistButton from "../WatchlistButton";
import WhereToWatch from "../WhereToWatch";
import TicketStub from "../TicketStub";
import { openPlayer } from "@/lib/player";
import { poster, backdrop } from "@/lib/images";
import { MOODS } from "@/lib/moods";
import { QUICK_PICKS, quickPickById, moodById, whyItFits, type QuickPick } from "@/lib/quickPicks";
import {
  trackPickerStarted, trackMoodSelected, trackQuickPickSelected, trackAnotherPick,
  trackRecommendationViewed, trackRecommendationFailed, trackTrailerPlayed,
  toMediaType, once, track,
} from "@/lib/analytics";
import type { Movie } from "@/lib/types";

/** The homepage's decision engine: Quick Picks, moods and one recommendation,
 *  in a single client island so they share state without a context provider.
 *
 *  COST DESIGN (this is the part to preserve):
 *  - Nothing here runs on the server during the page render. The homepage
 *    ships with a seed pick already in its HTML, so the section is useful and
 *    crawlable with zero JavaScript and zero extra fetches.
 *  - Interaction calls /api/mood, which is force-dynamic: it never writes a
 *    page-cache entry. The discover queries behind it come from a CLOSED set
 *    of mood x clamped-filter combinations, so they reuse a small pool of
 *    cache entries instead of creating new ones per click.
 *  - "Another Pick" walks the already-fetched candidate list. No refetch, no
 *    new cache key, and deliberately no randomness in anything the server
 *    sees, which would fragment the cache.
 *  - Where to Watch is only queried once a title is actually on screen, never
 *    for a shelf of titles nobody asked about. */

type Kind = "any" | "movie" | "series";

/** Build-time V2 switch (docs/V2-BUILD-PATH.md Phase 5): inlined into the
 *  client bundle at build, so both themes never ship together and the ISR
 *  HTML matches the hydrated output. Same rule as the server templates. */
const V2 = process.env.NEXT_PUBLIC_V2_THEME === "1";

/** "2h 23m" → 143. Null when the string carries no parsable duration. */
function runtimeMinutes(rt: string | undefined): number | null {
  if (!rt) return null;
  const h = /(\d+)\s*h/.exec(rt); const m = /(\d+)\s*m/.exec(rt);
  if (!h && !m) return null;
  return (h ? parseInt(h[1], 10) * 60 : 0) + (m ? parseInt(m[1], 10) : 0);
}

/** Factual kicker for an "Also Consider" row: lead genre plus an honest
 *  runtime comparison against the current pick. Never invented adjectives —
 *  only facts we hold (STAB rules: nothing editorial without editorial data). */
function altKicker(alt: Movie, lead: Movie): string {
  const parts: string[] = [];
  if (alt.genres[0]) parts.push(alt.genres[0]);
  const a = runtimeMinutes(alt.runtime); const l = runtimeMinutes(lead.runtime);
  if (a != null && l != null && Math.abs(a - l) >= 15) parts.push(a < l ? "Shorter" : "Longer");
  return parts.join(" · ");
}

/** Fisher-Yates, CLIENT-side only.
 *
 *  This is what makes the picker feel alive again. The API returns each pool
 *  in a fixed order (most-voted first), and popular blockbusters top several
 *  moods at once - so without this, every visitor's first pick was identical,
 *  every "Another pick" walk was identical, and different moods kept opening
 *  with the same famous title. Shuffling in the browser costs nothing and
 *  fragments nothing: the server response (and its cache entry) is untouched.
 *  Randomness must NEVER move server-side - that would split the cache. */
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface PickStudioProps {
  /** Server-rendered starting recommendation, so the section is never empty. */
  seed: Movie | null;
  /** Rest of the seed pool, used by "Another Pick" before any fetch happens. */
  seedPool: Movie[];
  /** Which moods and Quick Picks to OFFER, and in what order, from the
   *  dashboard (lib/discoveryConfig). Presentation only — the ids and the
   *  rules behind them still come from lib/moods.ts and lib/quickPicks.ts, so
   *  the API's cache-key space is unchanged whatever is configured here.
   *  Absent = show everything, which is the shipped behaviour. */
  discovery?: {
    moods: { id: string; label: string; icon: string }[];
    quickPicks: { id: string; label: string; sub: string; icon: string }[];
  };
}

export default function PickStudio({ seed, seedPool, discovery }: PickStudioProps) {
  const [quickPickId, setQuickPickId] = useState<string | null>(null);
  const [moodId, setMoodId] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("any");
  const [pool, setPool] = useState<Movie[]>(seed ? [seed, ...seedPool] : seedPool);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const reqRef = useRef(0);

  const pick = pool[index] ?? null;
  const attemptRef = useRef(0); // "another pick" count within the current pool
  const activeQuickPick = quickPickId ? quickPickById(quickPickId) : undefined;
  const activeMood = moodId ? moodById(moodId) : undefined;
  const recSource = activeQuickPick ? ("quick_pick" as const) : activeMood ? ("mood" as const) : ("trending" as const);

  // After hydration, shuffle everything BEHIND the visible seed. The seed
  // itself must stay put (it is in the server HTML - reordering it would be a
  // hydration mismatch), but the "Another pick" trail behind it should differ
  // per visitor instead of replaying the same fixed order.
  useEffect(() => {
    setPool((p) => (p.length > 2 ? [p[0], ...shuffle(p.slice(1))] : p));
    // The server-rendered seed IS a displayed recommendation. once() guards
    // Strict Mode double-effects and remounts.
    if (seed && once("seed-recommendation")) {
      trackRecommendationViewed({ surface: "homepage", recommendation_source: "trending", media_type: toMediaType(seed.kind), tmdb_id: seed.tmdbId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Fetch a fresh candidate pool for the current selection. */
  const loadPool = useCallback(async (opts: { moodId: string; quick?: QuickPick; kind: Kind }) => {
    const mine = ++reqRef.current;
    setLoading(true);
    setFailed(false);
    const q = new URLSearchParams({ id: opts.moodId });
    // An EXPLICIT Films/Series choice beats a Quick Pick's default kind -
    // if someone sets "Series" and then taps "Under 90 Minutes", they mean
    // short series, not the pick's usual films.
    const wantKind = opts.kind !== "any" ? opts.kind : opts.quick?.kind;
    if (opts.quick?.maxRuntime) q.set("maxRuntime", String(opts.quick.maxRuntime));
    if (opts.quick?.minRating) q.set("minRating", String(opts.quick.minRating));
    if (opts.quick?.maxVotes) q.set("maxVotes", String(opts.quick.maxVotes));
    if (wantKind) q.set("kind", wantKind);
    try {
      const res = await fetch(`/api/mood?${q}`);
      const data = res.ok ? await res.json() : null;
      if (mine !== reqRef.current) return;
      const results: Movie[] = data?.results ?? [];
      if (results.length) {
        setPool(shuffle(results)); setIndex(0);
        attemptRef.current = 0; // fresh pool, fresh attempt counter
        // SUCCESS boundary: a result actually exists and is on screen.
        trackRecommendationViewed({
          surface: "homepage",
          recommendation_source: opts.quick ? "quick_pick" : opts.moodId === "surprise" ? "trending" : "mood",
          media_type: toMediaType(results[0]?.kind),
          mood: opts.quick ? undefined : opts.moodId,
          quick_pick: opts.quick?.id,
          tmdb_id: results[0]?.tmdbId,
        });
      } else {
        setFailed(true);
        trackRecommendationFailed({ failure_type: "no_results", surface: "homepage" });
      }
    } catch {
      if (mine === reqRef.current) { setFailed(true); trackRecommendationFailed({ failure_type: "network", surface: "homepage" }); }
    } finally {
      if (mine === reqRef.current) setLoading(false);
    }
  }, []);

  const scrollToPick = () => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // V2 chooser card extras. The initial pool is remembered so Reset can
  // honestly return to the popularity-based state the page rendered with —
  // clearing the labels while keeping a mood-filtered pool on screen would
  // break the "the subtitle describes the pick" rule.
  const initialPoolRef = useRef<Movie[]>(seed ? [seed, ...seedPool] : seedPool);
  const resetChooser = () => {
    setQuickPickId(null); setMoodId(null); setKind("any");
    setPool(initialPoolRef.current); setIndex(0); setFailed(false);
    attemptRef.current = 0;
  };
  const chooseSurprise = () => {
    setQuickPickId(null); setMoodId(null);
    trackPickerStarted({ surface: "homepage" });
    loadPool({ moodId: "surprise", kind });
    scrollToPick();
  };

  const chooseQuickPick = (q: QuickPick) => {
    const next = quickPickId === q.id ? null : q.id;
    setQuickPickId(next);
    trackQuickPickSelected({ quick_pick: q.id, surface: "homepage" });
    if (next) {
      setMoodId(null);
      loadPool({ moodId: q.moodId, quick: q, kind });
      scrollToPick();
    }
  };

  const chooseMood = (id: string) => {
    const next = moodId === id ? null : id;
    setMoodId(next);
    trackMoodSelected({ mood: id, surface: "homepage", media_type: kind === "any" ? undefined : kind });
    if (next) {
      setQuickPickId(null);
      loadPool({ moodId: id, kind });
      scrollToPick();
    }
  };

  const anotherPick = () => {
    attemptRef.current += 1;
    // attempt_number matters: a high count means the first picks missed.
    trackAnotherPick({ surface: "homepage", attempt_number: attemptRef.current, recommendation_source: recSource });
    setIndex((i) => (pool.length ? (i + 1) % pool.length : 0));
  };

  /** Films / Series / Anything. This existed as state from day one but had
   *  no control on screen - which meant series were only ever reachable by
   *  luck. Changing it refetches with the current mood or Quick Pick kept,
   *  and the kind param is clamped server-side like everything else. */
  const chooseKind = (next: Kind) => {
    if (next === kind) return;
    setKind(next);
    track("media_type_selected", { media_type: toMediaType(next === "any" ? undefined : next), surface: "homepage" });
    if (activeQuickPick) loadPool({ moodId: activeQuickPick.moodId, quick: activeQuickPick, kind: next });
    else if (moodId) loadPool({ moodId, kind: next });
    else if (next !== "any") loadPool({ moodId: "surprise", kind: next });
  };

  // The hero's buttons live outside this island; they ask for a pick by
  // dispatching an event, the same lightweight pattern the trailer player
  // already uses. Keeps the hero server-rendered and crawlable.
  useEffect(() => {
    const surprise = () => {
      setQuickPickId(null); setMoodId(null);
      loadPool({ moodId: "surprise", kind: "any" });
      scrollToPick();
    };
    const focusMoods = () => {
      document.getElementById("choose-your-mood")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("cinetonight:surprise", surprise);
    window.addEventListener("cinetonight:moods", focusMoods);
    return () => {
      window.removeEventListener("cinetonight:surprise", surprise);
      window.removeEventListener("cinetonight:moods", focusMoods);
    };
  }, [loadPool]);

  // HONESTY RULE: a selection only describes the pick if the request that
  // applied it actually succeeded. When /api/mood fails we keep the previous
  // title on screen (better than an empty section) but we must NOT keep
  // claiming it matches the mood or Quick Pick the visitor just chose, and we
  // must not print a "why it fits" built from filters that were never applied.
  const stale = failed && Boolean(pick);
  const appliedQuickPick = stale ? undefined : activeQuickPick;
  const appliedMood = stale ? undefined : activeMood;

  const why = whyItFits({
    quickPick: appliedQuickPick,
    mood: appliedMood,
    kind,
    titleRating: pick?.rating,
  });

  return (
    <>
      {/* ---------------------------------------------------------------- */}
      <section className="sec pstudio__sec" aria-labelledby="quick-picks-h">
        <div className="sec__head">
          <div className="sec__titles">
            <h2 id="quick-picks-h"><Icon name="sparkle" size={17} /> Quick Picks</h2>
            <p className="sec__sub">One tap and we will find something</p>
          </div>
        </div>
        <div className="qpicks" role="group" aria-label="Quick Picks">
          {(discovery
            ? discovery.quickPicks
                .map((d) => { const q = quickPickById(d.id); return q ? { ...q, label: d.label, sub: d.sub, icon: d.icon } : null; })
                .filter((q): q is QuickPick => !!q)
            : QUICK_PICKS
          ).map((q) => {
            const on = quickPickId === q.id;
            return (
              <button
                key={q.id}
                type="button"
                className={`qpick${on ? " on" : ""}`}
                aria-pressed={on}
                onClick={() => chooseQuickPick(q)}
              >
                <span className="qpick__ic"><Icon name={q.icon} size={18} /></span>
                <span className="qpick__t">{q.label}</span>
                <span className="qpick__s">{q.sub}</span>
                {on && <span className="qpick__check" aria-hidden="true"><Icon name="check" size={12} /></span>}
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {V2 ? (
        /* V2 chooser card (canvas Main: "Tell us how tonight should feel").
           SAME engine: mood chips call the same chooseMood, the media-type
           control is the same chooseKind, Surprise is the hero's surprise
           flow. Only refinements the engine actually applies are offered —
           the canvas's country/company selects are left out until real
           logic exists behind them (rule one: nothing decorative that
           pretends to filter). */
        <section className="sec pstudio__sec" id="choose-your-mood" aria-labelledby="moods-h">
          <div className="v2mc">
            <div className="v2mc-head">
              <h2 id="moods-h" className="v2mc-h">Tell us how tonight should feel</h2>
              <button type="button" className="v2mc-reset" onClick={resetChooser}>Reset</button>
            </div>
            <div className="v2mc-steps" aria-hidden="true">
              <span className={!moodId && !quickPickId ? "on" : undefined}>1 · Choose a feeling</span>
              <span>2 · Add details if needed</span>
              <span className={moodId || quickPickId ? "on" : undefined}>3 · Get your explained pick</span>
            </div>
            <p className="v2mc-q"><strong>How should the movie feel?</strong> Choose one — you can change it anytime.</p>
            <div className="v2mc-chips" role="group" aria-label="Choose your mood">
              <button type="button" className="v2mc-chip v2mc-chip--surprise" onClick={chooseSurprise}>
                🎲 Surprise Me
              </button>
              {(discovery
                ? discovery.moods
                    .map((d) => { const m = moodById(d.id); return m ? { ...m, label: d.label, emoji: d.icon } : null; })
                    .filter((m): m is (typeof MOODS)[number] => !!m)
                : MOODS
              ).map((m) => {
                const on = moodId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`v2mc-chip${on ? " on" : ""}`}
                    aria-pressed={on}
                    onClick={() => chooseMood(m.id)}
                  >
                    <span aria-hidden="true">{m.emoji}</span> {m.label}
                  </button>
                );
              })}
            </div>
            <div className="v2mc-refine">
              <p className="v2mc-q"><strong>Refine your pick</strong> — films, series or anything</p>
              <div className="v2mc-kinds" role="group" aria-label="Films or series">
                {([["any", "Anything"], ["movie", "Films"], ["series", "Series"]] as [Kind, string][]).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={`v2mc-kind${kind === k ? " on" : ""}`}
                    aria-pressed={kind === k}
                    onClick={() => chooseKind(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="v2mc-foot">
              <p className="v2mc-note"><strong>No account required.</strong> You&apos;ll get one lead choice and two useful alternatives.</p>
              <button
                type="button"
                className="v2mc-go"
                onClick={() => { if (moodId || quickPickId) scrollToPick(); else chooseSurprise(); }}
              >
                Show my picks →
              </button>
            </div>
          </div>
        </section>
      ) : (
      <section className="sec pstudio__sec" id="choose-your-mood" aria-labelledby="moods-h">
        <div className="sec__head">
          <div className="sec__titles">
            <h2 id="moods-h">Choose Your Mood</h2>
            <p className="sec__sub">Tell us how tonight feels and we will match it</p>
          </div>
        </div>
        <div className="moodgrid" role="group" aria-label="Choose your mood">
          {(discovery
            ? discovery.moods
                .map((d) => { const m = moodById(d.id); return m ? { ...m, label: d.label, emoji: d.icon } : null; })
                .filter((m): m is (typeof MOODS)[number] => !!m)
            : MOODS
          ).map((m) => {
            const on = moodId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                className={`moodtile${on ? " on" : ""}`}
                aria-pressed={on}
                onClick={() => chooseMood(m.id)}
              >
                <span className="moodtile__emoji" aria-hidden="true">{m.emoji}</span>
                <span className="moodtile__label">{m.label}</span>
                {on && <span className="moodtile__on" aria-hidden="true"><Icon name="check" size={12} /></span>}
              </button>
            );
          })}
        </div>
      </section>
      )}

      {/* ---------------------------------------------------------------- */}
      <section className="sec pstudio__sec" id="tonights-pick" ref={sectionRef} aria-labelledby="pick-h">
        <div className="sec__head">
          <div className="sec__titles">
            <h2 id="pick-h"><Icon name="sparkle" size={17} /> Your Pick for Tonight</h2>
            <p className="sec__sub">
              {appliedQuickPick ? `Based on ${appliedQuickPick.label}`
                : appliedMood ? `Based on your ${appliedMood.label} mood`
                : "Based on what is popular right now"}
            </p>
          </div>
          {/* V2 moves the media-type control into the chooser card and the
              "another" action into the Also Consider column. */}
          {!V2 && (
          <div className="pstudio__tools">
            <div className="kindtoggle" role="group" aria-label="Films or series">
              {([["any", "Anything"], ["movie", "Films"], ["series", "Series"]] as [Kind, string][]).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={`kindtoggle__btn${kind === k ? " on" : ""}`}
                  aria-pressed={kind === k}
                  onClick={() => chooseKind(k)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className="ad__btn pstudio__again" onClick={anotherPick} disabled={loading || pool.length < 2}>
              <Icon name="sparkle" size={14} /> Another pick
            </button>
          </div>
          )}
        </div>

        {loading && (
          <div className="pcard pcard--loading" aria-live="polite">Finding something for you…</div>
        )}

        {!loading && failed && !pick && (
          <div className="pcard pcard--empty">
            We could not reach the recommendation service just now. Try another mood, or
            {" "}<Link href="/movies">browse movies</Link> instead.
          </div>
        )}

        {!loading && stale && (
          <p className="pstudio__stale" role="status">
            We could not load a new suggestion just now, so this is still the previous one.
            Try again, or <Link href="/movies">browse movies</Link>.
          </p>
        )}

        {!loading && pick && V2 && (() => {
          /* V2 pick panel (canvas "Your Pick for Tonight"): blurred-backdrop
             hero card — poster + badge, facts, the honest why, the real
             WhereToWatch island, and an Also Consider column built from the
             NEXT TWO candidates of the pool that is already in memory (zero
             extra fetches; kickers are factual: genre + runtime comparison). */
          const alts = pool.length >= 3
            ? [pool[(index + 1) % pool.length], pool[(index + 2) % pool.length]]
            : pool.length === 2 ? [pool[(index + 1) % 2]] : [];
          return (
          <article className="v2pk">
            <span className="v2pk-bg" aria-hidden="true" style={{ backgroundImage: `url(${backdrop(pick, "w780")})` }} />
            <span className="v2pk-tint" aria-hidden="true" />
            <div className="v2pk-grid">
              <Link className="v2pk-poster" href={`/movie/${pick.id}`} aria-label={`${pick.title} details`}>
                <Image fill alt={`${pick.title} poster`} src={poster(pick, "w342")} sizes="(max-width: 900px) 40vw, 230px" />
                <span className="v2pk-badge">Tonight&apos;s Pick</span>
              </Link>

              <div className="v2pk-main">
                <h3 className="v2pk-title"><Link href={`/movie/${pick.id}`}>{pick.title}</Link></h3>
                <div className="v2pk-chips">
                  <span className="v2pk-chip">{pick.kind === "series" ? "Series" : "Film"}</span>
                  {pick.genres.slice(0, 2).map((g) => <span className="v2pk-chip" key={g}>{g}</span>)}
                </div>
                <div className="v2pk-meta">
                  {pick.year > 0 && <span>{pick.year}</span>}
                  {pick.runtime && <span>{pick.runtime}</span>}
                  {pick.rating > 0 && (
                    <span className="v2pk-rate"><Icon name="star" size={11} /> {pick.rating.toFixed(1)}</span>
                  )}
                </div>
                {pick.desc && <p className="v2pk-desc">{pick.desc}</p>}

                <div className="v2pk-why">
                  <span className="v2pk-whyh"><Icon name="sparkle" size={13} /> Why this fits</span>
                  <p>{why}</p>
                </div>

                <div className="v2pk-watch">
                  <WhereToWatch movie={{ id: pick.id, tmdbId: pick.tmdbId, kind: pick.kind, title: pick.title }} surface="homepage" />
                </div>

                <div className="v2pk-acts">
                  <Link className="v2pk-btn v2pk-btn--primary" href={`/movie/${pick.id}`}>View Details</Link>
                  <WatchlistButton id={pick.id} kind={pick.kind} surface="homepage" />
                  <button
                    type="button"
                    className="v2pk-trailerbtn"
                    onClick={() => {
                      trackTrailerPlayed({ surface: "homepage", media_type: toMediaType(pick.kind), tmdb_id: pick.tmdbId });
                      openPlayer({ title: pick.title, trailerKey: pick.trailerKey ?? null, mode: "trailer" });
                    }}
                  >
                    <Icon name="play" size={13} /> Play Trailer
                  </button>
                </div>
              </div>

              <aside className="v2pk-aside" aria-label="Also consider">
                <span className="v2pk-asideh">Also Consider</span>
                {alts.map((a, i) => (
                  <button
                    key={a.id}
                    type="button"
                    className="v2pk-alt"
                    onClick={() => {
                      track("alternative_selected", { surface: "homepage", attempt_number: i + 1 });
                      setIndex(pool.indexOf(a));
                    }}
                  >
                    <span className="v2pk-altposter">
                      <Image fill alt="" src={poster(a, "w342")} sizes="64px" />
                    </span>
                    <span className="v2pk-altbody">
                      {altKicker(a, pick) && <span className="v2pk-altk">{altKicker(a, pick)}</span>}
                      <span className="v2pk-altt">{a.title}</span>
                      {a.runtime && <span className="v2pk-altm">{a.runtime}</span>}
                    </span>
                  </button>
                ))}
                <button type="button" className="v2pk-again" onClick={anotherPick} disabled={loading || pool.length < 2}>
                  ↻ Give me another choice
                </button>
              </aside>
            </div>
          </article>
          );
        })()}

        {!loading && pick && !V2 && (
          <article className="pcard">
            <Link className="pcard__poster" href={`/movie/${pick.id}`} aria-label={`${pick.title} details`}>
              <Image
                fill
                alt={`${pick.title} poster`}
                src={poster(pick, "w342")}
                sizes="(max-width: 900px) 40vw, 200px"
              />
            </Link>

            <div className="pcard__body">
              <h3 className="pcard__title">
                <Link href={`/movie/${pick.id}`}>{pick.title}</Link>
              </h3>
              <div className="pcard__meta">
                {pick.year > 0 && <span>{pick.year}</span>}
                <span>{pick.kind === "series" ? "Series" : "Film"}</span>
                {pick.genres.slice(0, 2).map((g) => <span key={g}>{g}</span>)}
                {pick.rating > 0 && (
                  <span className="pcard__rate"><Icon name="star" size={12} /> {pick.rating.toFixed(1)}</span>
                )}
              </div>
              {pick.desc && <p className="pcard__desc">{pick.desc}</p>}

              <div className="pcard__why">
                <span className="pcard__whyh">Why this fits tonight</span>
                <p>{why}</p>
              </div>

              <div className="pcard__watch">
                <WhereToWatch movie={{ id: pick.id, tmdbId: pick.tmdbId, kind: pick.kind, title: pick.title }} surface="homepage" />
              </div>
            </div>

            <div className="pcard__side">
              <button
                type="button"
                className="pcard__trailer"
                onClick={() => {
                  trackTrailerPlayed({ surface: "homepage", media_type: toMediaType(pick.kind), tmdb_id: pick.tmdbId });
                  openPlayer({ title: pick.title, trailerKey: pick.trailerKey ?? null, mode: "trailer" });
                }}
              >
                <span className="pcard__still">
                  <Image fill alt="" src={backdrop(pick, "w780")} sizes="320px" />
                  <span className="pcard__playbtn" aria-hidden="true"><Icon name="play" size={20} /></span>
                </span>
                <span className="pcard__trailerlabel">Play trailer</span>
              </button>

              <div className="pcard__acts">
                <Link className="pcard__btn pcard__btn--primary" href={`/movie/${pick.id}`}>
                  <Icon name="info" size={15} /> Full details
                </Link>
                <WatchlistButton id={pick.id} kind={pick.kind} surface="homepage" />
              </div>

              <TicketStub movie={pick} />
            </div>
          </article>
        )}
      </section>
    </>
  );
}
