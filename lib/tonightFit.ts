import type { Movie } from "./types";
import { MOODS } from "./moods.ts";
import { displayRuntime, displayRating } from "./quality.ts";
import { canonicalGenre } from "./genres.ts";

/* ============================================================================
 * lib/tonightFit.ts — "is this right for tonight?", computed.
 *
 * WHY THIS EXISTS. About 33,000 title pages carry no human-reviewed intel, so
 * everything editorial on them is gated off and what remains is poster,
 * synopsis, rating, cast, trailer and where to watch — every single item of
 * which comes from TMDB and is therefore available on a hundred other sites.
 * That is the exact shape of page Google's own guidance asks about ("does
 * this provide substantial value compared to other pages in results?"), and
 * the honest answer for a pure TMDB mirror is no.
 *
 * The sites that DO rank without editorial (JustWatch, PlayPilot, Binged)
 * are not writing prose either. Each adds one thing the database does not
 * have. This is ours: the homepage decision engine, applied to the title the
 * reader is actually looking at. It answers the question the whole brand is
 * built on, on the page where the decision happens.
 *
 * THE RULES IT PLAYS BY, which are not negotiable:
 *  - Every line is derived from a value we hold for THIS title. Nothing is
 *    inferred, softened or invented.
 *  - No adjectives about quality. "Rated 8.1 from 4,200 votes" is a fact;
 *    "a brilliant film" is not, and never appears here.
 *  - A line we cannot back is simply not emitted. A short honest list beats
 *    a padded one — and a missing runtime must never become a claim.
 *  - This is NOT the deferred "quick take" tier. Nothing here is generated
 *    prose or a synthesised opinion; it is matching logic with its working
 *    shown. It needs no human review because it asserts no human judgment.
 *
 * Pure and deterministic: no fetching, no randomness, no clock. Safe on a
 * cached server-rendered page and cheap enough to run on every title.
 * ========================================================================= */

export interface FitLine {
  /** The sentence shown to the reader. */
  text: string;
  /** Where this reason can be explored, when one exists. */
  href?: string;
}

export interface TonightFit {
  fits: FitLine[];
  notFor: FitLine[];
}

/** Minutes from "2h 14m" / "1h 05m" / "48m". Null when unparsable — which
 *  includes the empty runtime every TMDB LIST hit carries. */
export function fitMinutes(runtime: string | undefined | null): number | null {
  const s = displayRuntime(runtime);
  if (!s) return null;
  const h = /(\d+)\s*h/i.exec(s);
  const m = /(\d+)\s*m/i.exec(s);
  if (!h && !m) return null;
  const total = (h ? parseInt(h[1], 10) * 60 : 0) + (m ? parseInt(m[1], 10) : 0);
  return total > 0 ? total : null;
}

const lower = (g: string) => g.trim().toLowerCase();
/** "a excited mood" was the giveaway that nobody had read the output. */
const article = (word: string) => (/^[aeiou]/i.test(word.trim()) ? "an" : "a");
const has = (genres: string[], name: string) => genres.some((g) => lower(g) === lower(name));

/** Join 1-3 genre names for prose: "comedy", "comedy and family". */
function genreList(gs: string[]): string {
  const g = gs.slice(0, 2).map(lower);
  return g.length <= 1 ? (g[0] ?? "") : `${g[0]} and ${g[1]}`;
}

/** Does this title satisfy a mood the way /api/mood would select it?
 *  Same two conditions the engine itself applies: at least one of the mood's
 *  genres present, and none of its excluded genres present. */
export function moodMatches(movie: Pick<Movie, "genres">, moodId: string): boolean {
  const mood = MOODS.find((m) => m.id === moodId);
  if (!mood) return false;
  const gs = movie.genres ?? [];
  if (!gs.length) return false;
  if ((mood.exclude ?? []).some((x) => has(gs, x))) return false;
  const hits = mood.genres.filter((g) => has(gs, g));
  return mood.match === "all" ? hits.length === mood.genres.length : hits.length > 0;
}

/**
 * Build the two lists. `movie` is whatever the page already holds — no extra
 * fetch is performed or required.
 */
