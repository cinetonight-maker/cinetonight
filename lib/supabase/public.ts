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
 * ON-DEMAND INVALIDATION (added Aug 2026, Stage 4.5)
 *
 * These TTLs are unchanged and still govern quiet periods. What changed is
 * that a read can now carry TAGS, so an explicit admin Publish/Update can mark
 * exactly the affected queries stale instead of leaving a saved change
 * invisible for up to its TTL. Tags cost nothing on the read path: a fetch
 * without tags behaves precisely as before.
 *
 * On Cloudflare this needs an OpenNext tag cache, which is now configured
 * (D1, `NEXT_TAG_CACHE_D1`) and FILTERED to the handful of tags this project
 * actually revalidates — see lib/revalidatePlan.ts and open-next.config.ts.
 * Every untagged read, and every route we never invalidate, is untouched.
 * A deploy still busts everything instantly via OPEN_NEXT_BUILD_ID.
 * See docs/CACHING.md and docs/CMS-REVALIDATION.md.
 * ---------------------------------------------------------------------
 */
/* TIERED public-read TTLs - the layout-ceiling fix.
 *
 * Next sets a route's EFFECTIVE revalidate to the minimum of its segment
 * `export const revalidate` and every fetch inside it, INCLUDING fetches in
 * the root layout. One blanket 1800s TTL here therefore capped every route
 * on the site at 30 minutes - a movie page configured for 3 days was
 * re-rendering (and re-writing its R2 entry) every 30 minutes, because the
 * layout's site-settings read expired. Different public data now rides a
 * TTL matched to how often it actually changes:
 *
 *   stable    86400 (24h)  site settings, nav/footer links, classics,
 *                          custom-page slugs - branding-level data that
 *                          changes a few times a month at most. This is the
 *                          new effective ceiling for long-lived routes.
 *   catalogue 21600 (6h)   the movies table - the daily sync adds a handful
 *                          of titles; 6h staleness is invisible.
 *   default    1800 (30m)  blog reads and home_config - the surfaces where
 *                          an admin edit or a scheduled post should appear
 *                          within half an hour.
 *
 * A deploy still invalidates everything instantly (build-ID cache key), so
 * these ceilings only govern quiet periods between deploys. */
export const PUBLIC_TTL = { stable: 86400, catalogue: 21600, default: 1800 } as const;
type PublicTtl = (typeof PUBLIC_TTL)[keyof typeof PUBLIC_TTL];
const cached = new Map<string, ReturnType<typeof createClient<any, any, any>>>();

/**
 * @param ttl   freshness tier (see above) — unchanged behaviour.
 * @param tags  optional cache tags for on-demand invalidation. Pass these ONLY
 *              for data an admin action can change (blog, pages). Omitting
 *              them is the default and keeps a read exactly as it was.
 */
export function supabasePublic(ttl: PublicTtl = PUBLIC_TTL.default, tags?: readonly string[]) {
  // The client is memoised per (ttl, tags) pair, because the tags are baked
  // into its fetch wrapper.
  const cacheKey = `${ttl}|${tags?.join(",") ?? ""}`;
  const hit = cached.get(cacheKey);
  if (hit) return hit;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const next = tags?.length ? { revalidate: ttl, tags: [...tags] } : { revalidate: ttl };
  const client = createClient<any, any, any>(url, key, {
    auth: { persistSession: false },
    // See lib/supabase/admin.ts — same Node-without-WebSocket fix.
    realtime: { transport: WebSocket as any },
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, next }) },
  });
  cached.set(cacheKey, client);
  return client;
}
