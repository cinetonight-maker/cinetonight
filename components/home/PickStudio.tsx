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
import { asBucket, type RegionBucket } from "@/lib/regionBucket";
import { displayRuntime } from "@/lib/quality";
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

/** "How much time have you got?"
 *
 *  0 means no limit. Every other value MUST already appear in the route's
 *  ALLOWED_RUNTIME list (app/api/mood/route.ts) - anything else is dropped
 *  server-side and the control would silently do nothing. This is the whole
 *  reason the panel is a fixed list of options and not a free number box:
 *  each value is a cache key, and the closed set is what keeps them few. */
const RUNTIME_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Any length" },
  { value: 60, label: "About an hour" },
  { value: 90, label: "90 minutes or less" },
  { value: 120, label: "Up to 2 hours" },
  { value: 150, label: "The whole evening" },
];

/** "Who are you watching with?"
 *
 *  Every option resolves to something the engine ALREADY does, on purpose:
 *  two of them are the Date Night and Family Night Quick Picks under a
 *  plainer name, and Friends is the Excited mood. Nothing new is invented
 *  behind this control, which means no new query shapes, no new cache keys,
 *  and - the part that actually matters - the "why this fits" line stays
 *  true, because it is still generated from the same criteria those picks
 *  have always carried.
 *
 *  It is a VIEW over the current selection rather than its own piece of
 *  state: the value is read back from whichever mood or Quick Pick is
 *  active, so the dropdown and the cards can never disagree about what was
 *  chosen. */
type CompanyId = "" | "partner" | "family" | "friends";
const COMPANY_OPTIONS: { value: CompanyId; label: string; quickPick?: string; mood?: string }[] = [
  { value: "", label: "Not specified" },
  { value: "partner", label: "A partner", quickPick: "date-night" },
  { value: "family", label: "Family", quickPick: "family" },
  { value: "friends", label: "Friends", mood: "excited" },
];

/** Build-time V2 switch (docs/V2-BUILD-PATH.md Phase 5): inlined into the
 *  client bundle at build, so both themes never ship together and the ISR
 *  HTML matches the hydrated output. Same rule as the server templates. */
const V2 = process.env.NEXT_PUBLIC_V2_THEME === "1";

/* RUNTIME ON THE PICK CARD.
 *
 * TMDB's discover and trending LIST endpoints do not carry runtime - only the
 * per-title detail endpoint does - so every title arriving from the picker is
 * built with the placeholder "—" (fromDiscoverHit, lib/tmdb). The movie pages
 * never showed a bare dash because they run every field through
 * displayRuntime() first; this component simply was not doing that, so the
 * placeholder went straight to the screen.
 *
 * Two fixes, and both are needed: run the value through the SAME guard the
 * movie pages use, and then actually go and fetch the real duration for the
 * one title on screen (the effect below).
 *
 * The filtering was never affected: "Under 90 Minutes" applies
 * with_runtime.lte at TMDB, which works whether or not the value comes back. */

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
/** The line under an alternative's title.
 *
 *  These three titles come from the same LIST response as everything else in
 *  the pool, so none of them carries a runtime - and printing `a.runtime`
 *  directly put the placeholder dash under every one of them. Fetching a real
 *  duration for each would mean three more requests every time the pick
 *  changes, for a row of secondary options nobody has clicked yet, which is
 *  not a trade worth making.
 *
 *  So this shows what the list response DOES give us and is genuinely useful
 *  when choosing between three posters: how old it is, whether it is a film or
 *  a series, and how it scores. A real runtime is still preferred when the
 *  title happens to be a catalogue one that has it. */
function altMeta(a: Movie): string {
  return [
    displayRuntime(a.runtime) ?? (a.year > 0 ? String(a.year) : null),
    a.kind === "series" ? "Series" : "Film",
  ].filter(Boolean).join(" · ");
}

function altKicker(alt: Movie, lead: Movie): string {
  const parts: string[] = [];
  if (alt.genres[0]) parts.push(alt.genres[0]);
  const a = runtimeMinutes(alt.runtime); const l = runtimeMinutes(lead.runtime);
  if (a != null && l != null && Math.abs(a - l) >= 15) parts.push(a < l ? "Shorter" : "Longer");
  return parts.join(" · ");
}

