import test from "node:test";
import assert from "node:assert/strict";
import { pickClips, pickTrailer } from "../lib/clips.ts";

const v = (o) => ({ site: "YouTube", official: true, published_at: "2024-01-01", ...o });

test("only embeddable YouTube videos survive", () => {
  const out = pickClips([
    v({ key: "a", type: "Clip", name: "Opening" }),
    { site: "Vimeo", key: "b", type: "Clip", name: "No" },
    v({ key: null, type: "Clip", name: "No key" }),
  ], null);
  assert.deepEqual(out.map((c) => c.key), ["a"]);
});

test("the trailer already playing is never offered again as a clip", () => {
  const list = [v({ key: "trail", type: "Trailer", name: "Main" }), v({ key: "c1", type: "Clip", name: "Scene" })];
  const key = pickTrailer(list);
  assert.equal(key, "trail");
  assert.ok(!pickClips(list, key).some((c) => c.key === "trail"));
});

test("clips come before featurettes, official before unofficial", () => {
  const out = pickClips([
    v({ key: "f", type: "Featurette", name: "Making of" }),
    v({ key: "c", type: "Clip", name: "Scene" }),
  ], null);
  assert.deepEqual(out.map((c) => c.key), ["c", "f"]);

  const off = pickClips([
    v({ key: "u", type: "Clip", name: "Fan", official: false }),
    v({ key: "o", type: "Clip", name: "Official" }),
  ], null);
  assert.deepEqual(off.map((c) => c.key), ["o", "u"]);
});

test("duplicates are dropped and the list is capped", () => {
  const many = Array.from({ length: 20 }, (_, i) => v({ key: `k${i}`, type: "Clip", name: `Clip ${i}` }));
  assert.equal(pickClips([...many, ...many], null).length, 6);
});

test("no videos, or junk, produces an empty list rather than throwing", () => {
  assert.deepEqual(pickClips([], null), []);
  assert.deepEqual(pickClips(undefined, null), []);
  assert.deepEqual(pickClips([{}, null].filter(Boolean), null), []);
});
