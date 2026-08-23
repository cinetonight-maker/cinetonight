import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  guardPath, isPlausibleSlug, isPlausibleMovieId,
  MAX_SEGMENT_LENGTH, MAX_TMDB_ID,
} from "../lib/pathGuard.ts";

const blocked = (p) => guardPath(p) !== undefined;

/* ============================================================================
 * The asymmetry this file is built around: rejecting something VALID takes a
 * real page off the site; letting something invalid through costs one cache
 * object. So every test below leans on "does it ever block real content".
 * ========================================================================= */

test("real URLs are never blocked", () => {
  for (const p of [
    "/movie/jawan", "/movie/stree-2", "/movie/3-idiots",
    "/movie/tmdb-m-693134", "/movie/tmdb-m-693134-dune-part-two", "/movie/tmdb-t-1399",
    "/movie/tmdb-m-1", "/movie/tmdb-m-19999999",
    "/blog/cant-decide-what-to-watch-tonight", "/blog/dune-3-release-date-cast-plot-trailer",
    "/free-movies/awaara-1951", "/free-movies/shree-420",
  ]) {
    assert.equal(blocked(p), false, `${p} must not be blocked`);
  }
});

test("a slug the guard has never heard of still passes — it cannot see the database", () => {
  // New posts and new catalogue titles arrive from the dashboard. Shape is the
  // only thing middleware may judge.
  for (const p of ["/movie/a-title-added-tomorrow", "/blog/a-post-written-next-week",
                   "/free-movies/some-new-classic"]) {
    assert.equal(blocked(p), false, p);
  }
});

test("no other route family is touched", () => {
  for (const p of ["/", "/blog", "/movies", "/person/tmdb-p-1", "/channel/netflix",
                   "/contact-us", "/discover", "/free-movies", "/admin/blog",
                   "/api/search", "/movie/a/b"]) {
    assert.equal(blocked(p), false, `${p} is outside the guard's scope`);
  }
});

/* ---- what it does block ------------------------------------------------- */

test("an invented TMDB id above the plausible ceiling is blocked", () => {
  assert.ok(blocked("/movie/tmdb-m-999999999"));
  assert.ok(blocked(`/movie/tmdb-m-${MAX_TMDB_ID + 1}`));
  assert.equal(blocked(`/movie/tmdb-m-${MAX_TMDB_ID}`), false, "the ceiling itself must pass");
});

test("a malformed TMDB id is blocked", () => {
  for (const id of ["tmdb-m-abc", "tmdb-x-123", "tmdb-m-", "tmdb-", "tmdb-m-0", "tmdb-mm-1"]) {
    assert.ok(blocked(`/movie/${id}`), id);
  }
});

test("segments that are not slug-shaped are blocked on all three routes", () => {
  const junk = ["Some_Thing", "UPPER", "has.dot", "has%20space", "wp-admin.php",
                "..%2fetc%2fpasswd", "-leading-hyphen"];
  for (const base of ["/movie/", "/blog/", "/free-movies/"]) {
    for (const j of junk) assert.ok(blocked(base + j), base + j);
  }
});

test("an over-long segment is blocked", () => {
  const long = "a".repeat(MAX_SEGMENT_LENGTH + 1);
  for (const base of ["/movie/", "/blog/", "/free-movies/"]) assert.ok(blocked(base + long));
  assert.equal(blocked("/blog/" + "a".repeat(MAX_SEGMENT_LENGTH)), false, "the limit itself must pass");
});

test("a segment that will not URL-decode is blocked rather than throwing", () => {
  assert.doesNotThrow(() => guardPath("/blog/%E0%A4%A"));
  assert.ok(blocked("/blog/%E0%A4%A"));
});

test("the verdict says which check failed, for the response header", () => {
  assert.match(guardPath("/movie/tmdb-m-999999999"), /out of range/);
  assert.match(guardPath("/blog/UPPER"), /blog slug/);
  assert.match(guardPath("/free-movies/x".padEnd(200, "y")), /too long/);
});

/* ---- the containment claim --------------------------------------------- */

test("blog and free-movies detail routes are force-dynamic, so nothing persists per URL", () => {
  // The guard cannot know which well-formed slugs are real. force-dynamic is
  // what closes that remainder — without it an invented but plausible slug
  // still writes a permanent R2 object.
  for (const dir of ["app/blog/[slug]", "app/free-movies/[slug]"]) {
    const src = readFileSync(new URL(`../${dir}/page.tsx`, import.meta.url), "utf8");
    assert.match(src, /export const dynamic = "force-dynamic"/, `${dir} must not use ISR`);
    assert.doesNotMatch(src, /export const revalidate/, `${dir} must not re-enable ISR`);
    assert.equal(existsSync(new URL(`../${dir}/loading.tsx`, import.meta.url)), false);
  }
});

test("the guard runs in middleware, before anything can render", () => {
  // Validating inside the page is too late: the object exists by then.
  const mw = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  assert.match(mw, /guardPath\(pathname\)/);
  assert.match(mw, /status: 404/);
  assert.match(mw, /no-store/, "a guarded 404 must not be cached anywhere");
  assert.doesNotMatch(mw, /await guardPath/, "the guard must stay synchronous");
  // ...and must run BEFORE the Supabase client is built, so a guarded request
  // never pays for session refresh or the admin allowlist lookup either.
  assert.ok(
    mw.indexOf("guardPath(pathname)") < mw.indexOf("createServerClient("),
    "the guard must run before any Supabase work",
  );
});

test("the guard module has no imports at all", () => {
  // No database, no network, nothing that can throw — it runs on every request
  // to these routes.
  const src = readFileSync(new URL("../lib/pathGuard.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /^\s*import\s/m);
});
