import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeConfig, validateConfig, describeConfig, isDirty, allIds,
  enabledMoods, enabledQuickPicks, enabledExploreTabs,
  DEFAULT_CONFIG, MOOD_IDS, QUICK_PICK_IDS, EXPLORE_TAB_IDS, BUILTIN,
} from "../lib/discoveryConfig.ts";

/* =================== 1. THE CACHE-KEY GUARANTEE ========================= */

test("switching things off does NOT change the id space", () => {
  // This is the whole reason ids are not editable. /api/mood validates against
  // the closed list, so its cardinality must be identical whether an entry is
  // shown or hidden. If disabling ever removed an id, an old bookmark would
  // 404 — and worse, enabling/disabling would become a cache-shape change.
  const all = normalizeConfig({});
  const mostlyOff = normalizeConfig({
    moods: { entries: Object.fromEntries(MOOD_IDS.map((id) => [id, { on: false }])) },
    quickPicks: { entries: Object.fromEntries(QUICK_PICK_IDS.map((id) => [id, { on: false }])) },
    explore: { entries: Object.fromEntries(EXPLORE_TAB_IDS.map((id) => [id, { on: false }])) },
  });
  assert.deepEqual(allIds(mostlyOff), allIds(all));
});

test("an invented id can never enter the config", () => {
  const c = normalizeConfig({
    moods: { order: ["happy", "spooky-custom", "../etc/passwd"], entries: { "spooky-custom": { on: true, label: "Spooky" } } },
    quickPicks: { order: ["made-up"] },
    explore: { order: ["evil"], defaultTab: "evil" },
  });
  assert.deepEqual([...c.moods.order].sort(), [...MOOD_IDS].sort());
  assert.deepEqual([...c.quickPicks.order].sort(), [...QUICK_PICK_IDS].sort());
  assert.deepEqual([...c.explore.order].sort(), [...EXPLORE_TAB_IDS].sort());
  assert.ok(!allIds(c).includes("spooky-custom"));
  assert.ok(EXPLORE_TAB_IDS.includes(c.explore.defaultTab), "a bogus default tab is replaced with a real one");
});

/* =================== 2. GARBAGE IN, RENDERABLE OUT ====================== */

test("any junk still produces a usable discovery config", () => {
  for (const junk of [null, undefined, "", 0, [], "a string", { moods: "nope" }, { explore: 42 }]) {
    const c = normalizeConfig(junk);
    assert.equal(c.moods.order.length, MOOD_IDS.length, `${JSON.stringify(junk)}`);
    assert.equal(c.quickPicks.order.length, QUICK_PICK_IDS.length);
    assert.equal(c.explore.order.length, EXPLORE_TAB_IDS.length);
    assert.ok(EXPLORE_TAB_IDS.includes(c.explore.defaultTab));
    assert.deepEqual(validateConfig(c), [], "the fallback must be publishable");
  }
});

test("the shipped default survives a round trip unchanged", () => {
  assert.deepEqual(normalizeConfig(DEFAULT_CONFIG), DEFAULT_CONFIG);
});

test("a duplicated id appears once, and the chosen order is respected", () => {
  const c = normalizeConfig({ moods: { order: ["dark", "dark", "happy"] } });
  assert.equal(c.moods.order.filter((m) => m === "dark").length, 1);
  assert.equal(c.moods.order[0], "dark");
  assert.equal(c.moods.order[1], "happy");
  assert.equal(c.moods.order.length, MOOD_IDS.length, "the rest are appended");
});

test("a blank label falls back to the built-in one, never renders empty", () => {
  const c = normalizeConfig({ moods: { entries: { happy: { on: true, label: "   ", icon: "" } } } });
  assert.equal(c.moods.entries.happy.label, BUILTIN.moods.happy.label);
  assert.equal(c.moods.entries.happy.icon, BUILTIN.moods.happy.icon);
});

test("labels and sub-lines are length-bounded", () => {
  const c = normalizeConfig({
    quickPicks: { entries: { short: { on: true, label: "L".repeat(300), sub: "S".repeat(300) } } },
  });
  assert.ok(c.quickPicks.entries.short.label.length <= 40);
  assert.ok(c.quickPicks.entries.short.sub.length <= 80);
});

test("fields a group does not have are never invented", () => {
  const c = normalizeConfig({ explore: { entries: { korean: { on: true, sub: "sneaky", icon: "x" } } } });
  assert.equal(c.explore.entries.korean.sub, undefined);
  assert.equal(c.explore.entries.korean.icon, undefined);
});

/* ===================== 3. TONIGHT'S PICK — RULES ONLY =================== */

