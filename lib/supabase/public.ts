import "server-only";
import { createClient } from "@supabase/supabase-js";
import { WebSocket } from "ws";

/**
 * Anonymous, read-only Supabase client for Server Components and Route
 * Handlers. It only ever sees what your RLS "public SELECT" policies allow
 * (published pages, approved comments, nav links, site settings). Never put
 * secret-only data behind this client. Server-only — if you need this data
 * in a Client Component, fetch it in a Server Component and pass it down as
 * props instead of importing this file directly into "use client" code.
 */
let cached: ReturnType<typeof createClient<any, any, any>> | null = null;

export function supabasePublic() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  cached = createClient<any, any, any>(url, key, {
    auth: { persistSession: false },
    // See lib/supabase/admin.ts — same Node-without-WebSocket fix.
    realtime: { transport: WebSocket as any },
  });
  return cached;
}
