/**
 * Phase 3 regression tests — industry classification + mixed discovery.
 * Run with: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { industryOf, mixDiscovery } from "../lib/industry.ts";
import { MOODS, ALL_MOODS, SURPRISE } from "../lib/moods.ts";
import { QUICK_PICKS } from "../lib/quickPicks.ts";

const t = (id, language, extra = {}) => ({
  id, title: "T " + id, year: 2024, releaseDate: "2024-05-01", genres: ["Drama"],
  kind: "movie", rating: 7.5, votes: 5000, runtime: "2h", cert: "UA",
  language, director: "D", writers: "W", cast: [],
  desc: "A sufficiently long synopsis for quality-tier tests to pass cleanly.",
  posterPath: "/p.jpg", backdropPath: null, ...extra,
});

test("industry classification: language precedence", () => {
  assert.equal(industryOf({ language: "HI" }), "bollywood");
  assert.equal(industryOf({ language: "Hindi" }), "bollywood");
  assert.equal(industryOf({ language: "TE" }), "south");
  assert.equal(industryOf({ language: "Tamil" }), "south");
  assert.equal(industryOf({ language: "KO" }), "korean");
  assert.equal(industryOf({ language: "ja" }), "international");
  assert.equal(industryOf({ language: "" }), "international");
});

test("industry classification: origin-country precedence for English", () => {
  // English + known US origin -> Hollywood
  assert.equal(industryOf({ language: "EN", originCountry: "US" }), "hollywood");
  // English + known non-US origin -> International
  assert.equal(industryOf({ language: "EN", originCountry: "GB" }), "international");
  assert.equal(industryOf({ language: "EN", originCountry: "AU" }), "international");
  assert.equal(industryOf({ language: "en", originCountry: "IN" }), "international");
  // English with NO usable country info -> documented fallback: hollywood
  assert.equal(industryOf({ language: "EN" }), "hollywood");
  assert.equal(industryOf({ language: "EN", originCountry: null }), "hollywood");
  assert.equal(industryOf({ language: "EN", originCountry: "" }), "hollywood");
});

test("industry classification: definitive languages beat country data", () => {
  // Hindi can NEVER become Hollywood, even with US country metadata
  assert.equal(industryOf({ language: "HI", originCountry: "US" }), "bollywood");
  // Korean remains Korean regardless of country
  assert.equal(industryOf({ language: "KO", originCountry: "US" }), "korean");
  assert.equal(industryOf({ language: "TA", originCountry: "GB" }), "south");
});

const richPools = () => ({
  hollywood: Array.from({ length: 10 }, (_, i) => t("h" + i, "EN")),
  bollywood: Array.from({ length: 10 }, (_, i) => t("b" + i, "HI")),
  south: Array.from({ length: 10 }, (_, i) => t("s" + i, "TE")),
  korean: Array.from({ length: 10 }, (_, i) => t("k" + i, "KO")),
  international: Array.from({ length: 10 }, (_, i) => t("i" + i, "JA")),
});

test("mixDiscovery ~45/25/20/10 with BOTH Korean and International present", () => {
  const out = mixDiscovery(richPools(), 10);
  assert.equal(out.length, 10);
  const count = (p) => out.filter((m) => m.id.startsWith(p)).length;
  assert.ok(count("h") >= 3 && count("h") <= 5, `hollywood ~45%, got ${count("h")}`);
  assert.ok(count("b") >= 2 && count("b") <= 3, `bollywood ~25%, got ${count("b")}`);
  assert.ok(count("s") >= 1 && count("s") <= 3, `south ~20%, got ${count("s")}`);
  // The correction-audit requirement: the final 10% must GENUINELY contain
  // both — never zero (the old Math.round+slice bug zeroed both).
  assert.ok(count("k") >= 1, "korean must be present");
  assert.ok(count("i") >= 1, "international must be present");
});

test("mixDiscovery prefixes keep the mix (display slices cannot cut the tail)", () => {
  // The homepage builds 10 and the grid displays 8: both small categories
  // must survive INSIDE the first 8 thanks to proportional interleaving.
  const first8 = mixDiscovery(richPools(), 10).slice(0, 8);
  assert.ok(first8.some((m) => m.id.startsWith("k")), "korean must appear within the displayed 8");
  assert.ok(first8.some((m) => m.id.startsWith("i")), "international must appear within the displayed 8");
});

test("mixDiscovery: weak categories are filled by stronger content, not junk", () => {
  const junk = t("junk", "HI", { posterPath: null, desc: "" }); // Tier C
  const pools = {
    hollywood: Array.from({ length: 10 }, (_, i) => t("h" + i, "EN")),
    bollywood: [junk], // category effectively empty after quality
    south: [],
    korean: [],
    international: [],
  };
  const out = mixDiscovery(pools, 8);
  assert.equal(out.length, 8);
  assert.ok(!out.some((m) => m.id === "junk"), "Tier C entered the mix");
  assert.ok(out.every((m) => m.id.startsWith("h")), "shortfall filled by strong pool");
});

test("mixDiscovery dedupes across pools and is deterministic", () => {
  const dup = t("same", "EN");
  const pools = { hollywood: [dup], international: [dup], bollywood: [], south: [], korean: [] };
  const out = mixDiscovery(pools, 5);
  assert.equal(out.filter((m) => m.id === "same").length, 1);
  assert.deepEqual(mixDiscovery(pools, 5), out); // no randomness
});

test("moods are locked to the Phase 3 eight; surprise stays internal", () => {
  assert.deepEqual(MOODS.map((m) => m.id),
    ["happy", "romantic", "relaxed", "stressed", "excited", "need-a-laugh", "dark", "thoughtful"]);
  assert.equal(SURPRISE.id, "surprise");
  assert.equal(ALL_MOODS.length, 9);
  assert.ok(!MOODS.some((m) => m.id === "surprise"), "surprise must not render in the grid");
});

test("quick picks are locked to the Phase 3 six and reference valid moods", () => {
  assert.deepEqual(QUICK_PICKS.map((q) => q.id),
    ["date-night", "short", "feelgood", "family", "hidden-gem", "highly-rated"]);
  const validMoods = new Set(ALL_MOODS.map((m) => m.id));
  for (const q of QUICK_PICKS) assert.ok(validMoods.has(q.moodId), `quick pick ${q.id} references unknown mood ${q.moodId}`);
});
