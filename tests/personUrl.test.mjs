import test from "node:test";
import assert from "node:assert/strict";
import { personSlug, canonicalPersonId, personRedirectTarget, parsePersonTmdbId } from "../lib/personUrl.ts";
import { readFileSync } from "node:fs";

/* ============================================================================
 * ONE URL PER PERSON.
 *
 * Person pages were 46% of the indexed sample with no canonical, no redirect,
 * an unlimited slug tail, and a second name-form address for anyone in the
 * curated catalogue. These tests pin the rule that collapses all of it.
 * ========================================================================= */

/* The slug rule used to exist three times — here, `seoSlug` in lib/tmdb.ts
 * (which BUILDS every cast link) and `personId` in lib/data.ts (which RESOLVES
 * them). They had already drifted: personId was missing the 60-character cap.
 * With a redirect on the route, any such disagreement becomes an infinite
 * bounce between two spellings of the same URL.
 *
 * The fix was structural, not a test: both call sites now import from
 * lib/personUrl.ts. This asserts they still do, because re-introducing a local
 * copy is the one change that would silently bring the loop back. */
test("no module keeps its own private copy of the person slug rule", () => {
  const tmdb = readFileSync(new URL("../lib/tmdb.ts", import.meta.url), "utf8");
  const data = readFileSync(new URL("../lib/data.ts", import.meta.url), "utf8");
  assert.match(tmdb, /from "\.\/personUrl"/, "lib/tmdb.ts must import the shared rule");
  assert.match(data, /from "\.\/personUrl"/, "lib/data.ts must import the shared rule");
  assert.doesNotMatch(
    data, /export const personId = \(name/,
    "lib/data.ts must not redefine personId — it drifted once already",
  );
});

test("the slug rule caps length, so a long name cannot build an unresolvable link", () => {
  const long = "A".repeat(120);
  assert.equal(personSlug(long).length, 60);
  // and it is stable: slugging an already-slugged name changes nothing.
  assert.equal(personSlug(personSlug(long)), personSlug(long));
});

test("a TMDB id always wins over the name form", () => {
  assert.equal(canonicalPersonId({ tmdbId: 35742, name: "Shah Rukh Khan" }), "tmdb-p-35742-shah-rukh-khan");
  assert.equal(canonicalPersonId({ tmdbId: "35742", name: "Shah Rukh Khan" }), "tmdb-p-35742-shah-rukh-khan");
});

test("no TMDB id falls back to the name form", () => {
  assert.equal(canonicalPersonId({ tmdbId: null, name: "Shah Rukh Khan" }), "shah-rukh-khan");
  assert.equal(canonicalPersonId({ name: "Shah Rukh Khan" }), "shah-rukh-khan");
  assert.equal(canonicalPersonId({ tmdbId: undefined, name: "Shah Rukh Khan" }), "shah-rukh-khan");
});

test("every non-canonical spelling of one person collapses to the same URL", () => {
  const person = { tmdbId: 35742, name: "Shah Rukh Khan" };
  const canonical = "/person/tmdb-p-35742-shah-rukh-khan";
  const variants = [
    "tmdb-p-35742",                       // bare id
    "tmdb-p-35742-anything-at-all",       // invented slug — the unlimited space
    "tmdb-p-35742-shah-rukh",             // truncated slug
    "shah-rukh-khan",                     // the name form the sitemap used to submit
  ];
  for (const v of variants) {
    assert.equal(personRedirectTarget(v, person), canonical, v);
  }
});

test("the canonical URL itself does not redirect", () => {
  assert.equal(personRedirectTarget("tmdb-p-35742-shah-rukh-khan", { tmdbId: 35742, name: "Shah Rukh Khan" }), null);
  assert.equal(personRedirectTarget("shah-rukh-khan", { name: "Shah Rukh Khan" }), null);
});

test("a redirect target is always itself canonical — one hop, never a chain", () => {
  const people = [
    { tmdbId: 35742, name: "Shah Rukh Khan" },
    { tmdbId: null, name: "Someone Local" },
    { tmdbId: 1, name: "A" },
  ];
  for (const person of people) {
    for (const requested of ["tmdb-p-35742", "junk", "a", "", "tmdb-p-1-a"]) {
      const target = personRedirectTarget(requested, person);
      if (!target) continue;
      const nextId = target.replace("/person/", "");
      assert.equal(personRedirectTarget(nextId, person), null, `${requested} -> ${target} redirected twice`);
    }
  }
});

test("the canonical id is always parseable back to its TMDB id", () => {
  // Otherwise the redirect target would 404 — the page resolves the person by
  // re-parsing this exact string.
  for (const [id, name] of [[35742, "Shah Rukh Khan"], [7, "!!!"], [999, "Beyoncé"]]) {
    const canonical = canonicalPersonId({ tmdbId: id, name });
    assert.equal(parsePersonTmdbId(canonical), String(id), canonical);
  }
});

test("a name that slugs to nothing does not produce a trailing hyphen", () => {
  // "tmdb-p-7-" would parse fine but is a second URL that canonicalises to
  // itself forever — a duplicate created by the fix meant to remove them.
  assert.equal(canonicalPersonId({ tmdbId: 7, name: "!!!" }), "tmdb-p-7");
  assert.equal(canonicalPersonId({ tmdbId: 7, name: "" }), "tmdb-p-7");
  assert.equal(personRedirectTarget("tmdb-p-7", { tmdbId: 7, name: "!!!" }), null);
});

test("a person with no id and an unusable name is served as-is, never redirected to /person/", () => {
  // "/person/" is not a page. Serving the requested URL beats a dead end.
  assert.equal(personRedirectTarget("whatever", { name: "!!!" }), null);
  assert.equal(canonicalPersonId({ name: "!!!" }), "");
});
