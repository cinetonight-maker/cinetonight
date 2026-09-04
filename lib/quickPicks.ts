import { ALL_MOODS, type Mood } from "./moods.ts";

/** One-tap starting points for the homepage recommendation engine.
 *
 *  Each Quick Pick is a NAMED, FIXED combination of an existing mood plus a
 *  couple of numeric constraints. That matters for two reasons:
 *
 *  1. Honesty. The "why it fits" line on a recommendation is generated from
 *     these exact fields, so it always states real matching criteria rather
 *     than inventing praise for the film.
 *  2. Cost. The set is closed - 8 picks, each mapping to one bounded discover
 *     query - so the cache entries they produce are a small reusable set, not
 *     an open-ended key space. Never make these user-composable.
 */
export interface QuickPick {
  id: string;
  label: string;
  /** One short line under the label. Describes the RULE, not the films. */
  sub: string;
  /** Icon name from components/Icon. */
  icon: string;
  /** Which existing mood supplies the candidate genres. */
  moodId: Mood["id"];
  /** Minutes, passed to TMDB's runtime filter. */
  maxRuntime?: number;
  /** 0-10 floor on the TMDB score. */
  minRating?: number;
  /** Vote-count ceiling. The ONLY thing that entitles a pick to say
   *  "less talked about" - see lib/tmdb.ts MoodPoolOptions.maxVotes. */
  maxVotes?: number;
  /** Restrict to films or series only. */
  kind?: "movie" | "series";
  /** Human-readable constraint list, used verbatim in "why it fits". */
  criteria: string[];
}

export const QUICK_PICKS: QuickPick[] = [
  // Phase 3: LOCKED to these six. Each feeds the same recommendation engine
  // (/api/mood) — no separate per-pick datasets.
  {
    id: "date-night", label: "Date Night", sub: "Romantic, well reviewed",
    icon: "sparkle", moodId: "romantic", minRating: 7,
    criteria: ["a romantic pick", "rated 7 or higher"],
  },
  {
    id: "short", label: "Under 90 Minutes", sub: "Home before bedtime",
    icon: "cal", moodId: "surprise", maxRuntime: 90, kind: "movie",
    criteria: ["a film under 90 minutes"],
  },
  {
    id: "feelgood", label: "Feel Good", sub: "Nothing heavy",
    icon: "thumbup", moodId: "happy",
    criteria: ["a feel-good pick with nothing heavy"],
  },
  {
    // NOTE: the label is the OCCASION, the criteria are the FILTER. We do not
    // have certification data, so we must not claim a title is "family
    // friendly" - what we can truthfully say is which genres were included and
    // which were excluded, which is what the happy mood actually does.
    id: "family", label: "Family Night", sub: "Nothing dark or violent",
    icon: "user", moodId: "happy", minRating: 6.5, kind: "movie",
    criteria: ["a film with no horror, crime, war or thriller", "rated 6.5 or higher"],
  },
  {
    id: "hidden-gem", label: "Hidden Gem", sub: "Well rated, less talked about",
    icon: "search", moodId: "surprise", minRating: 7.5, maxVotes: 1500,
    criteria: ["rated 7.5 or higher", "with fewer than 1,500 TMDB votes"],
  },
  {
    id: "highly-rated", label: "Highly Rated", sub: "Score of 8 and up",
    icon: "star", moodId: "surprise", minRating: 8,
    criteria: ["rated 8 or higher"],
  },
];

export const quickPickById = (id: string) => QUICK_PICKS.find((q) => q.id === id);
// Resolves grid moods AND the internal "surprise" mood quick picks rely on.
export const moodById = (id: string) => ALL_MOODS.find((m) => m.id === id);

/** The factual explanation shown under a recommendation.
 *
 *  THE RULE HAS NOT CHANGED: every clause is built ONLY from criteria the
 *  visitor actually chose plus values we actually hold for the title. It
 *  never says how the film was received, how good it is, or how audiences
 *  reacted.
 *
 *  WHAT CHANGED (2 Sep 2026) is that it now says something. The old line -
 *  "Matched because you asked for your happy mood." - restated the button the
 *  visitor had just pressed and told them nothing they did not already know,
 *  which is why it read as filler. The interesting part was sitting unused in
 *  lib/moods.ts: "Happy" is a real query for comedy, family, music, adventure
 *  and animation with horror, crime, war and thrillers excluded. Naming the
 *  genres this title actually matched on turns the box from a receipt into an
 *  explanation - and explaining the pick honestly is the thing this site is
 *  supposed to be better at than a streaming grid.
 *
 *  It degrades safely: with no title genres it describes the mood's own
 *  genres, and with nothing selected at all it says so plainly. */
