import test from "node:test";
import assert from "node:assert/strict";
import { hasRealSignal, shouldCacheTitle } from "../lib/cacheEligibility.ts";

/* Threshold ground truth (checked 3 Sep 2026): every title in
 * content/movies.json has at least 97 votes (Stree 2, the lowest). The
 * MIN_VOTES=10 floor sits ~10x below that, so these tests exist to catch
 * the day someone tightens it enough to start excluding real content. */

test("curated titles always cache, regardless of votes/popularity", () => {
  assert.equal(shouldCacheTitle({ votes: 0, popularity: 0 }, true), true);
  assert.equal(shouldCacheTitle({}, true), true);
});

test("a real catalogue title (Stree 2, 97 votes) caches even if treated as uncurated", () => {
  assert.equal(shouldCacheTitle({ votes: 97 }, false), true);
});

test("a near-zero-engagement id does not cache and would not have created an R2 write", () => {
  // The profile of the junk ids from the 3 Sep 2026 crawl (boxing match
  // records, obscure foreign titles): real TMDB entries, but no audience.
  assert.equal(shouldCacheTitle({ votes: 0, popularity: 0.6 }, false), false);
  assert.equal(shouldCacheTitle({ votes: 2, popularity: 1 }, false), false);
  assert.equal(hasRealSignal({ votes: 0, popularity: 0.6 }), false);
});

test("votes and popularity are independently sufficient (OR, not AND)", () => {
  // Votes alone.
  assert.equal(hasRealSignal({ votes: 10, popularity: 0 }), true);
  // Popularity alone - protects a brand-new release that hasn't
  // accumulated votes yet (votes lag days, popularity reacts in hours).
  assert.equal(hasRealSignal({ votes: 0, popularity: 5 }), true);
});

test("boundary values", () => {
  assert.equal(hasRealSignal({ votes: 9 }), false);
  assert.equal(hasRealSignal({ votes: 10 }), true);
  assert.equal(hasRealSignal({ popularity: 4.9 }), false);
  assert.equal(hasRealSignal({ popularity: 5 }), true);
});

test("missing fields default to zero, never throw", () => {
  assert.equal(hasRealSignal({}), false);
  assert.equal(shouldCacheTitle({}, false), false);
});

/* SEO / bot-neutrality: this module takes no request, header, or
 * User-Agent of any kind - only the title's own data and a curated flag.
 * It cannot special-case Googlebot or any other visitor, which is what
 * guarantees every visitor (bot or human) gets an identical response for
 * the same title; only whether that response gets cached can differ. This
 * test is a structural guard, not proof of production behaviour - it
 * asserts the decision is a pure function of (movie, isCurated) with no
 * hidden state, so a future edit can't quietly wire in a bot check here. */
test("caching decision is a pure function of title data only - no hidden state, no bot awareness", () => {
  const movie = { votes: 50, popularity: 2 };
  const first = shouldCacheTitle(movie, false);
  const second = shouldCacheTitle(movie, false);
  assert.equal(first, second);
  assert.equal(hasRealSignal.length, 1); // takes exactly one argument: the signal
  assert.equal(shouldCacheTitle.length, 2); // (movie, isCurated) - nothing else
});
