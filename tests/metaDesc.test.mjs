import test from "node:test";
import assert from "node:assert/strict";
import { metaDescription, META_DESC_MAX } from "../lib/metaDesc.ts";

test("text inside the limit is returned untouched, with no ellipsis", () => {
  assert.equal(metaDescription("Short and clean."), "Short and clean.");
});

test("never cuts a word in half", () => {
  // The exact failure from docs/BLOG-AUDIT.md: a hard slice landed mid-word.
  const long = "Watch Hallam Foe (2007) trailer, cast, ratings and where to stream it tonight, "
    + "plus everything else you might want to check about streaming availability in your own "
    + "country today, including which platforms carry it and what each one will cost you.";
  assert.ok(long.length > META_DESC_MAX, "test fixture must exceed the limit");
  const out = metaDescription(long);
  assert.ok(out.length <= META_DESC_MAX, `too long: ${out.length}`);
  assert.ok(out.endsWith("…"), "should end with an ellipsis");
  // Trailing punctuation is stripped on purpose, so compare against the
  // source's words with their punctuation removed too.
  const lastWord = out.slice(0, -1).trim().split(" ").pop();
  const sourceWords = long.split(/\s+/).map((w) => w.replace(/[\s,;:.!?-]+$/, ""));
  assert.ok(sourceWords.includes(lastWord), `"${lastWord}" is not a whole word from the source`);
});

test("no dangling punctuation before the ellipsis", () => {
  const s = "a".repeat(150) + " word, and then some more text that pushes it over the limit";
  assert.ok(!/[\s,;:.!?-]…$/.test(metaDescription(s)));
});

test("a single unbreakable word still respects the limit", () => {
  const out = metaDescription("x".repeat(400));
  assert.ok(out.length <= META_DESC_MAX);
});

test("collapses whitespace so newlines never reach a meta tag", () => {
  assert.equal(metaDescription("one\n\ntwo   three"), "one two three");
});

test("empty and nullish input do not throw", () => {
  assert.equal(metaDescription(""), "");
  assert.equal(metaDescription(undefined), "");
});
