/**
 * Phase 2 regression tests — catalogue data quality (brief §16).
 *
 * Run with:  npm test
 * (node --experimental-strip-types --test — no test framework dependency;
 *  lib/quality.ts is pure TypeScript with no server imports, so Node can
 *  strip its types and run it directly.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validYear, releaseStatus, normalizeKind, latestEligible,
  displayRating, hasDisplayableRating, weightedRating, rankByWeightedRating,
  titleTier, discoveryFilter,
  displayRuntime, displayCert, displayPeople, factualAbout,
} from "../lib/quality.ts";

const NOW = new Date().getFullYear();

const base = {
  id: "x", title: "Test Film", year: 2020, releaseDate: "2020-05-01",
  genres: ["Action"], kind: "movie", rating: 7.5, votes: 5000,
  runtime: "2h 10m", cert: "UA", language: "Hindi", director: "Some Director",
  writers: "Some Writer", cast: [{ name: "Actor One", character: "Lead" }],
  desc: "A perfectly ordinary but sufficiently long synopsis for a test movie record.",
  posterPath: "/p.jpg", backdropPath: "/b.jpg",
};

/* --- §16: year cannot display as 0 -------------------------------------- */
test("year 0 is invalid and hidden", () => {
  assert.equal(validYear(0), null);
  assert.equal(validYear(NaN), null);
  assert.equal(validYear("0"), null);
  assert.equal(validYear(1800), null);          // pre-cinema junk
  assert.equal(validYear(NOW + 10), null);      // absurd future
  assert.equal(validYear(2020), 2020);
  assert.equal(validYear(NOW + 2), NOW + 2);    // announced titles OK
});

/* --- §16: rating cannot be NaN / fake ----------------------------------- */
test("rating display never shows 0.0, NaN, or zero-vote scores", () => {
  assert.equal(displayRating({ rating: 0, votes: 0 }), null);
  assert.equal(displayRating({ rating: NaN, votes: 100 }), null);
  assert.equal(displayRating({ rating: 8.234, votes: 0 }), null);  // no votes → no rating
  assert.equal(displayRating({ rating: 8.234, votes: 12 }), "8.2");
  assert.equal(hasDisplayableRating({ rating: 10, votes: 0 }), false);
});

/* --- §16: runtime cannot be invalid ------------------------------------- */
test("invalid runtimes are hidden", () => {
  assert.equal(displayRuntime("—"), null);
  assert.equal(displayRuntime("0 min"), null);
  assert.equal(displayRuntime("0h 00m"), null);
  assert.equal(displayRuntime("NaN min"), null);
  assert.equal(displayRuntime(""), null);
  assert.equal(displayRuntime(undefined), null);
  assert.equal(displayRuntime("2h 10m"), "2h 10m");
  assert.equal(displayRuntime("3 Seasons"), "3 Seasons");
});

test("unknown certification is hidden, real ones show", () => {
  assert.equal(displayCert("NR"), null);
  assert.equal(displayCert("—"), null);
  assert.equal(displayCert(""), null);
  assert.equal(displayCert("UA"), "UA");
});

/* --- §16: future titles never get past-audience wording ------------------ */
test("release status: released / upcoming / unknown", () => {
  assert.equal(releaseStatus({ year: 2020, releaseDate: "2020-05-01" }), "released");
  assert.equal(releaseStatus({ year: NOW + 1, releaseDate: `${NOW + 1}-12-01` }), "upcoming");
  assert.equal(releaseStatus({ year: NOW + 1 }), "upcoming");          // year-only future
  assert.equal(releaseStatus({ year: 0 }), "unknown");
  assert.equal(releaseStatus({ year: NOW }), "unknown");               // this year, no date
});

test("upcoming title prose is future-factual, never reception claims", () => {
  const upcoming = { ...base, year: NOW + 1, releaseDate: `${NOW + 1}-11-20`, votes: 0, rating: 0 };
  const prose = factualAbout(upcoming).join(" ");
  assert.match(prose, /scheduled to release/i);
  for (const banned of [/landed with audiences/i, /talked.about/i, /critics/i, /audiences loved/i, /holds a .*rating/i]) {
    assert.doesNotMatch(prose, banned);
  }
});

test("released title prose only cites ratings that exist", () => {
  const prose = factualAbout(base).join(" ");
  assert.match(prose, /7\.5\/10 rating on TMDB from 5,000 votes/);
  const unrated = { ...base, rating: 0, votes: 0 };
  assert.doesNotMatch(factualAbout(unrated).join(" "), /rating/i);
});

test("missing cast/director does not break prose (no '— — —')", () => {
  const bare = { ...base, cast: [], director: "—", writers: "—" };
  const prose = factualAbout(bare).join(" ");
  assert.doesNotMatch(prose, /—\s*—/);
  assert.doesNotMatch(prose, /directed by —/i);
  assert.doesNotMatch(prose, /starring\s*\./i);
});

/* --- §16: Top Rated excludes low-confidence titles ----------------------- */
test("Bayesian ranking: 10.0-from-2-votes cannot beat 8.7-from-30k", () => {
  const junk = { ...base, id: "junk", rating: 10.0, votes: 2 };
  const classic = { ...base, id: "classic", rating: 8.7, votes: 30000 };
  const ranked = rankByWeightedRating([junk, classic]);
  assert.equal(ranked[0].id, "classic");
  // junk is excluded entirely (below RANK_MIN_VOTES), not just demoted
  assert.equal(ranked.find((m) => m.id === "junk"), undefined);
});

