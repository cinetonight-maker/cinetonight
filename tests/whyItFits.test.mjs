import test from "node:test";
import assert from "node:assert/strict";
import { whyItFits, quickPickById } from "../lib/quickPicks.ts";
import { moodById } from "../lib/quickPicks.ts";

const happy = moodById("happy");
const surprise = moodById("surprise");

/* This line is the site's promise that a recommendation was reasoned about.
 * Every test here exists to stop it claiming something that did not happen. */

test("with nothing selected it says so, and does not claim a match", () => {
  const s = whyItFits({ titleRating: 8.6 });
  assert.match(s, /nothing narrowed down yet/i);
  assert.doesNotMatch(s, /matched/i);
  assert.match(s, /8\.6/);
});

test("a mood names the genres the title actually matched on", () => {
  const s = whyItFits({ mood: happy, titleGenres: ["Animation", "Comedy"], titleRating: 8.6 });
  assert.match(s, /matched on animation and comedy/i);
  assert.match(s, /happy mood/i);
  assert.match(s, /ruled out/i);
  assert.match(s, /8\.6/);
});

test("a mood NEVER claims an overlap the title does not have", () => {
  // Horror is not a Happy genre: the line must fall back, not invent a match.
  const s = whyItFits({ mood: happy, titleGenres: ["Horror"], titleRating: 6 });
  assert.doesNotMatch(s, /matched on/i);
  assert.doesNotMatch(s, /horror —/i);
  assert.match(s, /from your happy mood/i);
});

test("missing title genres degrade to describing the mood itself", () => {
  const s = whyItFits({ mood: happy });
  assert.match(s, /from your happy mood/i);
  assert.doesNotMatch(s, /matched on/i);
});

test("a quick pick states its own criteria verbatim", () => {
  const q = quickPickById("hidden-gem");
  const s = whyItFits({ quickPick: q, titleGenres: ["Drama"], titleRating: 7.9 });
  for (const c of q.criteria) assert.ok(s.includes(c), `missing criterion: ${c}`);
  assert.match(s, /this one is drama/i);
});

test("the kind is not stated twice when the quick pick already forces it", () => {
  const short = quickPickById("short"); // kind: "movie"
  const s = whyItFits({ quickPick: short, kind: "movie" });
  assert.doesNotMatch(s, /films only/i);
  // ...but it IS stated when the visitor chose it independently.
  const t = whyItFits({ mood: happy, kind: "series", titleGenres: ["Comedy"] });
  assert.match(t, /series only/i);
});

test("a runtime the visitor set is stated; one the quick pick owns is not repeated", () => {
  const s = whyItFits({ mood: happy, maxRuntime: 90, titleGenres: ["Comedy"] });
  assert.match(s, /under 90 minutes/i);
  const short = quickPickById("short"); // already claims "a film under 90 minutes"
  const t = whyItFits({ quickPick: short, maxRuntime: 90 });
  assert.equal((t.match(/90 minutes/g) ?? []).length, 1, "must not say 90 minutes twice");
});

test("a genreless mood (Surprise Me) is not described as a genre search", () => {
  const s = whyItFits({ mood: surprise, minRating: 8, titleGenres: ["Action"] });
  assert.doesNotMatch(s, /surprise me mood/i);
  assert.match(s, /rated 8 or higher/i);
});

test("no score is invented when the title has none", () => {
  const s = whyItFits({ mood: happy, titleGenres: ["Comedy"], titleRating: 0 });
  assert.doesNotMatch(s, /scores/i);
});
