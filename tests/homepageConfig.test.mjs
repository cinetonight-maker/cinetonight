import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeConfig, visibleSections, validateConfig, describeConfig, isDirty,
  DEFAULT_CONFIG, ALL_SECTIONS, SECTION_META,
} from "../lib/homepageConfig.ts";

/* normalizeConfig is the guard that makes this feature safe: whatever is in
 * the database must come out as something the homepage can render. */

test("garbage in still produces a renderable homepage", () => {
  for (const junk of [null, undefined, "", 0, [], "a string", { sections: "nope" }]) {
    const c = normalizeConfig(junk);
    assert.deepEqual(c.order.sort(), [...ALL_SECTIONS].sort(), `${JSON.stringify(junk)}: every section present`);
    for (const id of ALL_SECTIONS) assert.equal(typeof c.sections[id].on, "boolean");
  }
});

test("the shipped default survives a round trip unchanged", () => {
  assert.deepEqual(normalizeConfig(DEFAULT_CONFIG), DEFAULT_CONFIG);
});

test("an unknown section is dropped, a missing one is added back", () => {
  const c = normalizeConfig({ order: ["guides", "not-a-section", "trending"] });
  assert.ok(!c.order.includes("not-a-section"));
  assert.equal(c.order[0], "guides", "the chosen order is kept…");
  assert.equal(c.order[1], "trending");
  assert.deepEqual([...c.order].sort(), [...ALL_SECTIONS].sort(), "…and the rest are appended");
});

test("a duplicated section appears once", () => {
  const c = normalizeConfig({ order: ["guides", "guides", "trending"] });
  assert.equal(c.order.filter((s) => s === "guides").length, 1);
});

test("counts are clamped to what the section can actually show", () => {
  const meta = SECTION_META.guides.count;
  assert.equal(normalizeConfig({ sections: { guides: { on: true, count: 999 } } }).sections.guides.count, meta.max);
  assert.equal(normalizeConfig({ sections: { guides: { on: true, count: -5 } } }).sections.guides.count, meta.min);
  assert.equal(normalizeConfig({ sections: { guides: { on: true, count: "abc" } } }).sections.guides.count, DEFAULT_CONFIG.sections.guides.count);
  assert.equal(normalizeConfig({ sections: { guides: { on: true, count: 4.6 } } }).sections.guides.count, 5, "rounded");
});

test("hero picks are de-duplicated, cleaned and capped", () => {
  const c = normalizeConfig({ hero: { picks: ["a", "a", "", "  ", "b", 5, null, ...Array.from({ length: 20 }, (_, i) => `x${i}`)] } });
  assert.equal(c.hero.picks[0], "a");
  assert.equal(c.hero.picks.filter((p) => p === "a").length, 1);
  assert.ok(!c.hero.picks.includes(""));
  assert.ok(c.hero.picks.length <= 8, `capped, got ${c.hero.picks.length}`);
  assert.ok(c.hero.picks.every((p) => typeof p === "string"));
});

test("hero copy is editable, bounded, and never renders empty", () => {
  const c = normalizeConfig({ hero: { title: "  ", sub: "" } });
  assert.equal(c.hero.title, DEFAULT_CONFIG.hero.title, "a blank H1 falls back to the shipped wording");
  assert.equal(c.hero.sub, DEFAULT_CONFIG.hero.sub);
  const long = normalizeConfig({ hero: { title: "T".repeat(400), sub: "S".repeat(400) } });
  assert.ok(long.hero.title.length <= 120);
  assert.ok(long.hero.sub.length <= 260);
});

test("changing hero picks does not wipe the hero copy", () => {
  // Regression: the toggle used to rebuild `hero` from scratch, so picking a
  // poster silently reset an edited headline back to the default.
  const edited = normalizeConfig({ hero: { title: "Custom headline here", sub: "Custom sub", picks: ["a"] } });
  const afterToggle = normalizeConfig({ ...edited, hero: { ...edited.hero, picks: ["a", "b"] } });
  assert.equal(afterToggle.hero.title, "Custom headline here");
  assert.equal(afterToggle.hero.sub, "Custom sub");
});

test("empty headings fall back to the shipped text rather than rendering blank", () => {
  const c = normalizeConfig({ sections: { guides: { on: true, title: "   ", sub: "" } } });
  assert.equal(c.sections.guides.title, DEFAULT_CONFIG.sections.guides.title);
  assert.equal(c.sections.guides.sub, DEFAULT_CONFIG.sections.guides.sub);
});

test("headings are length-bounded", () => {
  const c = normalizeConfig({ sections: { trending: { on: true, title: "T".repeat(500), sub: "S".repeat(900) } } });
  assert.ok(c.sections.trending.title.length <= 120);
  assert.ok(c.sections.trending.sub.length <= 260);
});

test("sections with no text control never gain one", () => {
  const c = normalizeConfig({ sections: { streaming: { on: true, title: "sneaky", count: 99 } } });
  assert.equal(c.sections.streaming.title, undefined);
  assert.equal(c.sections.streaming.count, undefined);
});

/* ------------------------------ rendering ------------------------------ */

test("only sections that are on are rendered, in the configured order", () => {
  const c = normalizeConfig({
    order: ["newsletter", "guides", "trending"],
    sections: { guides: { on: false }, trending: { on: true }, newsletter: { on: true } },
  });
  const v = visibleSections(c);
  assert.equal(v[0], "newsletter");
  assert.ok(!v.includes("guides"));
  assert.ok(v.includes("trending"));
});

/* ------------------------------ validation ----------------------------- */

test("switching everything off is flagged before it is published", () => {
  const c = normalizeConfig({ sections: Object.fromEntries(ALL_SECTIONS.map((s) => [s, { on: false }])) });
  const problems = validateConfig(c);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /every section is switched off/i);
});

test("a healthy config has nothing to complain about", () => {
  assert.deepEqual(validateConfig(DEFAULT_CONFIG), []);
});

/* -------------------------- draft vs live ------------------------------ */

test("a cosmetic difference in the stored JSON is not an unpublished change", () => {
  const live = DEFAULT_CONFIG;
  const draft = JSON.parse(JSON.stringify({ ...DEFAULT_CONFIG, extraJunk: true }));
  assert.equal(isDirty(live, draft), false, "unknown keys are normalised away");
});

test("a real difference IS an unpublished change", () => {
  const draft = normalizeConfig({ ...DEFAULT_CONFIG, sections: { ...DEFAULT_CONFIG.sections, myList: { on: false } } });
  assert.equal(isDirty(DEFAULT_CONFIG, draft), true);
});

test("the summary line reads like English", () => {
  assert.match(describeConfig(DEFAULT_CONFIG), /automatic hero, 6 of 6 sections on/);
  const c = normalizeConfig({ hero: { picks: ["a"] }, sections: { myList: { on: false } } });
  assert.match(describeConfig(c), /1 hero pick, 5 of 6 sections on/);
});

/* --------------------------- the locked spine -------------------------- */

test("the decision-engine spine is not configurable at all", () => {
  // Hero, Quick Picks, moods and the single recommendation are locked by the
  // Phase 3 design. If they ever appear in this list, the homepage can be
  // turned back into a shelf-stack by one wrong click.
  for (const forbidden of ["hero", "pickStudio", "quickPicks", "moods", "recommendation"]) {
    assert.ok(!ALL_SECTIONS.includes(forbidden), `${forbidden} must not be switchable`);
  }
});
