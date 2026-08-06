import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { WebSocket } from "ws";

/**
 * Session-aware Supabase client for Server Components / Route Handlers.
 * Reads the logged-in admin's session from cookies and respects RLS (uses
 * the publishable key, not the secret key). Use this to check "is someone
 * logged in?" — use `supabaseAdmin()` for the actual privileged reads/writes
 * once that check has passed.
 */
export function supabaseServer() {
  const cookieStore = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;

  return createServerClient(url, key, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      // Server Components can't set cookies (Next.js will throw) — middleware
      // handles the actual session refresh/write. Route Handlers CAN set
      // cookies; this no-op keeps the same client usable in both contexts
      // without callers needing to know which one they're in.
      set() {},
      remove() {},
    },
    // Node < 22 has no global WebSocket, and supabase-js's realtime client
    // throws at construction time without one — see lib/supabase/admin.ts.
    realtime: { transport: WebSocket as any },
    // See lib/supabase/admin.ts — stop Next.js's fetch cache from ever
    // serving a stale Supabase response.
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }) },
  });
}
