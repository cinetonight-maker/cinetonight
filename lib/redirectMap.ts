import "server-only";
import { cache } from "react";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { supabasePublic, PUBLIC_TTL } from "./supabase/public";
import { resolveRedirect, isPermanent, type RedirectStatus } from "./redirects";

/* ============================================================================
 * lib/redirectMap.ts — the request-path half of the Redirect Manager.
 *
 * WHERE THIS RUNS: in the page, on the not-found branch only. A request for a
 * page that exists never reaches this file, so the redirect system costs
 * nothing on the happy path. Middleware is deliberately untouched — it runs on
 * every request on the site, and a redirect only ever matters for a URL that
 * was going to 404 anyway.
 *
 * WHY IT CANNOT BE SPRAYED: ONE query, ONE cache key, whatever garbage path is
 * requested. Never query per-path — a per-path query embeds the caller's string
 * in the Supabase fetch URL, and every unique fetch URL is a fresh data-cache
 * write. That is the trap app/[slug]/page.tsx documents for publishedSlugs(),
 * and the redirect table is exposed to exactly the same unbounded input.
 * ========================================================================= */

type Rules = Map<string, { to: string; status: RedirectStatus }>;

const EMPTY: Rules = new Map();

/**
 * Every enabled rule, as one cached read.
 *
 * TTL is the `stable` (24h) tier, and it must stay there. Next takes the
 * MINIMUM of a route's revalidate and every fetch inside it, so putting this on
 * a shorter tier would drag /free-movies/[slug] from a day down to that tier —
 * the exact regression that hit /discover in Stage 6, worth 48× more R2 writes.
 * The `cms:redirects` tag is what makes a publish appear immediately; the TTL
 * is only the quiet-period fallback.
 */
const redirectRules = cache(async (): Promise<Rules> => {
  try {
    const sb = supabasePublic(PUBLIC_TTL.stable, ["cms:redirects"]);
    if (!sb) return EMPTY;
    const { data, error } = await sb
      .from("redirects")
      .select("from_path, to_path, status")
      .eq("enabled", true);
    // A missing table is the normal state until supabase/redirects.sql is run.
    // It must look exactly like "no rules", never like an error.
    if (error || !data) return EMPTY;
    return new Map(
      (data as { from_path: string; to_path: string; status: number }[])
        .map((r) => [r.from_path, { to: r.to_path, status: r.status as RedirectStatus }]),
    );
  } catch {
    return EMPTY;
  }
});

/**
 * The one call every route that can 404 should make instead of `notFound()`.
 *
 * Either redirects (and never returns) or calls notFound() (and never returns).
 * Typed `never` so a caller cannot accidentally continue rendering after it.
 *
 * FAIL OPEN: any problem reading the table results in a normal 404, exactly as
 * before this feature existed. A broken redirect table must never be able to
 * turn into a broken site.
 */
export async function redirectOrNotFound(requestPath: string): Promise<never> {
  let hit: { to: string; status: RedirectStatus } | null = null;
  try {
    const rules = await redirectRules();
    const r = resolveRedirect(rules, requestPath);
    if (r.match && r.to && r.status) hit = { to: r.to, status: r.status };
  } catch {
    hit = null;
  }

  if (hit) {
    // Next's own helpers, so the framework emits a real HTTP redirect rather
    // than a rendered page. Verified as a genuine 308/307 in the Cloudflare
    // Worker — which only became true once 4B-1 moved the Suspense boundaries
    // off these routes. A loading.tsx must never be reintroduced on a route
    // that calls this, or the redirect silently becomes a 200 again.
    if (isPermanent(hit.status)) permanentRedirect(hit.to);
    redirect(hit.to);
  }

  notFound();
}
