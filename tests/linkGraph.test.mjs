import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHref, isInternal, extractLinks, statusOf, buildLinkReport,
  relatedPosts, linkSuggestions, MIN_OUTBOUND, STATIC_ROUTES,
} from "../lib/linkGraph.ts";

const TARGETS = [
  { path: "/blog/best-thrillers", label: "Best Thrillers", kind: "post" },
  { path: "/blog/reacher-4", label: "Reacher Season 4", kind: "post" },
  { path: "/about-us", label: "About Us", kind: "page" },
  { path: "/movie/stree-2", label: "Stree 2", kind: "movie" },
];
const known = new Set([...TARGETS.map((t) => t.path), ...STATIC_ROUTES]);

/* ----------------------------- normalising ------------------------------ */

test("the same page written four ways is recognised as one page", () => {
  const forms = [
    "/blog/reacher-4",
    "/blog/reacher-4/",
    "https://cinetonight.com/blog/reacher-4",
    "https://www.cinetonight.com/blog/reacher-4/?utm_source=x#top",
  ];
  for (const f of forms) assert.equal(normalizeHref(f), "/blog/reacher-4");
});

test("the home page never loses its slash", () => {
  assert.equal(normalizeHref("/"), "/");
  assert.equal(normalizeHref("https://cinetonight.com/"), "/");
});

test("internal vs external is decided by host, not by shape", () => {
  assert.equal(isInternal("/blog/x"), true);
  assert.equal(isInternal("https://cinetonight.com/blog/x"), true);
  assert.equal(isInternal("https://www.themoviedb.org"), false);
  assert.equal(isInternal("mailto:a@b.com"), false);
  assert.equal(isInternal("#section"), false, "a jump link is not a page link");
});

/* ------------------------------ extraction ------------------------------ */

test("finds every markdown link, in order", () => {
  const links = extractLinks("See [A](/blog/a) then [B](https://x.com) and [C](/about-us).");
  assert.deepEqual(links.map((l) => l.href), ["/blog/a", "https://x.com", "/about-us"]);
  assert.deepEqual(links.map((l) => l.text), ["A", "B", "C"]);
});

test("images are not counted as links", () => {
  const links = extractLinks("![A poster](/img/a.jpg)\n\n[Real link](/blog/a)");
  assert.equal(links.length, 1);
  assert.equal(links[0].href, "/blog/a");
});

test("a linked image still counts once, as the link", () => {
  const links = extractLinks("[![thumb](https://i.ytimg.com/vi/ID/hqdefault.jpg)](https://www.youtube.com/watch?v=ID)");
  assert.equal(links.length, 1);
  assert.equal(links[0].href, "https://www.youtube.com/watch?v=ID");
});

test("legacy array bodies are scanned too", () => {
  assert.equal(extractLinks(["para one", "[A](/blog/a)"]).length, 1);
  assert.equal(extractLinks(null).length, 0);
});

/* -------------------------------- status -------------------------------- */

test("a link to a real page is ok; to a missing one is broken", () => {
  assert.equal(statusOf({ raw: "/blog/reacher-4", href: "/blog/reacher-4", text: "" }, known), "ok");
  assert.equal(statusOf({ raw: "/blog/deleted", href: "/blog/deleted", text: "" }, known), "broken");
});

test("static routes count as real pages", () => {
  assert.equal(statusOf({ raw: "/free-movies", href: "/free-movies", text: "" }, known), "ok");
});

test("pages we cannot list are 'unverified', never falsely 'broken'", () => {
  for (const p of ["/person/12345", "/channel/abc", "/movie/tmdb-999"]) {
    assert.equal(statusOf({ raw: p, href: p, text: "" }, known), "unverified", p);
  }
  // /search IS a real route, so a link to it is simply fine.
  assert.equal(statusOf({ raw: "/search?q=x", href: "/search", text: "" }, known), "ok");
});

/* -------------------------------- report -------------------------------- */

const docs = [
  { id: "1", kind: "post", title: "Best Thrillers", path: "/blog/best-thrillers", live: true,
    body: "Try [Reacher](/blog/reacher-4) and [Stree 2](/movie/stree-2). Also [gone](/blog/gone)." },
  { id: "2", kind: "post", title: "Reacher Season 4", path: "/blog/reacher-4", live: true,
    body: "Nothing links out of here except [TMDB](https://www.themoviedb.org)." },
  { id: "3", kind: "page", title: "About Us", path: "/about-us", live: true,
    body: "Read the [blog](/blog) and our [free movies](/free-movies)." },
  { id: "4", kind: "post", title: "A draft", path: "/blog/draft", live: false, body: "" },
];

