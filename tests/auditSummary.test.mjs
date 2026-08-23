import test from "node:test";
import assert from "node:assert/strict";
import {
  summarizeValue, summarizeRow, changedFields, describeChange,
  MAX_VALUE_CHARS, MAX_SNAPSHOT_CHARS,
} from "../lib/auditSummary.ts";

/* The audit log must be readable, bounded and safe. These tests are the three
 * properties that make it so. */

/* ------------------------------ bounded ------------------------------- */

test("short values are kept verbatim — that is what makes a log readable", () => {
  assert.equal(summarizeValue("published"), "published");
  assert.equal(summarizeValue(42), 42);
  assert.equal(summarizeValue(true), true);
  assert.equal(summarizeValue(null), null);
});

test("a long article body becomes a length marker, not a second copy", () => {
  const body = "x".repeat(20_000);
  const out = String(summarizeValue(body));
  assert.match(out, /^<20,000 chars · [0-9a-f]{8}>$/);
  assert.ok(out.length < 40, "the marker must be tiny");
});

test("the boundary is exact", () => {
  assert.equal(summarizeValue("a".repeat(MAX_VALUE_CHARS)).length, MAX_VALUE_CHARS, "at the limit: kept");
  assert.match(String(summarizeValue("a".repeat(MAX_VALUE_CHARS + 1))), /^<\d+ chars · [0-9a-f]{8}>$/, "over: replaced");
});

test("small arrays are kept (tags, hero picks); big ones become a count", () => {
  assert.deepEqual(summarizeValue(["reacher", "prime video"]), ["reacher", "prime video"]);
  assert.match(String(summarizeValue(Array.from({ length: 40 }, (_, i) => `t${i}`))), /^<40 items · [0-9a-f]{8}>$/);
});

test("a whole snapshot is capped, and says so when it truncates", () => {
  const row = {};
  for (let i = 0; i < 200; i++) row[`field_${i}`] = "y".repeat(100);
  const out = summarizeRow(row);
  const size = JSON.stringify(out).length;
  assert.ok(size <= MAX_SNAPSHOT_CHARS + 200, `snapshot was ${size} chars`);
  assert.equal(out["…"], "truncated", "truncation must be visible, not silent");
});

/* -------------------------------- safe -------------------------------- */

test("anything that looks like a secret is redacted, never truncated-but-shown", () => {
  const out = summarizeRow({
    title: "Fine", api_key: "sk-live-123", password: "hunter2",
    access_token: "abc", session: "xyz", authorization: "Bearer q",
  });
  assert.equal(out.title, "Fine");
  for (const k of ["api_key", "password", "access_token", "session", "authorization"]) {
    assert.equal(out[k], "<redacted>", `${k} must be redacted`);
  }
  assert.ok(!JSON.stringify(out).includes("hunter2"));
  assert.ok(!JSON.stringify(out).includes("sk-live-123"));
});

test("draft columns are never logged — autosave is not an audit event", () => {
  const out = summarizeRow({ title: "T", draft_body: "half-written", draft_content: "x", draft_saved_at: "now" });
  assert.deepEqual(Object.keys(out), ["title"]);
});

test("noise fields are dropped so the changed ones stand out", () => {
  const out = summarizeRow({ id: "uuid", created_at: "t", updated_at: "t", status: "published" });
  assert.deepEqual(out, { status: "published" });
});

test("a non-object snapshot is null, not a crash", () => {
  assert.equal(summarizeRow(null), null);
  assert.equal(summarizeRow(undefined), null);
  assert.equal(summarizeRow("a string"), null);
});

/* ------------------------------ readable ------------------------------ */

test("only the fields that actually changed are reported", () => {
  const before = { title: "A", status: "draft", cat: "Guides" };
  const after = { title: "A", status: "published", cat: "Guides" };
  assert.deepEqual(changedFields(before, after), [{ field: "status", from: "draft", to: "published" }]);
});

test("a changed long body is detected without either version being copied", () => {
  const before = { body: "a".repeat(9000) };
  const after = { body: "b".repeat(4000) };
  const [c] = changedFields(before, after);
  assert.equal(c.field, "body");
  assert.match(String(c.from), /^<9,000 chars · [0-9a-f]{8}>$/);
  assert.match(String(c.to), /^<4,000 chars · [0-9a-f]{8}>$/);
});

test("an identical long body is NOT reported as changed", () => {
  const same = "z".repeat(9000);
  assert.deepEqual(changedFields({ body: same }, { body: same }), [],
    "same length AND same marker — no false positive");
});

test("the one-line description reads like English", () => {
  assert.equal(
    describeChange({ status: "draft" }, { status: "published" }),
    "status “draft” → “published”",
  );
  assert.equal(describeChange({ title: "A" }, { title: "A" }), "No field changed");
});

test("an edit that keeps the SAME length is still detected", () => {
  // Regression: length alone is not enough — rewriting a paragraph without
  // changing the character count produced an identical marker, so the change
  // was invisible in the log. A content fingerprint fixes it.
  const before = { body: "a".repeat(5000) };
  const after = { body: "b".repeat(5000) };
  assert.equal(changedFields(before, after).length, 1, "same length, different text — must be reported");
});

test("a long field is described as 'changed', never dumped into the line", () => {
  const line = describeChange({ body: "a".repeat(5000) }, { body: "b".repeat(5000) });
  assert.equal(line, "body changed");
  assert.ok(line.length < 40);
});

test("many changes are summarised with a count, not a wall of text", () => {
  const before = { a: "1", b: "2", c: "3", d: "4", e: "5" };
  const after = { a: "9", b: "9", c: "9", d: "9", e: "9" };
  const line = describeChange(before, after);
  assert.match(line, /\+2 more$/);
  assert.ok(line.length < 120);
});
