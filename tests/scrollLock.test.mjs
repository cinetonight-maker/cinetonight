import test from "node:test";
import assert from "node:assert/strict";
import { createScrollLock } from "../lib/scrollLock.ts";

/* Regression tests for the "whole site stops scrolling after opening the nav
 * drawer" bug. Each test is one of the two defects that caused it, or one of
 * the ways a naive fix breaks something else. */

const fakeBody = (initial = "") => {
  let value = initial;
  return { get: () => value, set: (v) => { value = v; }, current: () => value };
};

test("one overlay locks and then restores the page", () => {
  const body = fakeBody();
  const lock = createScrollLock(body);
  lock.acquire();
  assert.equal(body.current(), "hidden");
  lock.release();
  assert.equal(body.current(), "", "the page must scroll again");
  assert.equal(lock.count(), 0);
});

test("the previous overflow value is restored, not blanked", () => {
  // Something else legitimately set a value before any overlay opened.
  const body = fakeBody("clip");
  const lock = createScrollLock(body);
  lock.acquire();
  assert.equal(body.current(), "hidden");
  lock.release();
  assert.equal(body.current(), "clip", "the original value must come back");
});

test("overlapping overlays never unlock each other", () => {
  // The drawer is open, then a modal opens on top of it, then the MODAL
  // closes first. The page must stay locked because the drawer is still open.
  const body = fakeBody();
  const lock = createScrollLock(body);
  lock.acquire();          // drawer
  lock.acquire();          // modal
  assert.equal(lock.count(), 2);
  lock.release();          // modal closes
  assert.equal(body.current(), "hidden", "drawer is still open — stay locked");
  lock.release();          // drawer closes
  assert.equal(body.current(), "", "last one out unlocks");
});

test("a stray release cannot unlock the page or go negative", () => {
  const body = fakeBody();
  const lock = createScrollLock(body);
  lock.release();                       // stray (double cleanup / hot reload)
  lock.release();
  assert.equal(lock.count(), 0, "count must never go negative");

  lock.acquire();
  assert.equal(body.current(), "hidden");
  lock.release();
  assert.equal(body.current(), "", "a real lock still releases correctly");
});

test("re-acquiring after a full release captures the value again", () => {
  const body = fakeBody("auto");
  const lock = createScrollLock(body);
  lock.acquire();
  lock.release();
  assert.equal(body.current(), "auto");
  lock.acquire();
  assert.equal(body.current(), "hidden");
  lock.release();
  assert.equal(body.current(), "auto", "second cycle must behave like the first");
});

test("acquire is not idempotent — every overlay must be counted", () => {
  // If acquire() ignored repeat calls, two overlays would share one lock and
  // the first to close would unlock the page underneath the second.
  const body = fakeBody();
  const lock = createScrollLock(body);
  lock.acquire();
  lock.acquire();
  assert.equal(lock.count(), 2);
});
