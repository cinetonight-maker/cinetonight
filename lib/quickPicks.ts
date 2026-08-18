import { MOODS, type Mood } from "./moods";

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
  {
    id: "date-night", label: "Date Night", sub: "Warm, well reviewed",
    icon: "sparkle", moodId: "feelgood", minRating: 7,
    criteria: ["a feel-good pick", "rated 7 or higher"],
  },
  {
    id: "short", label: "Under 90 Minutes", sub: "Home before bedtime",
    icon: "cal", moodId: "surprise", maxRuntime: 90, kind: "movie",
    criteria: ["a film under 90 minutes"],
  },
  {
    id: "feelgood", label: "Feel Good", sub: "Nothing heavy",
    icon: "thumbup", moodId: "feelgood",
    criteria: ["a feel-good pick"],
  },
  {
    id: "highly-rated", label: "Highly Rated", sub: "Score of 8 and up",
    icon: "star", moodId: "surprise", minRating: 8,
    criteria: ["rated 8 or higher"],
  },
  {
    // NOTE: the label is the OCCASION, the criteria are the FILTER. We do not
    // have certification data, so we must not claim a title is "family
    // friendly" - what we can truthfully say is which genres were included and
    // which were excluded, which is what the feelgood mood actually does.
    id: "family", label: "Family Night", sub: "Nothing dark or violent",
    icon: "user", moodId: "feelgood", minRating: 6.5, kind: "movie",
    criteria: ["a film with no horror, crime, war or thriller", "rated 6.5 or higher"],
  },
  {
    id: "hidden-gem", label: "Hidden Gem", sub: "Well rated, less talked about",
    icon: "search", moodId: "surprise", minRating: 7.5, maxVotes: 1500,
    criteria: ["rated 7.5 or higher", "with fewer than 1,500 TMDB votes"],
  },
  {
    id: "late-night", label: "Late Night", sub: "Dark and tense",
    icon: "playc", moodId: "chills",
    criteria: ["a horror, thriller or mystery pick"],
  },
  {
    id: "mind-bending", label: "Mind Bending", sub: "Twist your brain",
    icon: "grid", moodId: "mindbender",
    criteria: ["a mystery, science fiction, thriller or crime pick"],
  },
];

export const quickPickById = (id: string) => QUICK_PICKS.find((q) => q.id === id);
export const moodById = (id: string) => MOODS.find((m) => m.id === id);

/** The factual explanation shown under a recommendation.
 *
 *  Built ONLY from criteria the user actually chose plus values we actually
 *  have for the title. It never claims how the film was received, how good it
 *  is, or how audiences reacted - see docs and the site's content rules. If
 *  nothing was selected, it says so plainly rather than inventing a reason. */
export function whyItFits(opts: {
  quickPick?: QuickPick;
  mood?: Mood;
  kind?: "movie" | "series" | "any";
  maxRuntime?: number;
  minRating?: number;
  titleRating?: number;
}): string {
  const parts: string[] = [];
  if (opts.quickPick) parts.push(...opts.quickPick.criteria);
  if (opts.mood && opts.mood.genres.length) parts.push(`your ${opts.mood.label.toLowerCase()} mood`);
  if (opts.kind === "movie") parts.push("films only");
  if (opts.kind === "series") parts.push("series only");
  if (opts.maxRuntime && !opts.quickPick?.maxRuntime) parts.push(`under ${opts.maxRuntime} minutes`);
  if (opts.minRating && !opts.quickPick?.minRating) parts.push(`rated ${opts.minRating} or higher`);

  const unique = Array.from(new Set(parts));
  if (!unique.length) {
    return "Picked from what is popular right now. Choose a mood or a Quick Pick above to narrow it down.";
  }
  const list = unique.length === 1
    ? unique[0]
    : `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
  const score = opts.titleRating && opts.titleRating > 0
    ? ` It scores ${opts.titleRating.toFixed(1)} on TMDB.`
    : "";
  return `Matched because you asked for ${list}.${score}`;
}