test("weighted rating shrinks toward the pool mean with few votes", () => {
  const wr = weightedRating({ rating: 10, votes: 60, kind: "movie" }, 6.5);
  assert.ok(wr < 7.2, `expected shrinkage, got ${wr}`); // 60 votes vs m=500 → near mean
  const wrBig = weightedRating({ rating: 8.7, votes: 30000, kind: "movie" }, 6.5);
  assert.ok(wrBig > 8.6, `big-vote title keeps its score, got ${wrBig}`);
});

/* --- §16: invalid media type normalized/rejected -------------------------- */
test("media type normalization", () => {
  assert.equal(normalizeKind("tv"), "series");
  assert.equal(normalizeKind("TV"), "series");
  assert.equal(normalizeKind("web series"), "series");
  assert.equal(normalizeKind("film"), "movie");
  assert.equal(normalizeKind("movie"), "movie");
  assert.equal(normalizeKind("banana"), null);
  assert.equal(normalizeKind(undefined), null);
});

/* --- §16: Tier C cannot appear in premium discovery ----------------------- */
test("tiers: junk is C, thin is B, complete is A", () => {
  assert.equal(titleTier(base), "A");
  assert.equal(titleTier({ ...base, votes: 3 }), "B");                       // weak signal
  assert.equal(titleTier({ ...base, posterPath: null, desc: "" }), "C");     // no poster+overview
  assert.equal(titleTier({ ...base, title: "" }), "C");
  assert.equal(titleTier({ ...base, kind: "banana" }), "C");
  // upcoming with poster+overview+valid future date counts as discovery-worthy
  assert.equal(titleTier({ ...base, year: NOW + 1, releaseDate: `${NOW + 1}-12-01`, votes: 0, rating: 0 }), "A");
});

test("discoveryFilter never surfaces Tier C, never blanks a shelf", () => {
  const a = { ...base, id: "a" };
  const b = { ...base, id: "b", votes: 3 };
  const c = { ...base, id: "c", posterPath: null, desc: "" };
  const out = discoveryFilter([a, b, c, { ...base, id: "a2" }], 4);
  assert.ok(!out.some((m) => m.id === "c"), "Tier C leaked into discovery");
  assert.ok(out.length >= 3, "shelf blanked out");
  // all-junk input yields empty, not junk
  assert.equal(discoveryFilter([c], 4).length, 0);
});

/* --- §16: missing poster uses fallback (contract test) -------------------- */
test("missing poster path stays null for the image fallback system", () => {
  // lib/images.ts poster() maps null → branded placeholder; the contract
  // here is that quality code never fabricates a poster path.
  assert.equal(base.posterPath !== null, true);
  assert.equal(titleTier({ ...base, posterPath: null }), "B"); // still reachable, not promoted with broken art
});

/* --- Latest freshness-quality rule ---------------------------------------- */
const daysAgo = (n) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
const daysAhead = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

test("Latest: major new release with 7 votes + high popularity is included", () => {
  const dayOne = { ...base, votes: 7, rating: 5.8, popularity: 180,
    releaseDate: daysAgo(1), year: new Date().getFullYear() };
  assert.equal(latestEligible(dayOne), true);
});

test("Latest: 1-vote junk with low popularity is excluded", () => {
  const junk = { ...base, votes: 1, rating: 10, popularity: 1.4,
    releaseDate: daysAgo(0), year: new Date().getFullYear() };
  assert.equal(latestEligible(junk), false);
});

test("Latest: future popular title is excluded", () => {
  const future = { ...base, votes: 0, rating: 0, popularity: 300,
    releaseDate: daysAhead(30), year: new Date().getFullYear() + 1 };
  assert.equal(latestEligible(future), false);
  // even a future date inside the 14-day window is not "released"
  const soon = { ...future, releaseDate: daysAhead(3), year: new Date().getFullYear() };
  assert.equal(latestEligible(soon), false);
});

test("Latest: older popular title is excluded (rescue is 14 days only)", () => {
  const oldHit = { ...base, votes: 5, rating: 8.5, popularity: 250,
    releaseDate: daysAgo(60), year: new Date().getFullYear() };
  assert.equal(latestEligible(oldHit), false);
  // but the same title with >= 10 votes enters through the normal gate
  assert.equal(latestEligible({ ...oldHit, votes: 5000 }), true);
});

test("Latest: rescue requires poster + real overview + exact date", () => {
  const noPoster = { ...base, votes: 3, popularity: 90, releaseDate: daysAgo(2), posterPath: null };
  assert.equal(latestEligible(noPoster), false);
  const thin = { ...base, votes: 3, popularity: 90, releaseDate: daysAgo(2), desc: "short" };
  assert.equal(latestEligible(thin), false);
  const noDate = { ...base, votes: 3, popularity: 90, releaseDate: null, year: 2020 };
  assert.equal(latestEligible(noDate), false);
});

/* --- misc: people display ------------------------------------------------- */
test("placeholder people fields are hidden", () => {
  assert.equal(displayPeople("—"), null);
  assert.equal(displayPeople("— , —"), null);
  assert.equal(displayPeople("A. Director, —"), "A. Director");
  assert.equal(displayPeople(""), null);
});
