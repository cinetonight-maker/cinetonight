import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ============================================================================
 * A source-level guard, not a behaviour test.
 *
 * The rule "autosave must never publish or invalidate anything" is only worth
 * something if it survives future edits. These tests read the actual route
 * files and fail if the autosave branch ever grows a write to a public column
 * or a call into the revalidation code — which is exactly the mistake that
 * would silently push an unfinished draft onto the live site.
 * ========================================================================= */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** The text of one `if (...) { ... }` branch, matched by its opening line. */
function branchAfter(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `marker not found: ${marker}`);
  let depth = 0, i = source.indexOf("{", start), out = "";
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    if (ch === "}") { depth--; if (depth === 0) { out += ch; break; } }
    out += ch;
  }
  return out;
}

const BLOG = read("app/api/admin/blog/route.ts");
const PAGES = read("app/api/admin/pages/route.ts");

const REVALIDATION_CALLS = [
  "revalidateForAction", "revalidateBlog", "runPlan", "revalidatePath", "revalidateTag", "purgeUrls",
];

test("the blog autosave branch calls nothing that touches a public cache", () => {
  const branch = branchAfter(BLOG, 'if (body?.mode === "autosave")');
  for (const call of REVALIDATION_CALLS) {
    assert.ok(!branch.includes(call), `autosave must not call ${call}()`);
  }
});

/** The object literal passed to the single `.update({...})` inside a branch.
 *  Checking THIS rather than the whole branch avoids false positives from
 *  HTTP status codes in error responses. */
function updatePayload(branch) {
  const m = /\.update\(\{([\s\S]*?)\}\)/.exec(branch);
  assert.ok(m, "the autosave branch must contain exactly one .update({...})");
  return m[1];
}

test("the blog autosave branch writes ONLY draft columns", () => {
  const payload = updatePayload(branchAfter(BLOG, 'if (body?.mode === "autosave")'));
  assert.ok(payload.includes("draft_body"), "sanity: it does write the draft");
  for (const col of ["status", "publish_at", "deleted_at", "excerpt", "image_url", "meta_title"]) {
    assert.ok(!payload.includes(col), `autosave must not write ${col} — that is the live article`);
  }
  // `body` on its own is the live article column; `draft_body` is not.
  assert.ok(!/\bbody\s*:/.test(payload), "autosave must not write the live `body` column");
});

test("the pages autosave branch calls nothing that touches a public cache", () => {
  const branch = branchAfter(PAGES, 'if (body?.mode === "autosave")');
  for (const call of REVALIDATION_CALLS) {
    assert.ok(!branch.includes(call), `autosave must not call ${call}()`);
  }
  const payload = updatePayload(branch);
  assert.ok(payload.includes("draft_content"), "sanity: it does write the draft");
  for (const col of ["status", "deleted_at", "meta_title"]) {
    assert.ok(!payload.includes(col), `autosave must not write ${col}`);
  }
  assert.ok(!/\bcontent\s*:/.test(payload.replace(/draft_content/g, "")), "must not write the live `content` column");
});

test("discarding a draft also invalidates nothing", () => {
  for (const [name, src] of [["blog", BLOG], ["pages", PAGES]]) {
    const branch = branchAfter(src, 'if (body?.action === "discardDraft")');
    for (const call of REVALIDATION_CALLS) {
      assert.ok(!branch.includes(call), `${name} discardDraft must not call ${call}()`);
    }
  }
});

test("both autosave branches report `revalidated: null` so the contract is visible", () => {
  for (const [name, src] of [["blog", BLOG], ["pages", PAGES]]) {
    const branch = branchAfter(src, 'if (body?.mode === "autosave")');
    assert.ok(branch.includes("revalidated: null"), `${name} autosave must state that it revalidated nothing`);
  }
});

test("no route anywhere can request a bulk Cloudflare purge", () => {
  const files = [
    "lib/revalidateCms.ts", "lib/revalidatePlan.ts",
    "app/api/admin/blog/route.ts", "app/api/admin/pages/route.ts",
  ];
  for (const f of files) {
    // Comments are stripped first: these files deliberately DESCRIBE the
    // things they must never do, and a doc comment is not an API call.
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[^\n]*\/\/.*$/gm, "");
    assert.ok(!src.includes("purge_everything"), `${f} must never purge everything`);
    assert.ok(!/\bprefixes\s*:/.test(src), `${f} must not purge by prefix`);
    assert.ok(!/\bhosts\s*:/.test(src), `${f} must not purge by host`);
  }
});

test("the purge request body contains a file list and nothing else", () => {
  const src = read("lib/revalidateCms.ts");
  const body = /JSON\.stringify\(\{([\s\S]*?)\}\)/.exec(src);
  assert.ok(body, "the purge call must send a JSON body");
  assert.match(body[1].trim(), /^files:/, "the only key may be `files`");
  assert.ok(!body[1].includes("tags"), "purging by tag is Enterprise-only and would be a bulk purge");
});

test("the CDN purge sends a bounded list of files", () => {
  const src = read("lib/revalidateCms.ts");
  assert.ok(src.includes("files: urls.slice(0, 30)"), "must cap at the API's 30-URL limit");
  assert.ok(src.includes("AbortController"), "must be time-boxed so a slow API cannot hang a save");
});
