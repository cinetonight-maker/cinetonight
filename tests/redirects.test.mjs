import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePath, validateRule, planRuleWrite, finalTarget, findChains,
  resolveRedirect, redirectCacheControl, parseBulk, bulkSummary,
  REDIRECT_REASONS, REDIRECT_STATUSES, DEFAULT_STATUS, isPermanent,
  MAX_ENABLED_RULES,
} from "../lib/redirects.ts";
import { readFileSync, existsSync } from "node:fs";
import { planFor } from "../lib/revalidatePlan.ts";

const M = (o) => new Map(Object.entries(o));

/* ---- normalisation ------------------------------------------------------ */

test("one URL has exactly one stored form", () => {
  // Without this, /Contact-Us/ and /contact-us are two rows for one address
  // and only one of them ever fires.
  for (const v of ["/contact-us", "/Contact-Us", "/contact-us/", "/CONTACT-US///", "  /contact-us  "]) {
    assert.equal(normalizePath(v), "/contact-us", v);
  }
});

test("queries and fragments are not part of the key", () => {
  assert.equal(normalizePath("/blog/post?utm_source=x"), "/blog/post");
  assert.equal(normalizePath("/blog/post#section"), "/blog/post");
});

test("an absolute URL is refused, never quietly turned into a path", () => {
  // Regression: an earlier version reduced "https://host/x" to "/x" as a
  // paste convenience. That meant "https://evil.example/x" became the internal
  // path "/x" and slipped past the external-destination check entirely.
  for (const v of ["https://cinetonight.com/contact-us", "https://elsewhere.example/x",
                   "http://elsewhere.example", "javascript:alert(1)", "mailto:a@b.c"]) {
    assert.equal(normalizePath(v), null, v);
  }
});

test("anything that could leave the site or escape the path is rejected", () => {
  for (const v of ["//evil.example", "/\\evil.example", "/a/../../etc", "contact", "",
                   "   ", null, undefined, 42, "/has space", '/has"quote', "/has<tag>"]) {
    assert.equal(normalizePath(v), null, JSON.stringify(v));
  }
});

test("an over-long path is rejected", () => {
  assert.equal(normalizePath("/" + "a".repeat(600)), null);
});

/* ---- validation --------------------------------------------------------- */

test("a well-formed rule validates", () => {
  const v = validateRule({ from: "/contact-us", to: "/contact", status: 308, reason: "duplicate_removal" });
  assert.ok(v.ok);
  assert.equal(v.from, "/contact-us");
  assert.equal(v.to, "/contact");
});

test("the home page can never be redirected away", () => {
  // One row should not be able to take the whole site offline.
  const v = validateRule({ from: "/", to: "/blog" });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(" "), /home page/i);
});

test("a self-redirect is refused", () => {
  const v = validateRule({ from: "/a", to: "/a/" });   // same after normalisation
  assert.equal(v.ok, false);
  assert.match(v.errors.join(" "), /itself/i);
});

test("an external destination is refused, with the reason stated", () => {
  const v = validateRule({ from: "/a", to: "https://elsewhere.example/x" });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(" "), /another domain/i);
});

test("unsupported statuses and unknown reasons are refused", () => {
  assert.equal(validateRule({ from: "/a", to: "/b", status: 200 }).ok, false);
  assert.equal(validateRule({ from: "/a", to: "/b", reason: "because" }).ok, false);
  for (const s of REDIRECT_STATUSES) assert.ok(validateRule({ from: "/a", to: "/b", status: s }).ok);
  for (const r of REDIRECT_REASONS) assert.ok(validateRule({ from: "/a", to: "/b", reason: r }).ok);
});

test("new rules default to a TEMPORARY status", () => {
  // A permanent redirect is cached by browsers and outlives deleting the rule,
  // so it has to be a deliberate promotion rather than the default.
  assert.equal(isPermanent(DEFAULT_STATUS), false);
  assert.equal(validateRule({ from: "/a", to: "/b" }).status, DEFAULT_STATUS);
});

/* ---- chains and loops --------------------------------------------------- */

test("a new rule pointing at an existing source is stored flattened", () => {
  // A→B where B→C already exists must be STORED as A→C. This is what makes
  // "one hop" a property of the data rather than a request-time computation.
  const plan = planRuleWrite(M({ "/b": "/c" }), { from: "/a", to: "/b" });
  assert.ok(plan.ok);
  assert.equal(plan.rule.to_path, "/c");
});

