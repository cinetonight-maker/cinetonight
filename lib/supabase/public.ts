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
 *
 * Every read through this client is verified read-only across the codebase
 * (only ever `.select()`, never insert/update/delete/upsert — writes go
 * through lib/supabase/admin.ts instead), so unlike that admin client and
 * lib/supabase/server.ts's per-user session client (both of which
 * legitimately need every read to be live), this one is safe to cache: a
 * public visitor doesn't need database-fresh data on every single
 * pageview, just data that's not more than about a minute old. Without
 * this, the root layout's getSiteSettings() call alone meant EVERY page
 * view of the entire site did a fresh, uncached Supabase round trip.
 * `next.revalidate` here is an explicit per-fetch-call option, which Next
 * respects even on routes that keep `export const dynamic =
 * "force-dynamic"` for unrelated (per-user) reasons — see
 * https://nextjs.org/docs/app/building-your-application/caching#fetch — so
 * this alone fixes the caching gap without needing to touch every page's
 * dynamic/revalidate export.
 *
 * ---------------------------------------------------------------------
 * WHY THIS NUMBER IS 1800 AND NOT 60  (read before changing it)
 *
 * Next sets a route's effective revalidate to the MINIMUM of its segment
 * `export const revalidate` and every fetch inside it. The root layout calls
 * getSiteSettings() through this client, so this value applied to EVERY page
 * on the site. At 60 it silently overrode every longer TTL we had set —
 * `/movie/[id]` was configured for 3 days and was actually re-rendering (and
 * re-writing its R2 cache entry) once a minute. That is a Class A write per
 * route per minute of crawler traffic, which is exactly the bill we have been
 * trying to bring down. The build output made it visible: every single route
 * printed "1m" in the Revalidate column.
 *
 * 1800 (30 minutes) is the compromise. Site settings, nav links and published
 * pages change rarely, so half an hour of staleness is invisible to visitors,
 * while the forced rewrite rate drops 30x.
 *
 * There is deliberately NO revalidateTag() path here. On Cloudflare that needs
 * an OpenNext tag cache (D1 or a sharded Durable Object), which is more
 * infrastructure and more cost than the problem justifies right now. A deploy
 * busts everything instantly anyway, because the cache key includes
 * OPEN_NEXT_BUILD_ID. See docs/CACHING.md.
 * ---------------------------------------------------------------------
 */
const PUBLIC_READ_TTL = 1800;
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
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, next: { revalidate: PUBLIC_READ_TTL } }) },
  });
  return cached;
}
