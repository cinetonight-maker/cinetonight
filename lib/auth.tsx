"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true });

/** Fired by the sign-in/sign-up forms after a successful auth call, so this
 *  provider (which does NOT remount on soft navigations) knows to connect. */
export const AUTH_EVENT = "cinetonight:auth";

/** Is there any evidence of a Supabase session on this browser?
 *  @supabase/ssr's browser client keeps its session in cookies named
 *  `sb-<project-ref>-auth-token` (sometimes chunked with .0/.1 suffixes). */
const hasAuthCookie = () =>
  typeof document !== "undefined" && /(?:^|;\s*)sb-[^=]*-auth-token/.test(document.cookie);

/** Single source of truth for "who's signed in", shared by Header (account
 *  icon), lib/watchlist.ts (local vs. real backend), and the recently-viewed
 *  tracking on movie pages — one subscription to Supabase's auth state
 *  instead of every consumer running its own. Mounted once in the root
 *  layout, wrapping the whole app.
 *
 *  PERFORMANCE — why the import below is dynamic: this provider used to
 *  import supabase-js statically, which put the ENTIRE browser SDK (GoTrue +
 *  Realtime + Postgrest, the bulk of a ~250 KB shared chunk) into the
 *  first-load JS of every page for every visitor — almost none of whom ever
 *  sign in. Now the SDK is code-split and only fetched when an auth cookie
 *  actually exists (or the moment a sign-in succeeds, via AUTH_EVENT). An
 *  anonymous visitor downloads none of it. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    let connected = false;

    const connect = () => {
      if (connected) return;
      connected = true;
      import("./supabase/client").then(({ supabaseBrowser }) => {
        if (cancelled) return;
        const supabase = supabaseBrowser();
        supabase.auth.getUser().then(({ data }) => {
          if (!cancelled) setState({ user: data.user, loading: false });
        });
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
          if (!cancelled) setState({ user: session?.user ?? null, loading: false });
        });
        unsub = () => sub.subscription.unsubscribe();
      });
    };

    if (hasAuthCookie()) connect();
    else setState({ user: null, loading: false });

    // A sign-in on /signin is a soft navigation — this provider never
    // remounts — so the form announces success and we connect then.
    window.addEventListener(AUTH_EVENT, connect);
    return () => {
      cancelled = true;
      unsub?.();
      window.removeEventListener(AUTH_EVENT, connect);
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