test("broken links are found and attributed to the post they are in", () => {
  const r = buildLinkReport(docs, TARGETS);
  assert.equal(r.broken.length, 1);
  assert.equal(r.broken[0].href, "/blog/gone");
  assert.equal(r.broken[0].from.title, "Best Thrillers");
});

test("external links are counted but never reported as problems", () => {
  const r = buildLinkReport(docs, TARGETS);
  assert.equal(r.totals.externalLinks, 1);
  assert.ok(!r.broken.some((b) => b.href.startsWith("http")));
});

test("orphans are live pages nothing links to; drafts are never orphans", () => {
  const r = buildLinkReport(docs, TARGETS);
  const paths = r.orphans.map((o) => o.path).sort();
  assert.deepEqual(paths, ["/about-us", "/blog/best-thrillers"]);
  assert.ok(!paths.includes("/blog/draft"), "a draft is not published, so it cannot be an orphan");
  assert.ok(!paths.includes("/blog/reacher-4"), "this one IS linked to");
});

test("thin pages are live pages with fewer than the minimum internal links", () => {
  const r = buildLinkReport(docs, TARGETS);
  const thin = r.thin.map((t) => t.path);
  assert.ok(thin.includes("/blog/reacher-4"), "it has 0 internal links out");
  assert.ok(!thin.includes("/about-us"), "it has 2");
  assert.equal(MIN_OUTBOUND, 2);
});

test("a page linking to itself does not count as an internal link", () => {
  const self = [{ id: "s", kind: "post", title: "Self", path: "/blog/self", live: true,
    body: "[me](/blog/self) [me again](/blog/self)" }];
  const r = buildLinkReport(self, [{ path: "/blog/self", label: "Self", kind: "post" }]);
  assert.equal(r.thin.length, 1, "self-links must not satisfy the minimum");
  assert.equal(r.inbound["/blog/self"] ?? 0, 0);
});

/* ------------------------------- related -------------------------------- */

const posts = [
  { slug: "a", title: "Reacher Season 4 Release Date", cat: "News", tags: ["reacher", "prime video"] },
  { slug: "b", title: "Best Bollywood Comedies", cat: "Guides", tags: ["bollywood"] },
  { slug: "c", title: "Reacher Cast Explained", cat: "Guides", tags: ["reacher"] },
  { slug: "d", title: "Korean Dramas To Start With", cat: "Guides", tags: ["k-drama"] },
];

test("a shared tag alone beats a shared category alone", () => {
  const pair = [
    { slug: "cat-only", title: "Zzz Qqq", cat: "Guides", tags: [] },
    { slug: "tag-only", title: "Yyy Www", cat: "News", tags: ["reacher"] },
  ];
  const out = relatedPosts(pair, { slug: "x", title: "Mmm Nnn", cat: "Guides", tags: ["reacher"] }, 2);
  assert.equal(out[0].slug, "tag-only");
});

test("the most related post wins on total signal, not on one signal", () => {
  // "c" shares the tag AND the category AND a title word; "a" shares only the
  // tag and the word. "c" must come first.
  const out = relatedPosts(posts, { slug: "x", title: "Reacher Recap", cat: "Guides", tags: ["reacher"] }, 2);
  assert.deepEqual(out.map((p) => p.slug), ["c", "a"]);
});

test("a post never suggests itself", () => {
  const out = relatedPosts(posts, posts[0], 4);
  assert.ok(!out.some((p) => p.slug === "a"));
});

test("with nothing related, it still returns the newest rather than nothing", () => {
  const out = relatedPosts(posts, { slug: "z", title: "Zzz Qqq", cat: "Other", tags: [] }, 3);
  assert.equal(out.length, 3, "an empty related block would be a wasted slot");
  assert.deepEqual(out.map((p) => p.slug), ["a", "b", "c"]);
});

test("asking for more than exist returns what exists", () => {
  assert.equal(relatedPosts(posts, posts[0], 99).length, 3);
  assert.equal(relatedPosts([], posts[0], 3).length, 0);
});

/* ----------------------------- suggestions ------------------------------ */

test("suggests pages the text mentions but does not link to", () => {
  const s = linkSuggestions("Stree 2 was a huge hit this year.", "Horror comedies", TARGETS);
  assert.ok(s.some((x) => x.target.path === "/movie/stree-2"));
});

test("never suggests something already linked", () => {
  const s = linkSuggestions("[Stree 2](/movie/stree-2) was a huge hit.", "Horror comedies", TARGETS);
  assert.ok(!s.some((x) => x.target.path === "/movie/stree-2"));
});

test("common words alone do not trigger a suggestion", () => {
  const s = linkSuggestions("The best free movies to watch tonight in India.", "Guide", [
    { path: "/blog/best-thrillers", label: "Best Thrillers", kind: "post" },
  ]);
  assert.equal(s.length, 0, "'best' and 'movies' are too generic to mean a real match");
});