export function tonightFit(movie: Movie): TonightFit {
  const fits: FitLine[] = [];
  const notFor: FitLine[] = [];

  const genres = (movie.genres ?? []).filter(Boolean);
  const mins = fitMinutes(movie.runtime);
  const rating = displayRating(movie);
  const votes = movie.votes ?? 0;
  const isSeries = movie.kind === "series";
  const noun = isSeries ? "series" : "film";

  /* ---- time, the single most common real constraint ------------------- */
  if (mins && !isSeries) {
    const pretty = displayRuntime(movie.runtime);
    if (mins <= 90) {
      fits.push({ text: `You have a short evening: it runs ${pretty}, under 90 minutes.`, href: "/discover" });
    } else if (mins <= 120) {
      fits.push({ text: `You have about two hours: it runs ${pretty}.`, href: "/discover" });
      notFor.push({ text: `You only have 90 minutes: this runs ${pretty}.` });
    } else {
      fits.push({ text: `You want to settle in for the evening: it runs ${pretty}.` });
      notFor.push({ text: `You want something short: this runs ${pretty}.` });
    }
  }

  /* ---- mood, straight from the same rules the picker uses -------------- */
  //
  // Capped at two, and only when a mood brings NEW evidence. Comedy+Family
  // satisfies Happy, Relaxed AND Stressed, and printing all three produced
  // the same sentence about the same two genres three times over - padding,
  // which is the exact failure this whole block exists to avoid.
  const matched = MOODS.filter((m) => moodMatches(movie, m.id));
  const usedEvidence = new Set<string>();
  for (const m of matched) {
    if (fits.filter((f) => f.text.includes("mood")).length >= 2) break;
    const shown = m.genres.filter((g) => has(genres, g)).slice(0, 2).map(lower);
    if (!shown.length) continue;
    const lead0 = m.genres.find((g) => has(genres, g));
    // Dedupe on the LEAD genre, not the full evidence string: "Comedy+Family"
    // and "Comedy" are different keys but both resolve to the comedy hub, so
    // the page ended up with two near-identical lines pointing at one URL.
    const key = lower(lead0 ?? shown.join("+"));
    if (usedEvidence.has(key)) continue;
    usedEvidence.add(key);
    // Link the LEAD GENRE at its real browse URL rather than sending everyone
    // to /discover. Both are honest, but "this is comedy" pointing at the
    // comedy listing is a destination the reader actually wants, and it gives
    // 33,000 pages a genuine internal link into the genre hubs instead of one
    // generic link repeated everywhere. canonicalGenre() keeps it to URLs the
    // sitemap already lists - an unmapped genre simply gets no link.
    const lead = m.genres.find((g) => has(genres, g));
    const canon = lead ? canonicalGenre(lead) : undefined;
    fits.push({
      text: `You are in ${article(m.label)} ${m.label} mood: this is ${shown.length > 1 ? `${shown[0]} and ${shown[1]}` : shown[0]}.`,
      href: canon ? `/movies?genre=${encodeURIComponent(canon)}` : "/discover",
    });
  }
  // The reverse is just as useful, and just as factual: a mood this title is
  // explicitly disqualified from, because it carries a genre that mood rules
  // out. Only the clearest one, or the list turns into noise.
  const blocked = MOODS.find((m) => (m.exclude ?? []).some((x) => has(genres, x)));
  if (blocked) {
    const why = (blocked.exclude ?? []).filter((x) => has(genres, x)).slice(0, 2).map(lower);
    notFor.push({ text: `You want something for ${article(blocked.label)} ${blocked.label} mood: this is ${why.join(" and ")}.` });
  }

  /* ---- reception, stated as the number it is --------------------------- */
  if (rating && votes >= 20) {
    const v = votes.toLocaleString("en-US");
    if (Number(rating) >= 8) {
      fits.push({ text: `You want something well reviewed: it holds ${rating}/10 on TMDB from ${v} votes.` });
    } else if (Number(rating) >= 7) {
      fits.push({ text: `You want a safe pick: it holds ${rating}/10 on TMDB from ${v} votes.` });
    } else if (Number(rating) < 6) {
      notFor.push({ text: `You want a crowd-pleaser: it holds ${rating}/10 on TMDB from ${v} votes.` });
    }
    // The Hidden Gem rule, verbatim from lib/quickPicks.
    if (Number(rating) >= 7.5 && votes < 1500) {
      fits.push({ text: `You want something less talked about: well rated, but only ${v} TMDB votes so far.`, href: "/discover" });
    }
  }

  /* ---- format, the cheapest mismatch to prevent ------------------------ */
  notFor.push({ text: `You want ${isSeries ? "a film" : "a series"}: this is a ${noun}.` });

  return { fits, notFor };
}
