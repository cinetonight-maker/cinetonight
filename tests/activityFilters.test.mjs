import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  rangeFor, dayBound, sanitizeSearch, buildActivityQuery, describeFilters,
  AUDIT_MODULES, AUDIT_ACTIONS,
} from "../lib/activityFilters.ts";

const NOW = new Date("2026-08-21T17:30:00.000Z");

/* ============================ read-only ================================= */

test("every activity route exports GET and nothing that can change a log", () => {
  // Both the list route and the single-entry route. An audit log an admin can
  // edit or delete from the dashboard is not an audit log.
  for (const f of ["app/api/admin/activity/route.ts", "app/api/admin/activity/[id]/route.ts"]) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.match(src, /export async function GET/, `${f}: sanity — it does read`);
    for (const verb of ["POST", "PUT", "PATCH", "DELETE"]) {
      assert.ok(
        !new RegExp(`export\\s+(async\\s+)?function\\s+${verb}\\b`).test(src),
        `${f} must never export ${verb} — entries are append-only`,
      );
    }
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[^\n]*\/\/.*$/gm, "");
    for (const write of [".insert(", ".update(", ".delete(", ".upsert("]) {
      assert.ok(!code.includes(write), `${f} must not call ${write}`);
    }
  }
});

test("the detail screen shows rollback availability but cannot perform one", () => {
  const src = readFileSync(new URL("../components/admin/ActivityDetail.tsx", import.meta.url), "utf8");
  assert.match(src, /rollback/i, "sanity: it reports availability");
  // It must not POST anywhere — a rollback is done from the item's own
  // History, so that the rollback is itself logged rather than circular.
  assert.ok(!/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(src),
    "the audit detail screen must not send a mutating request");
});

/* ============================ date ranges =============================== */

test("today starts at midnight, not 24 hours ago", () => {
  const { from } = rangeFor("today", NOW);
  assert.ok(from);
  const d = new Date(from);
  assert.equal(d.getHours(), 0);
  assert.equal(d.getMinutes(), 0);
  assert.ok(d.getTime() <= NOW.getTime());
});

test("the rolling ranges are the right length", () => {
  for (const [preset, days] of [["7d", 7], ["30d", 30], ["90d", 90]]) {
    const { from } = rangeFor(preset, NOW);
    const delta = NOW.getTime() - new Date(from).getTime();
    assert.equal(Math.round(delta / 86_400_000), days, preset);
  }
});

test("'all time' and 'custom' add no bounds of their own", () => {
  assert.deepEqual(rangeFor("all", NOW), {});
  assert.deepEqual(rangeFor("custom", NOW), {});
});

test("a 'to' date includes the whole of that day", () => {
  // The classic off-by-one: without this, filtering "to 21 Aug" hides
  // everything that happened on 21 Aug.
  const end = dayBound("2026-08-21", true);
  const d = new Date(end);
  assert.equal(d.getHours(), 23);
  assert.equal(d.getMinutes(), 59);
  assert.ok(new Date("2026-08-21T17:30:00").getTime() < d.getTime(), "5:30pm on that day is inside the range");
});

test("a rubbish date is ignored rather than becoming an invalid bound", () => {
  assert.equal(dayBound(""), undefined);
  assert.equal(dayBound("21/08/2026"), undefined);
  assert.equal(dayBound("2026-13-45"), undefined);
});

/* ============================== search ================================== */

test("search terms cannot break out of the query grammar", () => {
  // PostgREST's or= filter is comma/parenthesis separated; these characters
  // would change the filter's meaning if they survived.
  const nasty = `reacher,action.eq.delete)(or(status.eq.published`;
  const clean = sanitizeSearch(nasty);
  for (const ch of [",", "(", ")", "%", "*", "\\", '"', "'"]) {
    assert.ok(!clean.includes(ch), `${ch} must be stripped`);
  }
  assert.match(clean, /reacher/, "the useful part survives");
});

test("search is length-bounded and whitespace-normalised", () => {
  assert.ok(sanitizeSearch("x".repeat(500)).length <= 60);
  assert.equal(sanitizeSearch("  two   words  "), "two words");
  assert.equal(sanitizeSearch("   "), "");
});

/* ============================ query building ============================ */

test("only known modules and actions are forwarded", () => {
  const q = buildActivityQuery({ module: "blog", action: "publish" }, NOW);
  assert.match(q, /module=blog/);
  assert.match(q, /action=publish/);

  const junk = buildActivityQuery({ module: "../../etc", action: "DROP TABLE" }, NOW);
  assert.ok(!junk.includes("module="), "an unknown module is dropped, not passed through");
  assert.ok(!junk.includes("action="), "an unknown action is dropped");
});

test("every filter can be combined at once", () => {
  const q = new URLSearchParams(buildActivityQuery({
    module: "pages", action: "trash", actor: "me@example.com",
    preset: "7d", search: "about", before: "2026-08-20T00:00:00.000Z",
  }, NOW));
  assert.equal(q.get("module"), "pages");
  assert.equal(q.get("action"), "trash");
  assert.equal(q.get("actor"), "me@example.com");
  assert.equal(q.get("q"), "about");
  assert.ok(q.get("from"), "the 7-day preset sets a lower bound");
  assert.equal(q.get("before"), "2026-08-20T00:00:00.000Z", "pagination survives the filters");
});

test("a custom range uses the typed dates, not the preset maths", () => {
  const q = new URLSearchParams(buildActivityQuery({
    preset: "custom", customFrom: "2026-08-01", customTo: "2026-08-15",
  }, NOW));
  assert.match(q.get("from"), /^2026-08-01T/);
  assert.match(q.get("to"), /^2026-08-15T/);
});

test("an empty filter set asks for everything", () => {
  assert.equal(buildActivityQuery({}, NOW), "");
  assert.equal(buildActivityQuery({ preset: "all" }, NOW), "");
});

test("the filter summary reads like English", () => {
  assert.equal(describeFilters({}), "everything");
  assert.equal(
    describeFilters({ module: "blog", action: "publish", preset: "7d", search: "reacher" }),
    "blog · publish · last 7 days · “reacher”",
  );
});

/* ======================= the closed value sets ========================== */

test("the filter lists are the single source of truth for logged actions", () => {
  // lib/audit.ts derives AuditAction/AuditModule from these arrays, so a verb
  // that is logged but not filterable is a TYPE ERROR, not something a test
  // has to go hunting for. This asserts that wiring is still in place.
  const src = readFileSync(new URL("../lib/audit.ts", import.meta.url), "utf8");
  assert.match(src, /AuditAction\s*=\s*\(typeof AUDIT_ACTIONS\)\[number\]/);
  assert.match(src, /AuditModule\s*=\s*\(typeof AUDIT_MODULES\)\[number\]/);
  assert.match(src, /from "\.\/activityFilters"/);
});

test("the module list covers every dashboard section that can write", () => {
  for (const m of ["blog", "pages", "homepage", "discovery", "catalogue", "settings"]) {
    assert.ok(AUDIT_MODULES.includes(m), m);
  }
});
