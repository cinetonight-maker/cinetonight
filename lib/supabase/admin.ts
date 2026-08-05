import "server-only";
import { createClient } from "@supabase/supabase-js";
import { WebSocket } from "ws";

/**
 * Service-role Supabase client — bypasses Row Level Security entirely.
 * SERVER-ONLY. Never import this file from a "use client" component or a
 * file that could end up in the browser bundle: the secret key it uses can
 * read and write every table regardless of RLS policy.
 *
 * Used exclusively inside `app/api/admin/**` route handlers, after the
 * caller's session has already been verified (see middleware.ts).
 */
// `any` here (no generated Database type exists for this project) keeps
// `.from("table")` permissive instead of collapsing every column to `never`.
let cached: ReturnType<typeof createClient<any, any, any>> | null = null;

export function supabaseAdmin() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Supabase admin client: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY are not set.");
  }
  cached = createClient<any, any, any>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    // Node < 22 (common on Vercel and most local dev machines) has no global
    // WebSocket, and supabase-js's realtime client throws at construction
    // time without one — even though we never use realtime. Give it the
    // `ws` package explicitly so client creation never fails.
    realtime: { transport: WebSocket as any },
  });
  return cached;
}