test("rules pointing at the new source are rewritten in the same write", () => {
  // X→A already exists; adding A→B must also repoint X straight at B.
  const plan = planRuleWrite(M({ "/x": "/a" }), { from: "/a", to: "/b" });
  assert.ok(plan.ok);
  assert.equal(plan.rule.to_path, "/b");
  assert.deepEqual(plan.rewrites, [{ from_path: "/x", to_path: "/b" }]);
});

test("a longer chain collapses to the final destination", () => {
  const plan = planRuleWrite(M({ "/b": "/c", "/c": "/d", "/d": "/e" }), { from: "/a", to: "/b" });
  assert.ok(plan.ok);
  assert.equal(plan.rule.to_path, "/e");
});

test("direct and indirect loops are refused", () => {
  assert.equal(planRuleWrite(M({ "/b": "/a" }), { from: "/a", to: "/b" }).ok, false);
  assert.equal(planRuleWrite(M({ "/b": "/c", "/c": "/a" }), { from: "/a", to: "/b" }).ok, false);
  assert.match(planRuleWrite(M({ "/b": "/a" }), { from: "/a", to: "/b" }).errors.join(" "), /loop/i);
});

test("editing a rule does not trip over its own previous destination", () => {
  // /a → /b exists; changing it to /a → /c must be allowed, not read as a loop.
  const plan = planRuleWrite(M({ "/a": "/b" }), { from: "/a", to: "/c" });
  assert.ok(plan.ok, plan.errors.join(" "));
  assert.equal(plan.rule.to_path, "/c");
});

test("applying a plan leaves a rule set with no chains — the invariant", () => {
  const rules = new Map();
  const add = (from, to) => {
    const plan = planRuleWrite(rules, { from, to, enabled: true });
    assert.ok(plan.ok, `${from} -> ${to}: ${plan.errors.join(" ")}`);
    rules.set(plan.rule.from_path, plan.rule.to_path);
    for (const r of plan.rewrites) rules.set(r.from_path, r.to_path);
  };
  add("/one", "/two");
  add("/two", "/three");
  add("/zero", "/one");
  add("/three", "/final");
  assert.deepEqual(findChains(rules), [], `chains present: ${JSON.stringify([...rules])}`);
  for (const to of rules.values()) assert.equal(rules.has(to), false, `${to} is both a target and a source`);
});

test("finalTarget returns null rather than spinning on a hand-corrupted table", () => {
  assert.equal(finalTarget(M({ "/a": "/b", "/b": "/a" }), "/a"), null);
  assert.equal(finalTarget(M({ "/a": "/a" }), "/a"), null);
  assert.equal(finalTarget(M({ "/a": "/b" }), "/a"), "/b");
  assert.equal(finalTarget(M({}), "/nowhere"), "/nowhere");
});

/* ---- resolution --------------------------------------------------------- */

const RULES = new Map([
  ["/contact-us", { to: "/contact", status: 308 }],
  ["/blog/old", { to: "/blog/new", status: 307 }],
]);

test("resolution is a single lookup and matches regardless of URL spelling", () => {
  for (const v of ["/contact-us", "/Contact-Us/", "/contact-us?utm=1"]) {
    const r = resolveRedirect(RULES, v);
    assert.ok(r.match, v);
    assert.equal(r.to, "/contact");
    assert.equal(r.status, 308);
  }
});

test("an unknown or invalid path does not match", () => {
  assert.equal(resolveRedirect(RULES, "/nothing-here").match, false);
  assert.equal(resolveRedirect(RULES, "//evil.example").match, false);
  assert.equal(resolveRedirect(RULES, "").match, false);
});

test("a resolved destination is never itself a source — one hop, guaranteed", () => {
  for (const [, v] of RULES) assert.equal(RULES.has(v.to), false, `${v.to} would be a second hop`);
});

/* ---- cache control ------------------------------------------------------ */

test("permanent redirects get a short explicit cache window, temporary ones none", () => {
  // Measured on the live stack: a 308 was inheriting
  // stale-while-revalidate=2592000 — thirty days — with no max-age. That is
  // how a permanent redirect becomes one you cannot take back.
  for (const s of [301, 308]) {
    const cc = redirectCacheControl(s);
    assert.match(cc, /max-age=600/);
    assert.doesNotMatch(cc, /stale-while-revalidate/);
    const seconds = Number(/max-age=(\d+)/.exec(cc)[1]);
    assert.ok(seconds > 0 && seconds <= 3600, `${seconds}s is too long to be recoverable`);
  }
  for (const s of [302, 307]) assert.equal(redirectCacheControl(s), "no-store");
});

/* ---- bulk import -------------------------------------------------------- */