test("Tonight's Pick takes rules, and a bad rule falls back to open", () => {
  const c = normalizeConfig({ tonight: { preferMood: "not-a-mood", minRating: "abc", kind: "cartoons" } });
  assert.equal(c.tonight.preferMood, "any");
  assert.equal(c.tonight.minRating, 0);
  assert.equal(c.tonight.kind, "any");
});

test("a rating rule is clamped to a sane range", () => {
  assert.equal(normalizeConfig({ tonight: { minRating: 99 } }).tonight.minRating, 9);
  assert.equal(normalizeConfig({ tonight: { minRating: -4 } }).tonight.minRating, 0);
  assert.equal(normalizeConfig({ tonight: { minRating: 7.26 } }).tonight.minRating, 7.3);
});

test("there is no way to force one specific film", () => {
  // You ruled this out and the architecture agrees: a hard-coded film goes
  // stale and makes the "why it fits" line a lie.
  const c = normalizeConfig({ tonight: { movieId: "stree-2", forceTitle: "Stree 2", pinned: ["a"] } });
  assert.deepEqual(Object.keys(c.tonight).sort(), ["kind", "minRating", "preferMood"]);
});

/* ========================= 4. VALIDATION ================================ */

test("publishing an empty mood picker is refused", () => {
  const c = normalizeConfig({ moods: { entries: Object.fromEntries(MOOD_IDS.map((id) => [id, { on: false }])) } });
  assert.match(validateConfig(c).join(" "), /every mood is switched off/i);
});

test("publishing with no quick picks or no tabs is refused", () => {
  const noPicks = normalizeConfig({ quickPicks: { entries: Object.fromEntries(QUICK_PICK_IDS.map((id) => [id, { on: false }])) } });
  assert.match(validateConfig(noPicks).join(" "), /quick pick/i);
  const noTabs = normalizeConfig({ explore: { entries: Object.fromEntries(EXPLORE_TAB_IDS.map((id) => [id, { on: false }])) } });
  assert.match(validateConfig(noTabs).join(" "), /explore tab/i);
});

test("the default Explore tab is always one that is switched on", () => {
  const c = normalizeConfig({
    explore: { defaultTab: "korean", entries: { korean: { on: false } } },
  });
  assert.notEqual(c.explore.defaultTab, "korean", "it is moved to an enabled tab automatically");
  assert.ok(enabledExploreTabs(c).includes(c.explore.defaultTab));
  assert.deepEqual(validateConfig(c), []);
});

test("a healthy config has nothing to complain about", () => {
  assert.deepEqual(validateConfig(DEFAULT_CONFIG), []);
});

/* ========================== 5. READING ================================== */

test("only enabled entries are offered, in the configured order", () => {
  const c = normalizeConfig({
    moods: { order: ["dark", "happy", "romantic"], entries: { happy: { on: false } } },
  });
  const on = enabledMoods(c);
  assert.equal(on[0], "dark");
  assert.ok(!on.includes("happy"));
  assert.ok(on.includes("romantic"));
});

test("draft vs live ignores cosmetic JSON differences", () => {
  assert.equal(isDirty(DEFAULT_CONFIG, JSON.parse(JSON.stringify({ ...DEFAULT_CONFIG, junk: 1 }))), false);
  const changed = normalizeConfig({ tonight: { minRating: 7 } });
  assert.equal(isDirty(DEFAULT_CONFIG, changed), true);
});

test("the summary line reads like English", () => {
  assert.match(describeConfig(DEFAULT_CONFIG), /8\/8 moods, 6\/6 quick picks, 6\/6 tabs · Tonight's Pick open to everything/);
  const c = normalizeConfig({ tonight: { preferMood: "romantic", minRating: 7, kind: "movie" } });
  assert.match(describeConfig(c), /prefers Romantic, rating 7\+, films only/);
});

/* ================= 6. THE RULES STAY OUT OF REACH ======================= */

test("genre and constraint rules are not part of the editable config", () => {
  const c = normalizeConfig({
    moods: { entries: { dark: { on: true, label: "Family Night", genres: ["Family"], exclude: [] } } },
    quickPicks: { entries: { "highly-rated": { on: true, minRating: 1, maxRuntime: 999 } } },
  });
  // The label moved; the rules did not come with it.
  assert.equal(c.moods.entries.dark.label, "Family Night");
  assert.equal(c.moods.entries.dark.genres, undefined, "genre rules must stay in lib/moods.ts");
  assert.equal(c.quickPicks.entries["highly-rated"].minRating, undefined, "constraints must stay in lib/quickPicks.ts");
});
