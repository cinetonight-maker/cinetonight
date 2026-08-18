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
import { track } from "@/lib/analytics";
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
}

export default function PickStudio({ seed, seedPool }: PickStudioProps) {
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
  const activeQuickPick = quickPickId ? quickPickById(quickPickId) : undefined;
  const activeMood = moodId ? moodById(moodId) : undefined;

  // After hydration, shuffle everything BEHIND the visible seed. The seed
  // itself must stay put (it is in the server HTML - reordering it would be a
  // hydration mismatch), but the "Another pick" trail behind it should differ
  // per visitor instead of replaying the same fixed order.
  useEffect(() => {
    setPool((p) => (p.length > 2 ? [p[0], ...shuffle(p.slice(1))] : p));
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
      if (results.length) { setPool(shuffle(results)); setIndex(0); }
      else setFailed(true);
    } catch {
      if (mine === reqRef.current) setFailed(true);
    } finally {
      if (mine === reqRef.current) setLoading(false);
    }
  }, []);

  const scrollToPick = () => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const chooseQuickPick = (q: QuickPick) => {
    const next = quickPickId === q.id ? null : q.id;
    setQuickPickId(next);
    track("quick_pick_selected", { quick_pick: q.id });
    if (next) {
      setMoodId(null);
      loadPool({ moodId: q.moodId, quick: q, kind });
      scrollToPick();
    }
  };

  const chooseMood = (id: string) => {
    const next = moodId === id ? null : id;
    setMoodId(next);
    track("mood_selected", { mood: id });
    if (next) {
      setQuickPickId(null);
      loadPool({ moodId: id, kind });
      scrollToPick();
    }
  };

  const anotherPick = () => {
    track("another_pick", {});
    setIndex((i) => (pool.length ? (i + 1) % pool.length : 0));
  };

  /** Films / Series / Anything. This existed as state from day one but had
   *  no control on screen - which meant series were only ever reachable by
   *  luck. Changing it refetches with the current mood or Quick Pick kept,
   *  and the kind param is clamped server-side like everything else. */
  const chooseKind = (next: Kind) => {
    if (next === kind) return;
    setKind(next);
    track("kind_selected", { kind: next });
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
          {QUICK_PICKS.map((q) => {
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
      <section className="sec pstudio__sec" id="choose-your-mood" aria-labelledby="moods-h">
        <div className="sec__head">
          <div className="sec__titles">
            <h2 id="moods-h">Choose Your Mood</h2>
            <p className="sec__sub">Tell us how tonight feels and we will match it</p>
          </div>
        </div>
        <div className="moodgrid" role="group" aria-label="Choose your mood">
          {MOODS.map((m) => {
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

        {!loading && pick && (
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
                <WhereToWatch movie={{ id: pick.id, tmdbId: pick.tmdbId, kind: pick.kind, title: pick.title }} />
              </div>
            </div>

            <div className="pcard__side">
              <button
                type="button"
                className="pcard__trailer"
                onClick={() => {
                  track("trailer_play", { title: pick.title, source: "homepage_pick" });
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
                <WatchlistButton id={pick.id} />
              </div>

              <TicketStub movie={pick} />
            </div>
          </article>
        )}
      </section>
    </>
  );
}
