import test from "node:test";
import assert from "node:assert/strict";
import {
  planFor, isEmptyPlan, inHomeGuides, isCmsTag, HOME_GUIDES, EMPTY_PLAN,
} from "../lib/revalidatePlan.ts";

const ORIGIN = "https://cinetonight.com";

const blog = (over = {}) => ({
  kind: "blog", slug: "reacher-4", wasLive: true, isLive: true, touchesHomeGuides: false, ...over,
});

/* ========================================================================== */
/* 1. AUTOSAVE INVALIDATES NOTHING — the contract that protects live content. */
/* ========================================================================== */

test("autosave / draft-only actions produce a completely empty plan", () => {
  const plan = planFor({ kind: "none" }, ORIGIN);
  assert.deepEqual(plan, EMPTY_PLAN);
  assert.equal(plan.tags.length, 0, "no cache tags");
  assert.equal(plan.paths.length, 0, "no route paths");
  assert.equal(plan.urls.length, 0, "no CDN purge URLs");
  assert.ok(isEmptyPlan(plan));
});

test("editing a draft that stays a draft invalidates nothing", () => {
  const plan = planFor(blog({ wasLive: false, isLive: false }), ORIGIN);
  assert.ok(isEmptyPlan(plan), "an invisible post cannot make a visible page stale");
});

test("trashing a draft invalidates nothing", () => {
  const plan = planFor(blog({ wasLive: false, isLive: false, touchesHomeGuides: false }), ORIGIN);
  assert.ok(isEmptyPlan(plan));
});

/* ========================================================================== */
/* 2. BLOG PUBLISH / UPDATE                                                   */
/* ========================================================================== */

test("publishing an article revalidates the article and the blog index", () => {
  const plan = planFor(blog(), ORIGIN);
  assert.deepEqual(plan.paths, ["/blog/reacher-4", "/blog"]);
  assert.deepEqual(plan.tags, ["cms:blog", "cms:blog:reacher-4"]);
});

test("the homepage is revalidated ONLY when the Guides strip is affected", () => {
  assert.ok(!planFor(blog({ touchesHomeGuides: false }), ORIGIN).paths.includes("/"),
    "an old post deep in the archive must not rebuild the homepage");
  assert.ok(planFor(blog({ touchesHomeGuides: true }), ORIGIN).paths.includes("/"),
    "a post inside the newest-3 strip must");
});

test("unpublishing a live article still revalidates it — that is the point", () => {
  const plan = planFor(blog({ wasLive: true, isLive: false }), ORIGIN);
  assert.deepEqual(plan.paths, ["/blog/reacher-4", "/blog"]);
  assert.ok(!isEmptyPlan(plan), "the page must stop being served from cache");
});

test("CDN purge lists exact absolute URLs, never a wildcard or a prefix", () => {
  const plan = planFor(blog({ touchesHomeGuides: true }), ORIGIN);
  assert.deepEqual(plan.urls, [
    "https://cinetonight.com/blog/reacher-4",
    "https://cinetonight.com/blog",
    "https://cinetonight.com/",
  ]);
  for (const u of plan.urls) {
    assert.ok(u.startsWith("https://"), "absolute URL required by the purge API");
    assert.ok(!u.includes("*"), "no wildcards — this must never become a bulk purge");
  }
});

test("a trailing slash on the origin does not produce a double slash", () => {
  const plan = planFor(blog(), "https://cinetonight.com/");
  assert.deepEqual(plan.urls[0], "https://cinetonight.com/blog/reacher-4");
});

/* ========================================================================== */
/* 3. PAGES                                                                   */
/* ========================================================================== */

test("a page invalidates only its own data, and no route path", () => {
  const plan = planFor({ kind: "page", slug: "about-us" }, ORIGIN);
  assert.deepEqual(plan.tags, ["cms:pages", "cms:page:about-us"]);
  assert.deepEqual(plan.paths, [], "/[slug] is force-dynamic — there is no route cache entry");
  assert.deepEqual(plan.urls, [], "and no edge cache header applies to it");
});

test("one page never invalidates another page's own tag", () => {
  const a = planFor({ kind: "page", slug: "about-us" }, ORIGIN);
  assert.ok(!a.tags.includes("cms:page:privacy-policy"));
});

/* ========================================================================== */
/* 3b. HOMEPAGE CONFIGURATION (Stage 5)                                       */
/* ========================================================================== */

test("publishing the homepage invalidates exactly one route", () => {
  const plan = planFor({ kind: "homepage" }, ORIGIN);
  assert.deepEqual(plan.tags, ["cms:homepage"]);
  assert.deepEqual(plan.paths, ["/"]);
  assert.deepEqual(plan.urls, ["https://cinetonight.com/"]);
});