test("bulk parsing reports every row and writes nothing", () => {
  const rows = parseBulk([
    "from,to,status",
    "/old-one,/new-one,308",
    "/old-two,/new-two",
    "# a comment",
    "",
    "/broken",
    "/old-three,https://elsewhere.example/x",
    "/old-one,/somewhere-else",
    "/,/blog",
  ].join("\n"));

  const byLine = Object.fromEntries(rows.map((r) => [r.line, r]));
  assert.ok(byLine[2].ok);
  assert.equal(byLine[2].status, 308);
  assert.ok(byLine[3].ok);
  assert.equal(byLine[3].status, DEFAULT_STATUS, "a row with no status gets the safe default");
  assert.equal(byLine[6].ok, false);                       // missing destination
  assert.match(byLine[7].error, /another domain/i);        // external
  assert.match(byLine[8].error, /duplicate/i);             // repeat of /old-one
  assert.match(byLine[9].error, /home page/i);             // "/" as source

  const s = bulkSummary(rows);
  assert.equal(s.total, 6);
  assert.equal(s.valid, 2);
  assert.equal(s.invalid, 4);
});

test("bulk rows carry the migration reason by default", () => {
  const [row] = parseBulk("/a,/b");
  assert.equal(row.reason, "migration");
  assert.equal(parseBulk("/a,/b", "seo_cleanup")[0].reason, "seo_cleanup");
});

test("an empty or comment-only paste produces nothing rather than an error", () => {
  assert.deepEqual(parseBulk(""), []);
  assert.deepEqual(parseBulk("# just a note\n\n"), []);
});

/* ---- limits ------------------------------------------------------------- */

test("the rule cap is a real number the API can enforce", () => {
  assert.equal(typeof MAX_ENABLED_RULES, "number");
  assert.ok(MAX_ENABLED_RULES >= 100 && MAX_ENABLED_RULES <= 5000);
});

/* ---- guards that keep the system honest --------------------------------- */

test("the sitemap never submits a URL that redirects", () => {
  // A sitemap entry that 308s is a self-inflicted crawl error: it asks Google
  // to index a URL and then tells it to go somewhere else. The sitemap is
  // generated from live content, so this asserts it stays that way rather than
  // ever being fed from a stored list that could include a redirect source.
  const src = readFileSync(new URL("../app/sitemap.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /from\(["']redirects["']\)/, "sitemap must not read the redirects table");
});

test("every route that resolves redirects is free of a loading boundary", () => {
  // A loading.tsx creates a Suspense boundary, which flushes the response with
  // its 200 status before the page can redirect — measured, and the reason
  // 4B-1 exists. Reintroducing one here would silently turn every redirect on
  // that route back into a 200 with a client-side hop.
  const routes = ["app/blog/[slug]", "app/[slug]"];
  for (const dir of routes) {
    const page = readFileSync(new URL(`../${dir}/page.tsx`, import.meta.url), "utf8");
    assert.match(page, /redirectOrNotFound/, `${dir} should resolve redirects`);
    assert.equal(
      existsSync(new URL(`../${dir}/loading.tsx`, import.meta.url)), false,
      `${dir}/loading.tsx would turn this route's redirects back into 200s`,
    );
  }
});

test("the redirect resolver is never wired into middleware", () => {
  // Requirement: no database lookup in middleware. The whole site passes
  // through that file on every request.
  const mw = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  assert.doesNotMatch(mw, /redirectMap|redirectOrNotFound|from\(["']redirects["']\)/);
});

test("a redirect change clears only the addresses that changed", () => {
  // Never a bulk rebuild: a rule change affects the old address and nothing
  // else, so the plan must name exactly those paths and no routes beyond them.
  const plan = planFor({ kind: "redirect", sources: ["/contact-us", "/blog/old"] }, "https://cinetonight.com");
  assert.deepEqual(plan.tags, ["cms:redirects"]);
  assert.deepEqual(plan.paths, ["/contact-us", "/blog/old"]);
  assert.deepEqual(plan.urls, ["https://cinetonight.com/contact-us", "https://cinetonight.com/blog/old"]);
});

test("a redirect plan can never name a movie, person, genre or browse route", () => {
  const plan = planFor({ kind: "redirect", sources: ["/blog/old", "/contact-us"] }, "https://cinetonight.com");
  for (const p of plan.paths) {
    assert.doesNotMatch(p, /^\/(movie|person|genres|movies|tv-shows|web-series|trending|latest)\b/, p);
  }
});

test("the purge list stays inside the single-file purge limit", () => {
  const many = Array.from({ length: 100 }, (_, i) => `/old-${i}`);
  const plan = planFor({ kind: "redirect", sources: many }, "https://cinetonight.com");
  assert.ok(plan.urls.length <= 30, `${plan.urls.length} URLs exceeds the 30-URL purge cap`);
});
