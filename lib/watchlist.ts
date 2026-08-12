"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth";
import { supabaseBrowser } from "./supabase/client";

const KEY = "moviex:watchlist";
const EVENT = "moviex:wl-change";

function readLocal(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function writeLocal(list: string[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVENT));
}

/** Anonymous visitors get the original zero-friction localStorage-only
 *  watchlist, unchanged. Signed-in visitors get a real cross-device
 *  watchlist backed by Supabase (RLS-scoped to their own rows in the new
 *  `watchlist` table — see supabase/schema.sql). The first time someone
 *  who already had local items signs in, those get merged into their
 *  account once, then the local copy is cleared, so creating an account
 *  never loses what was already saved. */
export function useWatchlist() {
  const { user, loading: authLoading } = useAuth();
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    if (authLoading) return;

    // Signed out: exactly the original behavior.
    if (!user) {
      const sync = () => setIds(readLocal());
      sync();
      window.addEventListener(EVENT, sync);
      window.addEventListener("storage", sync);
      return () => {
        window.removeEventListener(EVENT, sync);
        window.removeEventListener("storage", sync);
      };
    }

    // Signed in: merge any local items into the account once, then load
    // from Supabase from now on.
    let cancelled = false;
    const supabase = supabaseBrowser();
    (async () => {
      const local = readLocal();
      if (local.length) {
        const { error: mergeError } = await supabase
          .from("watchlist")
          .upsert(local.map((movie_id) => ({ user_id: user.id, movie_id })), { onConflict: "user_id,movie_id" });
        // Only clear the local copy once the merge is actually confirmed
        // saved server-side — otherwise a transient failure here would
        // silently wipe the only copy of someone's pre-signup watchlist.
        if (!mergeError) writeLocal([]);
      }
      const { data, error } = await supabase.from("watchlist").select("movie_id").eq("user_id", user.id);
      // On a failed read, leave `ids` as-is rather than overwriting it with
      // an empty list — a signed-in user's watchlist shouldn't appear to
      // vanish just because one Supabase request hiccupped.
      if (!cancelled && !error) setIds((data ?? []).map((r) => r.movie_id as string));
    })();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  const toggle = useCallback(
    (id: string): boolean => {
      const added = !ids.includes(id);

      if (!user) {
        const list = readLocal();
        const i = list.indexOf(id);
        if (i === -1) list.push(id); else list.splice(i, 1);
        writeLocal(list);
        setIds(list);
        return added;
      }

      // Optimistic update, reconciled below — the UI reflects the toggle
      // immediately, but if the Supabase write actually fails we roll it
      // back instead of leaving the on-screen state claiming a save that
      // never happened (the previous version fired these writes and never
      // checked the result at all).
      setIds((prev) => (added ? [...prev, id] : prev.filter((x) => x !== id)));
      const supabase = supabaseBrowser();
      const write = added
        ? supabase.from("watchlist").upsert({ user_id: user.id, movie_id: id }, { onConflict: "user_id,movie_id" })
        : supabase.from("watchlist").delete().eq("user_id", user.id).eq("movie_id", id);
      write.then(({ error }) => {
        if (!error) return;
        setIds((prev) => (added ? prev.filter((x) => x !== id) : (prev.includes(id) ? prev : [...prev, id])));
      });
      return added;
    },
    [ids, user]
  );

  const has = useCallback((id: string) => ids.includes(id), [ids]);
  return { ids, has, toggle, count: ids.length };
}