test("the homepage tag reaches the tag store", () => {
  assert.ok(isCmsTag("cms:homepage"));
});

test("publishing discovery settings invalidates only the two surfaces that render them", () => {
  const plan = planFor({ kind: "discovery" }, ORIGIN);
  assert.deepEqual(plan.tags, ["cms:discovery"]);
  assert.deepEqual(plan.paths, ["/", "/discover"]);
  assert.ok(isCmsTag("cms:discovery"));
  assert.ok(plan.paths.length <= 2, "two routes, two rebuilds — never the catalogue");
});

test("publishing settings clears the data tag but rebuilds no routes", () => {
  // Site title and description live in the ROOT LAYOUT, so they are on every
  // page. Revalidating every route would be hundreds of R2 writes for a text
  // change — exactly the bulk regeneration the architecture forbids.
  const plan = planFor({ kind: "settings" }, ORIGIN);
  assert.deepEqual(plan.tags, ["cms:settings"]);
  assert.deepEqual(plan.paths, [], "no route rebuild");
  assert.deepEqual(plan.urls, [], "no CDN purge");
  assert.ok(isCmsTag("cms:settings"));
});

/* ========================================================================== */
/* 4. BLAST RADIUS — what must NEVER appear in a plan                         */
/* ========================================================================== */

test("no plan ever touches a movie, person, genre or browse route", () => {
  const plans = [
    planFor(blog({ touchesHomeGuides: true }), ORIGIN),
    planFor({ kind: "page", slug: "about-us" }, ORIGIN),
    planFor({ kind: "homepage" }, ORIGIN),
    planFor({ kind: "discovery" }, ORIGIN),
    planFor({ kind: "settings" }, ORIGIN),
  ];
  const forbidden = ["/movie", "/person", "/genres", "/free-movies", "/trending", "/latest"];
  for (const p of plans) {
    for (const path of [...p.paths, ...p.urls]) {
      for (const f of forbidden) {
        assert.ok(!path.includes(f), `${path} must not be invalidated — that is a bulk R2 regeneration`);
      }
    }
  }
});

test("a plan is small — at most three routes, so at most three rebuilds", () => {
  const plan = planFor(blog({ touchesHomeGuides: true }), ORIGIN);
  assert.ok(plan.paths.length <= 3, `got ${plan.paths.length} paths`);
});

/* ========================================================================== */
/* 5. THE TAG FILTER — what the tag store is allowed to be consulted for      */
/* ========================================================================== */

test("the filter accepts exactly the tags this project revalidates", () => {
  for (const t of ["cms:blog", "cms:blog:x", "cms:pages", "cms:page:about-us", "_N_T_/", "_N_T_/blog", "_N_T_/blog/x"]) {
    assert.ok(isCmsTag(t), `${t} must reach the tag store`);
  }
});

test("the filter rejects every other route's tags, so they cost nothing", () => {
  for (const t of ["_N_T_/movie/stree-2", "_N_T_/person/123", "_N_T_/genres", "_N_T_/free-movies",
                   "_N_T_/trending", "_N_T_/blogsomething", "some-other-tag"]) {
    assert.ok(!isCmsTag(t), `${t} must NOT reach the tag store`);
  }
});

test("the filter also accepts OpenNext's write shape", () => {
  assert.ok(isCmsTag({ tag: "cms:blog", stale: 1, expire: 2 }));
  assert.ok(!isCmsTag({ tag: "_N_T_/movie/x" }));
});

/* ========================================================================== */
/* 6. HOMEPAGE GUIDES STRIP                                                   */
/* ========================================================================== */

test("only the newest three posts count as the homepage Guides strip", () => {
  const live = ["a", "b", "c", "d", "e"];
  assert.equal(HOME_GUIDES, 3);
  assert.ok(inHomeGuides(live, "a"));
  assert.ok(inHomeGuides(live, "c"));
  assert.ok(!inHomeGuides(live, "d"), "the fourth post is not shown on the homepage");
  assert.ok(!inHomeGuides(live, "missing"));
});

test("a post dropping out of the strip is caught by the before-list", () => {
  // Trashing "a": it is gone from the after-list, so only the BEFORE list can
  // tell us the homepage changed. This is why both are checked.
  const before = ["a", "b", "c", "d"];
  const after = ["b", "c", "d"];
  assert.ok(inHomeGuides(before, "a"));
  assert.ok(!inHomeGuides(after, "a"));
  assert.ok(inHomeGuides(before, "a") || inHomeGuides(after, "a"), "combined check catches it");
});
