import test from "node:test";
import assert from "node:assert/strict";
import {
  BROWSE_GENRES, isBrowseGenre, canonicalGenre, canonicalBrowsePath, isCanonicalGenreValue,
} from "../lib/genres.ts";
import { genreListingMeta } from "../lib/genres.ts";
import { readFileSync, readdirSync } from "node:fs";

/* ============================================================================
 * The hole this closes: /movies?genre=<anything> returned 200 with a UNIQUE
 * self-canonical and a unique <title>, while rendering the plain unfiltered
 * hub. Five browse hubs times an unlimited set of values = an unbounded space
 * of indexable duplicate pages.
 * ========================================================================= */

test("the canonical genre list is non-empty and has no duplicates", () => {
  assert.ok(BROWSE_GENRES.length > 0);
  assert.equal(new Set(BROWSE_GENRES).size, BROWSE_GENRES.length);
});

test("every canonical genre is its own canonical form (no self-redirect loops)", () => {
  for (const g of BROWSE_GENRES) {
    assert.equal(canonicalGenre(g), g, `${g} must map to itself`);
    assert.ok(isCanonicalGenreValue(g), `${g} must not trigger a redirect`);
    assert.ok(isBrowseGenre(g));
  }
});

test("an unknown genre resolves to no genre at all", () => {
  for (const junk of ["made-up", "Action; DROP TABLE", "<script>", "acton", "ACTION", "  ", "%%%", "1"]) {
    assert.equal(canonicalGenre(junk), undefined, `${junk} must not be a genre`);
    assert.equal(isCanonicalGenreValue(junk), false, `${junk} must be redirected`);
  }
});

test("an unknown genre redirects to the bare hub, not to a genre page", () => {
  assert.equal(canonicalBrowsePath("/movies", "made-up"), "/movies");
  assert.equal(canonicalBrowsePath("/trending", "'; DROP TABLE --"), "/trending");
  // ...and to THAT hub's bare URL, never a hard-coded one.
  for (const path of ["/movies", "/tv-shows", "/web-series", "/trending", "/latest"]) {
    assert.equal(canonicalBrowsePath(path, "nonsense"), path);
  }
});

test("TMDB's TV-side genre names fold onto the one URL that owns the genre", () => {
  // These were the real bug: the sitemap was emitting
  // /movies?genre=Action%20%26%20Adventure, which does NOT filter a movie
  // query, so it rendered the unfiltered hub under its own canonical.
  assert.equal(canonicalGenre("Action & Adventure"), "Action");
  assert.equal(canonicalGenre("Sci-Fi & Fantasy"), "Sci-Fi");
  assert.equal(canonicalGenre("War & Politics"), "War");
  assert.equal(canonicalGenre("Science Fiction"), "Sci-Fi");
  assert.equal(canonicalBrowsePath("/movies", "Action & Adventure"), "/movies?genre=Action");
  // An aliased name is NOT canonical, so it must redirect rather than render.
  assert.equal(isCanonicalGenreValue("Action & Adventure"), false);
});

test("absent, empty and \"All\" mean the bare hub and never redirect", () => {
  for (const v of [undefined, null, "", "All"]) {
    assert.equal(canonicalGenre(v), undefined);
    assert.ok(isCanonicalGenreValue(v), `${JSON.stringify(v)} must render as the bare hub`);
    assert.equal(canonicalBrowsePath("/movies", v), "/movies");
  }
});

test("a redirect target is always itself canonical — one hop, never a chain", () => {
  const inputs = ["made-up", "Action & Adventure", "Sci-Fi & Fantasy", "Science Fiction", "", "All", "Action"];
  for (const input of inputs) {
    const target = canonicalBrowsePath("/movies", input);
    const value = target.includes("?genre=")
      ? decodeURIComponent(target.split("?genre=")[1])
      : undefined;
    assert.ok(isCanonicalGenreValue(value), `${input} -> ${target} must not redirect again`);
  }
});

/* ---- metadata cannot describe a page that does not exist ---------------- */

test("genreListingMeta never mints a unique canonical for an unknown genre", () => {
  const base = { path: "/movies", baseTitle: "Movies", baseDescription: "Browse films." };
  const junk = genreListingMeta({ ...base, genre: "made-up-genre" });
  const bare = genreListingMeta(base);
  assert.equal(junk.alternates.canonical, "/movies");
  assert.equal(junk.title, bare.title, "an unknown genre must not produce a unique title");
  assert.equal(junk.description, bare.description);
});

test("genreListingMeta canonicalises an aliased genre instead of echoing the URL", () => {
  const meta = genreListingMeta({
    path: "/movies", baseTitle: "Movies", baseDescription: "Browse films.", genre: "Action & Adventure",
  });
  assert.equal(meta.alternates.canonical, "/movies?genre=Action");
  assert.match(meta.title, /^Action Movies/);
});

test("genreListingMeta still gives each real genre its own page", () => {
  const seen = new Set();
  for (const g of BROWSE_GENRES) {
    const meta = genreListingMeta({ path: "/movies", baseTitle: "Movies", baseDescription: "x", genre: g });
    assert.equal(meta.alternates.canonical, `/movies?genre=${encodeURIComponent(g)}`);
    assert.ok(!seen.has(meta.title), `${g} must have a distinct title`);
    seen.add(meta.title);
  }
});

/* ---- the redirect must know about every hub that accepts ?genre= -------- */

test("middleware's hub list covers every page that renders ListingPage", () => {
  // The 308 lives in middleware.ts because an in-render redirect returns HTTP
  // 200 on this stack (measured — see docs/SEO-PHASE-4A.md). That means a new
  // browse hub added later would silently reopen the duplicate-URL hole: the
  // page would accept ?genre=anything again with nothing to redirect it.
  // This fails the build the moment the two lists drift.
  const mw = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  const hubs = new Set(
    (mw.match(/const GENRE_HUBS[\s\S]*?\]\)/)?.[0].match(/"\/[a-z-]+"/g) ?? []).map((s) => s.slice(1, -1)),
  );
  assert.ok(hubs.size > 0, "GENRE_HUBS must be parseable");

  const appDir = new URL("../app/", import.meta.url);
  const usingListingPage = readdirSync(appDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => {
      try {
        return readFileSync(new URL(`${d.name}/page.tsx`, appDir), "utf8").includes("<ListingPage");
      } catch { return false; }
    })
    .map((d) => `/${d.name}`);

  assert.ok(usingListingPage.length > 0, "expected to find browse hubs");
  for (const hub of usingListingPage) {
    assert.ok(hubs.has(hub), `${hub} renders ListingPage but middleware will not redirect its ?genre=`);
  }
  for (const hub of hubs) {
    assert.ok(usingListingPage.includes(hub), `middleware lists ${hub}, which is no longer a browse hub`);
  }
});
