"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowser } from "./supabase/client";

interface AuthState {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true });

/** Single source of truth for "who's signed in", shared by Header (account
 *  icon), lib/watchlist.ts (local vs. real backend), and the recently-viewed
 *  tracking on movie pages — one subscription to Supabase's auth state
 *  instead of every consumer running its own. Mounted once in the root
 *  layout, wrapping the whole app. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    const supabase = supabaseBrowser();
    let cancelled = false;

    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setState({ user: data.user, loading: false });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ user: session?.user ?? null, loading: false });
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