export function whyItFits(opts: {
  quickPick?: QuickPick;
  mood?: Mood;
  kind?: "movie" | "series" | "any";
  maxRuntime?: number;
  minRating?: number;
  titleRating?: number;
  /** The genres THIS title carries, used to name the actual overlap with the
   *  mood. Never used to claim a match that did not happen. */
  titleGenres?: string[];
}): string {
  const list = (items: string[]): string =>
    items.length <= 1
      ? (items[0] ?? "")
      : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

  /** Long exclusion sets (Stressed rules out six genres) would swamp the
   *  sentence, so they are capped. "and more" is vague but true; naming four
   *  and pretending that is all would not be. */
  const capped = (items: string[], max = 4): string =>
    // Comma-join before "and more" - routing it through list() produced
    // "horror, thriller, crime and war and more", with two ands in a row.
    items.length > max ? `${items.slice(0, max).join(", ")} and more` : list(items);

  const lower = (g: string[]) => g.map((x) => x.toLowerCase());
  const score = opts.titleRating && opts.titleRating > 0
    ? ` It scores ${opts.titleRating.toFixed(1)} on TMDB.`
    : "";

  /* ---- nothing selected -------------------------------------------- */
  if (!opts.quickPick && !(opts.mood && opts.mood.genres.length)
      && !opts.maxRuntime && !opts.minRating && (!opts.kind || opts.kind === "any")) {
    // The first line every visitor reads, now that the recommendation sits at
    // the top of the page. It leads with the real reason this title is here -
    // being among the most watched is a genuine reason to care - and puts the
    // absence of filters second, rather than opening on what we have not done.
    return `Picked from what most people are watching right now - nothing narrowed down yet.${score} Tell us how tonight should feel below and this line will explain the exact match.`;
  }

  /* ---- the extra constraints, shared by both paths ------------------ */
  const extras: string[] = [];
  // Suppressed when the Quick Pick already restricts the kind - "a film under
  // 90 minutes, films only" said the same thing twice.
  if (opts.kind === "movie" && opts.quickPick?.kind !== "movie") extras.push("films only");
  if (opts.kind === "series" && opts.quickPick?.kind !== "series") extras.push("series only");
  if (opts.maxRuntime && !opts.quickPick?.maxRuntime) extras.push(`under ${opts.maxRuntime} minutes`);
  if (opts.minRating && !opts.quickPick?.minRating) extras.push(`rated ${opts.minRating} or higher`);

  /* ---- a mood was chosen -------------------------------------------- */
  if (opts.mood && opts.mood.genres.length) {
    const moodGenres = lower(opts.mood.genres);
    const excludes = lower(opts.mood.exclude ?? []);
    const matched = lower(
      (opts.titleGenres ?? []).filter((g) =>
        opts.mood!.genres.some((mg) => mg.toLowerCase() === g.toLowerCase())),
    );
    const ruled = excludes.length ? `, with ${capped(excludes)} ruled out` : "";
    const tail = extras.length ? ` You also asked for ${list(extras)}.` : "";

    // Name the real overlap when there is one; otherwise describe what the
    // mood searched for, without claiming this title sits inside it.
    const head = matched.length
      ? `Matched on ${list(matched)} - ${matched.length === 1 ? "a genre" : "genres"} your ${opts.mood.label} mood looks for${ruled}.`
      : `From your ${opts.mood.label} mood, which looks for ${capped(moodGenres, 5)}${ruled}.`;
    return `${head}${score}${tail}`;
  }

  /* ---- a Quick Pick (or bare constraints) --------------------------- */
  const asked = Array.from(new Set([...(opts.quickPick?.criteria ?? []), ...extras]));
  const genres = lower((opts.titleGenres ?? []).slice(0, 3));
  const isIt = genres.length ? ` This one is ${list(genres)}.` : "";
  return `You asked for ${list(asked)}.${isIt}${score}`;
}
