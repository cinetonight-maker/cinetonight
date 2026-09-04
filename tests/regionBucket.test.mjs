import test from "node:test";
import assert from "node:assert/strict";
import { bucketFor, asBucket, REGION_BUCKETS } from "../lib/regionBucket.ts";

/* The whole point of this module is that it is CLOSED. Every value it returns
 * becomes a TMDB discover parameter and an edge-cache key on /api/mood, so
 * these tests exist to catch the day someone widens it by accident. */

test("the bucket set is exactly two entries", () => {
  assert.deepEqual([...REGION_BUCKETS], ["IN", "GLOBAL"]);
});

test("South Asia routes to the India-blended pool", () => {
  for (const c of ["IN", "PK", "BD", "LK", "NP", "BT", "MV"]) {
    assert.equal(bucketFor(c), "IN", `${c} should be IN`);
  }
});

test("everywhere else routes to the unbiased pool", () => {
  for (const c of ["US", "GB", "KR", "JP", "AE", "AU", "DE", "BR"]) {
    assert.equal(bucketFor(c), "GLOBAL", `${c} should be GLOBAL`);
  }
});

test("case and whitespace do not change the bucket", () => {
  assert.equal(bucketFor("in"), "IN");
  assert.equal(bucketFor(" pk "), "IN");
  assert.equal(bucketFor("us"), "GLOBAL");
});

test("an unknown or missing country falls to GLOBAL, never to a guess", () => {
  for (const junk of [null, undefined, "", "   ", "ZZ", "XX", "not-a-country", "123"]) {
    assert.equal(bucketFor(junk), "GLOBAL", `${JSON.stringify(junk)} should be GLOBAL`);
  }
});

/* asBucket guards the wire. Anything it lets through can mint a cache entry,
 * so it must accept the two exact strings and absolutely nothing else. */

test("asBucket accepts exactly the known buckets", () => {
  assert.equal(asBucket("IN"), "IN");
  assert.equal(asBucket("GLOBAL"), "GLOBAL");
});

test("asBucket rejects everything else, including near-misses", () => {
  for (const junk of ["in", "global", "Global", "US", "IN ", "", null, undefined, "IN,GLOBAL", 42, {}]) {
    assert.equal(asBucket(junk), undefined, `${JSON.stringify(junk)} must not pass`);
  }
});
