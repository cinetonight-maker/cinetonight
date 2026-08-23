import test from "node:test";
import assert from "node:assert/strict";
import {
  headingsOf, headingIssues, firstParagraph, wordCountOf, internalLinksOf,
  seoChecklist, checklistSummary, countByStatus, contains, slugContains,
} from "../lib/blogSeo.ts";
import { readFileSync } from "node:fs";

const find = (checks, id) => checks.find((c) => c.id === id);

/* ---- heading structure: the house rule ---------------------------------- */

test("reads every ATX heading in order", () => {
  const hs = headingsOf("# One\n\ntext\n\n## Two\n\n### Three");
  assert.deepEqual(hs.map((h) => [h.level, h.text]), [[1, "One"], [2, "Two"], [3, "Three"]]);
});

test("a '#' inside a code fence is not a heading", () => {
  // Otherwise a shell snippet would be reported as a second H1 and the author
  // would be told to fix something that is not wrong.
  const hs = headingsOf("# Real\n\n```\n# not a heading\n```\n\n## Section");
  assert.deepEqual(hs.map((h) => h.text), ["Real", "Section"]);
});

test("a correct article has no heading issues", () => {
  assert.deepEqual(headingIssues("# Title\n\nIntro.\n\n## A\n\ntext\n\n### A.1\n\ntext\n\n## B\n\ntext"), []);
});

test("missing, duplicate and skipped heading levels are all caught", () => {
  assert.match(headingIssues("## Only an H2").join(" "), /No H1/);
  assert.match(headingIssues("# A\n\n# B\n\n## C").join(" "), /2 H1 headings/);
  assert.match(headingIssues("# A\n\n### Skipped").join(" "), /jumps from H1 to H3/);
  assert.match(headingIssues("## First\n\n# Late H1").join(" "), /first heading is not the H1/);
  assert.match(headingIssues("# Alone").join(" "), /No H2 sections/);
});

/* ---- text helpers ------------------------------------------------------- */

test("the opening paragraph skips headings, lists and quotes", () => {
  assert.equal(firstParagraph("# Title\n\n## Sub\n\n- a bullet\n\n> a quote\n\nThe real opening."), "The real opening.");
});

test("word count ignores headings and code", () => {
  const n = wordCountOf("# Heading words here\n\none two three\n\n```\nignored code block\n```");
  assert.equal(n, 3);
});

test("internal links are found, deduped, and images are not mistaken for links", () => {
  const md = "See [Discover](/discover) and [Movies](/movies) and [again](/discover).\n\n![poster](/pic.jpg)\n\n[External](https://example.com)";
  assert.deepEqual(internalLinksOf(md), ["/discover", "/movies"]);
});

test("keyword matching ignores case, spacing and curly apostrophes", () => {
  assert.ok(contains("Can’t Decide What To Watch Tonight", "can't decide what to watch tonight"));
  assert.ok(contains("A   spaced   phrase", "a spaced phrase"));
  assert.equal(contains("nothing here", "missing"), false);
});

/* ---- the checklist ------------------------------------------------------ */

const GOOD = {
  title: "Can't Decide What To Watch Tonight? Movies For Every Mood",
  slug: "cant-decide-what-to-watch-tonight",
  body: [
    "# Can't Decide What To Watch Tonight? Movies For Every Mood",
    "Can't decide what to watch tonight? Start with how you feel instead of scrolling.",
    "## Movies To Watch When You Can't Decide What To Watch Tonight",
    "Browse [Discover](/discover) or the [movies](/movies) hub.",
    "## Something Relaxing",
    "word ".repeat(700),
  ].join("\n\n"),
  excerpt: "Find movies based on your mood.",
  metaTitle: "Can't Decide What To Watch Tonight? Movies For Every Mood",
  metaDescription: "Can't decide what to watch tonight? Find movies based on your mood, from relaxing and funny picks to thrillers, emotional stories, and hidden gems.",
  focusKeyword: "can't decide what to watch tonight",
  imageUrl: "https://example.com/a.jpg",
  imageAlt: "A person choosing a film",
  cat: "Guides",
};

test("a well-formed article passes every check", () => {
  const checks = seoChecklist(GOOD);
  const failing = checks.filter((c) => c.status !== "ok");
  assert.deepEqual(failing.map((c) => c.id), [], `unexpected: ${JSON.stringify(failing, null, 1)}`);
  assert.match(checklistSummary(checks), /^All \d+ checks pass$/);
});

test("no focus keyword is a hard fail, and the keyword checks disappear with it", () => {
  const checks = seoChecklist({ ...GOOD, focusKeyword: "" });
  assert.equal(find(checks, "focus").status, "fail");
  // Nothing should claim the keyword is missing from the title when there is
  // no keyword to look for — that is noise, not guidance.
  assert.equal(find(checks, "kw-title"), undefined);
});

test("each keyword placement is reported independently", () => {
  assert.equal(find(seoChecklist({ ...GOOD, metaTitle: "Something else entirely" }), "kw-title").status, "warn");
  assert.equal(find(seoChecklist({ ...GOOD, metaDescription: "x".repeat(130) }), "kw-desc").status, "warn");
  assert.equal(find(seoChecklist({ ...GOOD, slug: "unrelated-slug" }), "kw-slug").status, "warn");
});