/* ---------------------------------------------------------------------
   ALREADY-SEEN MEMORY

   The picker used to repeat itself twice over: "Another pick" walks a pool
   of eight and then wraps back to the start, and every new visit began with
   an empty head, so yesterday's visitor could be handed yesterday's titles
   again. This remembers what has actually been PUT ON SCREEN and prefers
   something else next time.

   Three deliberate choices:

   1. sessionStorage, not localStorage: the memory dies with the tab. A
      person coming back next week should get the strong titles again rather
      than only ever being pushed further down the long tail - and nothing
      about their viewing is left on the device after they leave.
   2. A rolling window of the newest 30, rather than wiping all 30 at once
      when it fills. Same promise ("you will not see a repeat for a long
      time") without the edge where the pick straight after a wipe is the one
      you just saw. Thirty is roughly four pools' worth of "Another pick" —
      far more than a real sitting — so the window filling up at all is the
      exception, not the normal case.
   3. Only the title actually DISPLAYED is recorded, never the whole fetched
      pool - marking eight titles as "seen" when the visitor laid eyes on one
      would burn through the catalogue and hide films nobody was ever shown.

   Every access is wrapped: private mode and storage-disabled browsers throw
   on the first touch, and a repeated film is never worth breaking the page
   over. */
const SEEN_KEY = "cinetonight:seen";
const SEEN_LIMIT = 30;

function readSeen(): string[] {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function rememberSeen(id: string): void {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([id, ...readSeen().filter((v) => v !== id)].slice(0, SEEN_LIMIT)));
  } catch {
    /* no storage, no memory - the picker just behaves as it did before */
  }
}

/** Drop titles this browser has already shown - unless doing so would leave
 *  almost nothing, in which case the full pool is better than a dead end.
 *  Two is the floor because a single-title pool makes "Another pick" a
 *  button that visibly does nothing. */
