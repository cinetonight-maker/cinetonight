/* ============================================================================
 * lib/cacheEligibility.ts — is this title worth writing to the R2 ISR cache?
 *
 * THE PROBLEM (see PROJECT_HANDOFF/04_CLOUDFLARE_AND_COST_HISTORY.md, 3 Sep
 * 2026 entry): lib/pathGuard.ts rejects impossible ids (bad shape, out of
 * range) before anything renders, but it deliberately cannot tell a real,
 * obscure TMDB id from one worth caching - it has no database or network
 * access by design. A crawler walking real-but-worthless ids (a boxing
 * match record, a foreign title nobody searches for) passes pathGuard fine,
 * and every one of them became a permanent R2 write under plain ISR.
 *
 * THE RULE: a title we curated ourselves always caches, regardless of its
 * current vote/popularity numbers - we already vouched for it. Anything
 * reached only through the live TMDB fallback has to show some real
 * engagement signal first. The threshold is grounded in the actual curated
 * catalogue (content/movies.json, checked 3 Sep 2026): every curated title's
 * vote count is at minimum 97 (Stree 2) - votes >= 10 sits roughly 10x below
 * that floor, so it only excludes near-zero-engagement titles, never
 * anything resembling curated-tier content. popularity >= 5 is a separate,
 * OR'd condition for a legitimately trending brand-new release that hasn't
 * accumulated votes yet - votes lag by days, popularity reacts within hours
 * (see the comment on Movie.popularity in lib/types.ts).
 *
 * PURE MODULE — no imports, no database, no network, same testability
 * pattern as lib/tonightFit.ts / lib/clips.ts / lib/regionBucket.ts. Unit
 * tested in tests/cacheEligibility.test.mjs.
 * ========================================================================= */

const MIN_VOTES = 10;
const MIN_POPULARITY = 5;

/** Shape-only: callers pass whatever fields they have (a full Movie, or just
 *  the two numbers) so this stays decoupled from lib/types.ts's Movie type. */
export interface EligibilitySignal {
  votes?: number;
  popularity?: number;
}

/** Does this title, on its own data, show enough real engagement to be
 *  worth an R2 write? Curated status is NOT this function's concern - a
 *  caller who already knows a title is curated should skip calling this at
 *  all and just cache. This only answers the question for the uncurated,
 *  publicly-walkable id space. */
export function hasRealSignal(movie: EligibilitySignal): boolean {
  return (movie.votes ?? 0) >= MIN_VOTES || (movie.popularity ?? 0) >= MIN_POPULARITY;
}

/** The single entry point a page uses: should this specific request's
 *  result be written to the ISR/R2 cache? Curated titles always yes; an
 *  uncurated title needs hasRealSignal(). */
export function shouldCacheTitle(movie: EligibilitySignal, isCurated: boolean): boolean {
  return isCurated || hasRealSignal(movie);
}
