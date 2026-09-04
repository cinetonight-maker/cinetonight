import test from "node:test";
import assert from "node:assert/strict";
import { tonightFit, moodMatches, fitMinutes } from "../lib/tonightFit.ts";

const m = (over = {}) => ({
  id: "t1", title: "T", year: 2022, releaseDate: "2022-05-01", genres: ["Comedy"],
  kind: "movie", rating: 7.6, votes: 5000, runtime: "1h 40m", cert: "UA",
  language: "English", director: "D", writers: "W", cast: [],
  desc: "A long enough synopsis to clear the quality-tier checks used elsewhere.",
  posterPath: "/p.jpg", backdropPath: null, ...over,
});

const all = (f) => [...f.fits, ...f.notFor].map((l) => l.text).join(" | ");

/* The whole value of this block is that a reader can trust every line. These
 * tests exist to stop it ever asserting something we cannot back. */

test("runtime is parsed, and an unknown runtime produces no time claim", () => {
  assert.equal(fitMinutes("2h 14m"), 134);
  assert.equal(fitMinutes("48m"), 48);
  assert.equal(fitMinutes(""), null);
  assert.equal(fitMinutes("-"), null);      // the TMDB list placeholder
  assert.equal(fitMinutes(undefined), null);
  const f = tonightFit(m({ runtime: "" }));
  assert.doesNotMatch(all(f), /runs|minutes|evening/i);
});

test("a short film is offered for a short evening, not warned about", () => {
  const f = tonightFit(m({ runtime: "1h 22m" }));
  assert.match(all(f), /under 90 minutes/i);
  assert.doesNotMatch(f.notFor.map((l) => l.text).join(" "), /only have 90 minutes/i);
});

test("a long film warns the person who is short of time", () => {
  const f = tonightFit(m({ runtime: "2h 45m" }));
  assert.match(f.notFor.map((l) => l.text).join(" "), /want something short/i);
});

test("mood matching follows the picker's own rules, both ways", () => {
  // Happy = comedy/family/music/adventure/animation, never horror/crime/war/thriller
  assert.ok(moodMatches({ genres: ["Comedy"] }, "happy"));
  assert.ok(!moodMatches({ genres: ["Comedy", "Horror"] }, "happy"), "an excluded genre disqualifies");
  assert.ok(!moodMatches({ genres: ["Documentary"] }, "happy"));
  assert.ok(!moodMatches({ genres: [] }, "happy"), "no genres cannot match");
});

test("a matched mood is named with the genres that actually matched", () => {
  const f = tonightFit(m({ genres: ["Comedy", "Family"] }));
  assert.match(all(f), /happy mood/i);
  assert.match(all(f), /comedy/i);
});

test("a horror title is never offered as a happy pick", () => {
  const f = tonightFit(m({ genres: ["Horror"] }));
  assert.doesNotMatch(f.fits.map((l) => l.text).join(" "), /happy mood/i);
});

test("ratings are stated as numbers, never as praise", () => {
  const f = tonightFit(m({ rating: 8.4, votes: 4200 }));
  assert.match(all(f), /8\.4\/10 on TMDB from 4,200 votes/);
  assert.doesNotMatch(all(f), /brilliant|masterpiece|amazing|must[- ]watch|great film/i);
});

test("a title with too few votes makes no claim about its reception", () => {
  const f = tonightFit(m({ rating: 9.5, votes: 3 }));
  assert.doesNotMatch(all(f), /well reviewed|safe pick|votes/i);
});

test("the hidden-gem line requires BOTH a high rating and few votes", () => {
  assert.match(all(tonightFit(m({ rating: 7.9, votes: 400 }))), /less talked about/i);
  assert.doesNotMatch(all(tonightFit(m({ rating: 7.9, votes: 90000 }))), /less talked about/i);
  assert.doesNotMatch(all(tonightFit(m({ rating: 6.2, votes: 400 }))), /less talked about/i);
});

test("format mismatch is always offered, in the right direction", () => {
  assert.match(tonightFit(m({ kind: "movie" })).notFor.map((l) => l.text).join(" "), /want a series/i);
  assert.match(tonightFit(m({ kind: "series" })).notFor.map((l) => l.text).join(" "), /want a film/i);
});

test("a series makes no cinema-runtime claim", () => {
  const f = tonightFit(m({ kind: "series", runtime: "3 Seasons" }));
  assert.doesNotMatch(all(f), /under 90 minutes|about two hours/i);
});

test("a title we know almost nothing about still produces no false lines", () => {
  const bare = tonightFit(m({ genres: [], runtime: "", rating: 0, votes: 0 }));
  assert.equal(bare.fits.length, 0, "nothing known means nothing claimed");
  assert.equal(bare.notFor.length, 1, "only the film/series fact remains");
});

test("it is deterministic", () => {
  const a = tonightFit(m()); const b = tonightFit(m());
  assert.deepEqual(a, b);
});
