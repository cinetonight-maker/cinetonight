"use client";

import { useEffect } from "react";
import { getBodyScrollLock } from "./scrollLock";

/* ============================================================================
 * useScrollLock — the ONE way this site locks background scrolling.
 *
 * Used by the nav drawer, the filter drawer, the ticket modal and the player
 * modal. The counting/restoring rules live in lib/scrollLock.ts, where they
 * are unit-tested; this file is only the React binding.
 *
 * Two properties matter and are easy to lose in a refactor:
 *
 *  - When `active` is false this hook does NOTHING. It must never write to
 *    body.style, or an inactive overlay would stamp on a lock another overlay
 *    legitimately holds.
 *  - The lock is released by effect CLEANUP, which React also runs on unmount
 *    and on route change — so a drawer left open during navigation can never
 *    strand the page.
 *
 * Usage:  useScrollLock(isOpen)
 * ========================================================================= */

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const lock = getBodyScrollLock();
    lock.acquire();
    return () => lock.release();
  }, [active]);
}
