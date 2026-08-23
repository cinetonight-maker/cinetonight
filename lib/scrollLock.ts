/* ============================================================================
 * lib/scrollLock.ts — the counting core behind useScrollLock, with no React
 * and no DOM in it, so the exact behaviour can be unit-tested.
 *
 * The bug this exists to prevent (reported live, Aug 2026): opening the nav
 * drawer left the WHOLE SITE unscrollable. Two separate defects caused it:
 *
 *  1. Overlays each did `document.body.style.overflow = open ? "hidden" : ""`.
 *     That clobbers instead of restoring, so closing one overlay unlocked the
 *     page while another was still open — and any pre-existing value was lost.
 *  2. The header's burger set `open = true` unconditionally instead of
 *     toggling. React bails out when state is set to the value it already
 *     has, so the effect never re-ran, cleanup never fired, and the page
 *     stayed locked until a refresh.
 *
 * The rules encoded below, each covered by a test in tests/scrollLock.test.mjs:
 *  - COUNTED: overlapping overlays never unlock each other; only the last one
 *    out restores scrolling.
 *  - RESTORING: the value present at the FIRST lock is captured and restored
 *    exactly — never blanked.
 *  - IDEMPOTENT RELEASE: releasing more times than acquiring can never drive
 *    the count negative or unlock the page while a real lock is held.
 * ========================================================================= */

export interface OverflowTarget {
  get(): string;
  set(value: string): void;
}

export interface ScrollLock {
  acquire(): void;
  release(): void;
  /** Live lock count — for tests and debugging only. */
  count(): number;
}

export function createScrollLock(target: OverflowTarget): ScrollLock {
  let locks = 0;
  let previous = "";

  return {
    acquire() {
      if (locks === 0) {
        previous = target.get();
        target.set("hidden");
      }
      locks += 1;
    },
    release() {
      // Clamp at zero: a stray release (double cleanup, hot reload) must never
      // make the next real release unlock too early.
      if (locks === 0) return;
      locks -= 1;
      if (locks === 0) target.set(previous);
    },
    count: () => locks,
  };
}

/** The one lock the site actually uses. Created lazily so importing this
 *  module on the server never touches `document`. */
let bodyLock: ScrollLock | null = null;
export function getBodyScrollLock(): ScrollLock {
  if (!bodyLock) {
    bodyLock = createScrollLock({
      get: () => document.body.style.overflow,
      set: (v) => { document.body.style.overflow = v; },
    });
  }
  return bodyLock;
}