test("thin articles and missing internal links are flagged", () => {
  const thin = seoChecklist({ ...GOOD, body: "# T\n\nshort.\n\n## S\n\ntext" });
  assert.equal(find(thin, "length").status, "fail");
  assert.equal(find(thin, "internal-links").status, "fail");
});

test("a dated URL is warned about, an evergreen one is not", () => {
  assert.equal(find(seoChecklist({ ...GOOD, slug: "best-movies-2026" }), "slug-evergreen").status, "warn");
  assert.equal(find(seoChecklist({ ...GOOD, slug: "december-picks" }), "slug-evergreen").status, "warn");
  assert.equal(find(seoChecklist(GOOD), "slug-evergreen").status, "ok");
});

test("the two dangerous switches announce themselves", () => {
  const hidden = seoChecklist({ ...GOOD, noindex: true });
  assert.equal(find(hidden, "noindex").status, "warn");
  assert.match(find(hidden, "noindex").hint, /not appear in search results/);

  const copied = seoChecklist({ ...GOOD, canonicalUrl: "https://elsewhere.example/post" });
  assert.match(find(copied, "canonical").hint, /elsewhere\.example/);

  // ...and stay silent when they are off, which is the normal case.
  assert.equal(find(seoChecklist(GOOD), "noindex"), undefined);
  assert.equal(find(seoChecklist(GOOD), "canonical"), undefined);
});

test("a missing alt is only raised when there is an image to describe", () => {
  assert.equal(find(seoChecklist({ ...GOOD, imageAlt: "" }), "image-alt").status, "warn");
  assert.equal(find(seoChecklist({ ...GOOD, imageUrl: null, imageAlt: "" }), "image-alt").status, "ok");
});

test("every check carries a hint whenever it is not passing", () => {
  // A checklist row that says "fix this" without saying how is useless.
  const messy = seoChecklist({ ...GOOD, body: "## no h1", focusKeyword: "", imageUrl: null, cat: "" });
  for (const c of messy.filter((x) => x.status !== "ok")) {
    assert.ok(c.hint.trim().length > 0, `${c.id} has no hint`);
  }
});

test("the summary counts match the checks", () => {
  const checks = seoChecklist({ ...GOOD, focusKeyword: "", imageUrl: null });
  const { ok, warn, fail } = countByStatus(checks);
  assert.equal(ok + warn + fail, checks.length);
  assert.match(checklistSummary(checks), /to fix/);
});

test("the URL check compares in slug space, so punctuation never fails a good slug", () => {
  // Regression: "cant-decide-what-to-watch-tonight" vs the keyword
  // "can't decide what to watch tonight" used to warn, telling the author to
  // fix a URL that was already correct. Slugs never contain apostrophes.
  assert.ok(slugContains("cant-decide-what-to-watch-tonight", "can't decide what to watch tonight"));
  assert.ok(slugContains("best-sci-fi-movies", "Sci-Fi Movies"));
  assert.equal(slugContains("something-else", "can't decide what to watch tonight"), false);
  assert.equal(slugContains("", "anything"), false);
});

test("a passing check carries no hint — advice only appears where it is needed", () => {
  for (const c of seoChecklist(GOOD)) {
    assert.equal(c.status, "ok");
    assert.equal(c.hint, "", `${c.id} shows advice for something already correct`);
  }
});

/* ---- the sitemap must not contradict the page it points at -------------- */

test("the sitemap filters out posts marked noindex or canonicalled elsewhere", () => {
  // A sitemap entry is a REQUEST to index. Submitting a URL you have marked
  // "hide from search" is reported by Search Console as an error, against a
  // signal the author deliberately set. This was a real bug: the SEO fields
  // shipped before the sitemap was taught to read them.
  const src = readFileSync(new URL("../app/sitemap.ts", import.meta.url), "utf8");
  assert.match(src, /\.noindex/, "sitemap must consult the noindex flag");
  assert.match(src, /canonicalUrl/, "sitemap must consult the canonical override");
  // and the filter must run BEFORE the URL list is built from it
  assert.ok(
    src.indexOf("indexableBlogs") < src.indexOf("indexableBlogs.map"),
    "the filtered list must be what the blog URLs are built from",
  );
});

test("getBlogs actually carries the flags the sitemap filters on", () => {
  // The filter is useless if the query never selects the columns — which was
  // the case, because BLOG_LIST_COLUMNS deliberately excludes heavy fields.
  const src = readFileSync(new URL("../lib/data.ts", import.meta.url), "utf8");
  assert.match(src, /BLOG_SEO_COLUMNS/, "the SEO columns must be selected");
  assert.match(src, /noindex, canonical_url/, "both flags must be in that list");
  assert.match(src, /noindex: r\.noindex === true/, "and mapped onto the Blog object");
  // ...with a fallback, because naming a column that does not exist fails the
  // whole query and would blank the blog on an install without blog_seo.sql.
  assert.match(src, /if \(error\) \(\{ data, error \} = await list\(BLOG_LIST_COLUMNS\)\)/);
});
