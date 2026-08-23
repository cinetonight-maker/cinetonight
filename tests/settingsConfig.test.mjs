import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSettings, validateSettings, describeSettings, settingsDirty,
  fromRow, toRow, DEFAULTS, SOCIAL_KEYS,
} from "../lib/settingsConfig.ts";

test("garbage in still produces usable settings", () => {
  for (const junk of [null, undefined, "", 0, [], "a string"]) {
    const s = normalizeSettings(junk);
    assert.equal(s.siteTitle, DEFAULTS.siteTitle, `${JSON.stringify(junk)}`);
    assert.equal(typeof s.maintenanceMode, "boolean");
    assert.deepEqual(s.social, {});
  }
});

test("an unsafe social link is dropped, never rendered", () => {
  // A javascript: href in the footer would be an XSS hole on every page.
  const s = normalizeSettings({
    social: { facebook: "javascript:alert(1)", instagram: "https://instagram.com/x", youtube: "not a url", twitter: "  " },
  });
  assert.equal(s.social.facebook, undefined);
  assert.equal(s.social.youtube, undefined);
  assert.equal(s.social.twitter, undefined);
  assert.equal(s.social.instagram, "https://instagram.com/x");
});

test("only known social networks are kept", () => {
  const s = normalizeSettings({ social: { myspace: "https://myspace.com/x", facebook: "https://facebook.com/x" } });
  assert.equal(s.social.myspace, undefined, "an unknown network would render an icon-less link");
  assert.equal(s.social.facebook, "https://facebook.com/x");
  for (const k of Object.keys(s.social)) assert.ok(SOCIAL_KEYS.includes(k));
});

test("an empty title or description falls back rather than blanking every page", () => {
  const s = normalizeSettings({ siteTitle: "   ", siteDescription: "" });
  assert.equal(s.siteTitle, DEFAULTS.siteTitle);
  assert.equal(s.siteDescription, DEFAULTS.siteDescription);
});

test("title and description are length-bounded to what search engines show", () => {
  const s = normalizeSettings({ siteTitle: "T".repeat(500), siteDescription: "D".repeat(500) });
  assert.ok(s.siteTitle.length <= 70);
  assert.ok(s.siteDescription.length <= 170);
});

test("maintenance mode is only ever true when explicitly set", () => {
  assert.equal(normalizeSettings({}).maintenanceMode, false);
  assert.equal(normalizeSettings({ maintenanceMode: "yes" }).maintenanceMode, false, "a truthy string must not close the site");
  assert.equal(normalizeSettings({ maintenanceMode: 1 }).maintenanceMode, false);
  assert.equal(normalizeSettings({ maintenanceMode: true }).maintenanceMode, true);
});

test("warnings are advice, and a healthy set has none", () => {
  assert.deepEqual(validateSettings(DEFAULTS), []);
  const short = normalizeSettings({ ...DEFAULTS, siteTitle: "Hi" });
  assert.ok(validateSettings(short).length > 0);
  const badEmail = normalizeSettings({ ...DEFAULTS, contactEmail: "not-an-email" });
  assert.match(validateSettings(badEmail).join(" "), /email/i);
});

test("row conversion round-trips through the database column names", () => {
  const s = normalizeSettings({ ...DEFAULTS, contactEmail: "a@b.com", social: { youtube: "https://youtube.com/@x" } });
  const back = fromRow(toRow(s));
  assert.deepEqual(back, s);
});

test("dirty ignores cosmetic differences", () => {
  assert.equal(settingsDirty(DEFAULTS, { ...DEFAULTS, junk: 1 }), false);
  assert.equal(settingsDirty(DEFAULTS, { ...DEFAULTS, siteTitle: "Something else entirely" }), true);
});

test("the summary flags maintenance mode loudly", () => {
  assert.match(describeSettings(normalizeSettings({ ...DEFAULTS, maintenanceMode: true })), /MAINTENANCE MODE ON/);
  assert.ok(!describeSettings(DEFAULTS).includes("MAINTENANCE"));
});