function dropSeen(list: Movie[]): Movie[] {
  const seen = new Set(readSeen());
  const unseen = list.filter((m) => !seen.has(m.id));
  return unseen.length >= 2 ? unseen : list;
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
  /** Minutes, 0 for "any". Independent of mood and Quick Pick: it narrows
   *  whatever else is selected rather than replacing it. */
  const [runtime, setRuntime] = useState(0);
  /** Refine panel: OPEN on desktop, CLOSED on a phone.
   *
   *  On a wide screen the fields cost nothing and a control nobody can see is
   *  a control nobody uses. On a phone they stack into a tall column that
   *  pushes the mood chips off the screen, so it starts shut there.
   *
   *  It starts CLOSED in the server HTML and opens on desktop after mount,
   *  never the other way round. The homepage is one cached document for every
   *  visitor, so the initial state cannot depend on screen size - and of the
   *  two possible flashes, a panel quietly expanding on desktop is far less
   *  jarring than one collapsing under a phone reader's thumb. */
  const [refineOpen, setRefineOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    if (window.matchMedia("(min-width: 721px)").matches) setRefineOpen(true);
  }, []);
  const [pool, setPool] = useState<Movie[]>(seed ? [seed, ...seedPool] : seedPool);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const reqRef = useRef(0);
  /** Which audience pool this browser is being served (lib/regionBucket.ts).
   *  Null until the first /api/mood answer tells us — the homepage HTML is
   *  one shared ISR document for the whole world, so it cannot carry a
   *  per-visitor region without giving up that cache. The first call of a
   *  session therefore asks without one and is answered privately; every
   *  call after it carries the bucket in the URL and is served from the
   *  shared edge cache. A ref, not state: nothing on screen depends on it,
   *  so learning it must never trigger a re-render. */
  const regionRef = useRef<RegionBucket | null>(null);
  /** Real runtimes, fetched one title at a time for the pick actually on
   *  screen. Same rule Where to Watch already follows in this component:
   *  never query for a shelf of titles nobody asked about. /api/title is
   *  edge-cached for an hour and shares the movie page's own cache entry, so
   *  a title looked up here is usually already paid for. */
  const [runtimes, setRuntimes] = useState<Record<string, string>>({});
  const runtimeAsked = useRef<Set<string>>(new Set());

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
  const loadPool = useCallback(async (opts: { moodId: string; quick?: QuickPick; kind: Kind; runtime?: number }) => {
    const mine = ++reqRef.current;
    setLoading(true);
    setFailed(false);
    const q = new URLSearchParams({ id: opts.moodId });
    // Pin the bucket once it is known, so this request joins the shared,
    // edge-cached path instead of being answered privately again.
    if (regionRef.current) q.set("region", regionRef.current);
    // An EXPLICIT Films/Series choice beats a Quick Pick's default kind -
    // if someone sets "Series" and then taps "Under 90 Minutes", they mean
    // short series, not the pick's usual films.
    const wantKind = opts.kind !== "any" ? opts.kind : opts.quick?.kind;
    // Time is the one refinement that COMBINES with a Quick Pick instead of
    // overriding it, and the STRICTER limit wins. That is an honesty rule as
    // much as a product one: "Under 90 Minutes" prints the claim "a film
    // under 90 minutes", so letting a 2-hour choice loosen it would make the
    // explanation under the recommendation false.
    const wantRuntime = Math.min(...[opts.runtime, opts.quick?.maxRuntime].filter((v): v is number => Boolean(v)), Infinity);
    if (Number.isFinite(wantRuntime)) q.set("maxRuntime", String(wantRuntime));
    if (opts.quick?.minRating) q.set("minRating", String(opts.quick.minRating));
    if (opts.quick?.maxVotes) q.set("maxVotes", String(opts.quick.maxVotes));
    if (wantKind) q.set("kind", wantKind);
    try {
      const res = await fetch(`/api/mood?${q}`);
      const data = res.ok ? await res.json() : null;
      if (mine !== reqRef.current) return;
      const results: Movie[] = dropSeen(data?.results ?? []);
      // The route echoes the bucket it resolved from the visitor's geo
      // header. asBucket() re-validates rather than trusting the payload.
      regionRef.current = asBucket(data?.region) ?? regionRef.current;
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

  /* Record the title on screen, including the server-rendered seed and every
   * "Another pick" step. The seed itself is deliberately NOT skipped when it
   * has been seen before: it is baked into the shared page HTML, and swapping
   * it out after hydration would make the page visibly change under the
   * reader for no real gain. It is remembered, so the NEXT pool avoids it. */
  useEffect(() => {
    if (pick?.id) rememberSeen(pick.id);
  }, [pick?.id]);

  // Fill in the duration for the title on screen, once per id per session.
  useEffect(() => {
    const id = pick?.id;
    if (!id || displayRuntime(pick?.runtime) || runtimeAsked.current.has(id)) return;
    runtimeAsked.current.add(id);
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/title?id=${encodeURIComponent(id)}`);
        if (!res.ok || !live) return;
        const rt = displayRuntime((await res.json())?.movie?.runtime);
        if (rt && live) setRuntimes((m) => ({ ...m, [id]: rt }));
      } catch {
        /* a missing duration is not worth surfacing an error for */
      }
    })();
    return () => { live = false; };
  }, [pick?.id, pick?.runtime]);

  const scrollToPick = () => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // V2 chooser card extras. The initial pool is remembered so Reset can
  // honestly return to the popularity-based state the page rendered with —
  // clearing the labels while keeping a mood-filtered pool on screen would
  // break the "the subtitle describes the pick" rule.
  const initialPoolRef = useRef<Movie[]>(seed ? [seed, ...seedPool] : seedPool);
  const resetChooser = () => {
    setQuickPickId(null); setMoodId(null); setKind("any"); setRuntime(0);
    setPool(initialPoolRef.current); setIndex(0); setFailed(false);
    attemptRef.current = 0;
  };

  /** Clear the mood/Quick Pick axis ONLY, leaving the refinements alone.
   *  "Watching with -> Not specified" means "I did not say who", not "undo
   *  the fact that I have 90 minutes and want a film". */
  const clearMoodSelection = () => {
    setQuickPickId(null); setMoodId(null);
    setPool(initialPoolRef.current); setIndex(0); setFailed(false);
    attemptRef.current = 0;
  };
  const chooseSurprise = () => {
    setQuickPickId(null); setMoodId(null);
    trackPickerStarted({ surface: "homepage" });
    loadPool({ moodId: "surprise", kind, runtime });
    scrollToPick();
  };

  const chooseQuickPick = (q: QuickPick) => {
    const next = quickPickId === q.id ? null : q.id;
    setQuickPickId(next);
    trackQuickPickSelected({ quick_pick: q.id, surface: "homepage" });
    if (next) {
      setMoodId(null);
      loadPool({ moodId: q.moodId, quick: q, kind, runtime });
      scrollToPick();
    }
  };

  const chooseMood = (id: string) => {
    const next = moodId === id ? null : id;
    setMoodId(next);
    trackMoodSelected({ mood: id, surface: "homepage", media_type: kind === "any" ? undefined : kind });
    if (next) {
      setQuickPickId(null);
      loadPool({ moodId: id, kind, runtime });
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
    if (activeQuickPick) loadPool({ moodId: activeQuickPick.moodId, quick: activeQuickPick, kind: next, runtime });
    else if (moodId) loadPool({ moodId, kind: next, runtime });
    else if (next !== "any") loadPool({ moodId: "surprise", kind: next, runtime });
  };

  /** How much time the visitor has. Narrows whatever is already selected —
   *  and on its own it is still a real request, because "I have 90 minutes"
   *  is a complete answer to "what should I watch" by itself. */
  const chooseRuntime = (next: number) => {
    if (next === runtime) return;
    setRuntime(next);
    track("runtime_selected", { runtime: next || undefined, surface: "homepage" });
    if (activeQuickPick) loadPool({ moodId: activeQuickPick.moodId, quick: activeQuickPick, kind, runtime: next });
    else if (moodId) loadPool({ moodId, kind, runtime: next });
    else if (next) loadPool({ moodId: "surprise", kind, runtime: next });
  };

  /** Read the company answer back OUT of the current selection, so this
   *  control can never claim something the engine is not actually doing. */
  const company: CompanyId =
    COMPANY_OPTIONS.find((o) => (o.quickPick && o.quickPick === quickPickId) || (o.mood && o.mood === moodId))?.value ?? "";

  const chooseCompany = (next: CompanyId) => {
    const opt = COMPANY_OPTIONS.find((o) => o.value === next);
    if (!opt) return;
    track("company_selected", { company: next || undefined, surface: "homepage" });
    if (opt.quickPick) {
      const q = quickPickById(opt.quickPick);
      if (!q) return;
      setQuickPickId(q.id); setMoodId(null);
      loadPool({ moodId: q.moodId, quick: q, kind, runtime });
      scrollToPick();
    } else if (opt.mood) {
      setMoodId(opt.mood); setQuickPickId(null);
      loadPool({ moodId: opt.mood, kind, runtime });
      scrollToPick();
    } else {
      clearMoodSelection();
    }
  };

  // The hero's buttons live outside this island; they ask for a pick by
  // dispatching an event, the same lightweight pattern the trailer player
  // already uses. Keeps the hero server-rendered and crawlable.
  useEffect(() => {
    const surprise = () => {
      setQuickPickId(null); setMoodId(null);
      loadPool({ moodId: "surprise", kind: "any", runtime: 0 });
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

  /** Did ANY filter actually run? Drives the heading: calling an unfiltered
   *  popularity result "Why this fits" promises reasoning that never
   *  happened, which is what made the box read as filler. */
  const explained = Boolean(appliedQuickPick || appliedMood || kind !== "any" || (!stale && runtime));

  const why = whyItFits({
    quickPick: appliedQuickPick,
    mood: appliedMood,
    kind,
    // Only claim the time limit when a request carrying it actually
    // succeeded - same rule as the mood and Quick Pick above.
    maxRuntime: stale ? undefined : runtime || undefined,
    titleRating: pick?.rating,
    // Lets the line name the genres this title ACTUALLY matched on, rather
    // than repeating the button that was pressed.
    titleGenres: pick?.genres,
  });

  return (
    <>
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
                  {(displayRuntime(pick.runtime) ?? runtimes[pick.id]) && (
                    <span>{displayRuntime(pick.runtime) ?? runtimes[pick.id]}</span>
                  )}
                  {pick.rating > 0 && (
                    <span className="v2pk-rate"><Icon name="star" size={11} /> {pick.rating.toFixed(1)}</span>
                  )}
                </div>
                {pick.desc && <p className="v2pk-desc">{pick.desc}</p>}

                <div className="v2pk-why">
                  <span className="v2pk-whyh">
                    <Icon name={explained ? "sparkle" : "info"} size={13} />
                    {explained ? " Why this fits" : " Tonight's starting point"}
                  </span>
                  <p>{why}</p>
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
                      <span className="v2pk-altm">
                        {altMeta(a)}
                        {a.rating > 0 && (
                          <>
                            {" · "}
                            <span className="v2pk-rate"><Icon name="star" size={10} /> {a.rating.toFixed(1)}</span>
                          </>
                        )}
                      </span>
                    </span>
                  </button>
                ))}
                <button type="button" className="v2pk-again" onClick={anotherPick} disabled={loading || pool.length < 2}>
                  ↻ Give me another choice
                </button>
              </aside>

              {/* Where to Watch spans the FULL width under both columns.
                  It used to sit inside the middle column, wedged between the
                  synopsis and the buttons, where a row of provider logos had
                  the least horizontal room of anywhere in the card. Its own
                  band at the bottom gives it the width it actually needs and
                  keeps the reading order intact: what it is, why it fits,
                  then where to watch it. */}
              <div className="v2pk-watch">
                <WhereToWatch movie={{ id: pick.id, tmdbId: pick.tmdbId, kind: pick.kind, title: pick.title }} surface="homepage" />
              </div>
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

      {/* ---------------------------------------------------------------- */}
      {V2 ? (
        /* V2 chooser card (canvas Main: "Tell us how tonight should feel").
           SAME engine: mood chips call the same chooseMood, the media-type
           control is the same chooseKind, Surprise is the hero's surprise
           flow. Only refinements the engine actually applies are offered.
           Time and company now have real logic behind them (see
           RUNTIME_OPTIONS and COMPANY_OPTIONS); the canvas's COUNTRY select
           is still left out, because availability is resolved per title in
           Where to Watch and a country here would filter nothing while
           looking like it did (rule one: nothing decorative that pretends
           to filter). */
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
            <p className="v2mc-q"><strong>How should the movie feel?</strong> Choose one - you can change it anytime.</p>
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
            <details
              className="v2mc-refine"
              open={refineOpen}
              onToggle={(e) => setRefineOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="v2mc-refine__sum">
                Refine your picks
                <span>Time, company and media type</span>
              </summary>
              <div className="v2mc-fields">
                <label className="v2mc-field">
                  <span className="v2mc-field__l">How long have you got?</span>
                  <select
                    className="v2mc-select"
                    value={runtime}
                    onChange={(e) => chooseRuntime(Number(e.target.value))}
                  >
                    {RUNTIME_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label className="v2mc-field">
                  <span className="v2mc-field__l">Watching with</span>
                  <select
                    className="v2mc-select"
                    value={company}
                    onChange={(e) => chooseCompany(e.target.value as CompanyId)}
                  >
                    {COMPANY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <div className="v2mc-field">
                  <span className="v2mc-field__l">Films or series</span>
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
              </div>
            </details>
            <div className="v2mc-foot">
              <p className="v2mc-note"><strong>No account required.</strong> You&apos;ll get one lead choice and two useful alternatives.</p>
              <button
                type="button"
                className="v2mc-go"
                onClick={() => { if (moodId || quickPickId) scrollToPick(); else chooseSurprise(); }}
              >
                Show my picks ↑
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
                {/* .qpick__art is the future image slot (real per-pick movie art
                    lands here later) -- an <Image> can replace qpick__ic
                    directly inside it without any other markup changes. */}
                <span className="qpick__art">
                  <span className="qpick__ic"><Icon name={q.icon} size={20} /></span>
                </span>
                <span className="qpick__body">
                  <span className="qpick__t">{q.label}</span>
                  <span className="qpick__s">{q.sub}</span>
                </span>
                {on && <span className="qpick__check" aria-hidden="true"><Icon name="check" size={12} /></span>}
              </button>
            );
          })}
        </div>
      </section>

    </>
  );
}
