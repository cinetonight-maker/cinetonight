import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import { baseUrl } from "./site";
import {
  planFor, isEmptyPlan, inHomeGuides,
  type AdminAction, type RevalidationPlan,
} from "./revalidatePlan";

/* ============================================================================
 * lib/revalidateCms.ts — runs a revalidation plan after an explicit admin
 * Publish / Update / Trash / Restore.
 *
 * WHAT IT TOUCHES, AND NOTHING ELSE
 *
 *  1. Data cache — `revalidateTag("cms:blog")` etc. Those tags are attached to
 *     the Supabase reads in lib/supabase/public.ts, so exactly the queries
 *     behind the changed content are marked stale. TTLs are unchanged: a tag
 *     invalidation is a one-off signal, not a new expiry policy.
 *
 *  2. Route cache — `revalidatePath("/blog/<slug>")` etc. On Cloudflare this
 *     goes through the OpenNext tag cache (D1) and marks that ONE route's R2
 *     entry stale. Regeneration is lazy: it happens on the next request for
 *     that route and is de-duplicated globally by the existing Durable Object
 *     queue, so one publish causes one rebuild and one R2 write per route.
 *
 *  3. CDN edge cache — a SINGLE-FILE purge of the exact URLs, via Cloudflare's
 *     `purge_cache` API with a `files` list. This is available on every plan.
 *     Tag- and prefix-based purges (Enterprise-only) and "purge everything"
 *     are deliberately not used and cannot be produced by this code.
 *
 * WHAT IT NEVER TOUCHES: R2 key layout, TTL values, `enableCacheInterception`,
 * the incremental-cache override, the regional cache, or the revalidation
 * queue. Nothing in this file changes how a normal visitor request is served.
 *
 * FAILURE POLICY: revalidation is best-effort and time-boxed. The content is
 * already saved by the time this runs, so a slow or failing Cloudflare API
 * must never turn a successful save into an error the author sees. Every
 * outcome is reported back so the dashboard can say what actually happened.
 * ========================================================================= */

export interface RevalidationResult {
  plan: RevalidationPlan;
  /** "skipped" = nothing to do (draft-only change, or autosave). */
  status: "done" | "skipped" | "partial";
  cdn: "purged" | "not-configured" | "failed" | "skipped";
  /** Human-readable detail for the dashboard and the logs. */
  detail?: string;
}

const PURGE_TIMEOUT_MS = 3000;

/** Cloudflare single-file purge. Exact URLs only — never a wildcard, a prefix,
 *  a tag, or `purge_everything`. Max 30 URLs per call; we send at most three. */
async function purgeUrls(urls: string[]): Promise<RevalidationResult["cdn"]> {
  if (urls.length === 0) return "skipped";
  const zone = process.env.CACHE_PURGE_ZONE_ID;
  const token = process.env.CACHE_PURGE_API_TOKEN;
  if (!zone || !token) return "not-configured";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PURGE_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`, {
      method: "POST",
      signal: controller.signal,
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ files: urls.slice(0, 30) }),
    });
    const body = (await res.json().catch(() => null)) as { success?: boolean } | null;
    return res.ok && body?.success ? "purged" : "failed";
  } catch {
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}

/** Run a plan. Safe to call with an empty plan — it does nothing at all. */
export async function runPlan(plan: RevalidationPlan): Promise<RevalidationResult> {
  if (isEmptyPlan(plan)) {
    return { plan, status: "skipped", cdn: "skipped", detail: "Nothing public changed." };
  }

  // `{ expire: 0 }` is the important part. Next 16's default profile opens a
  // stale-while-revalidate window, which would still hand the FIRST visitor
  // after a publish the old copy. Expiring immediately means the next request
  // renders the persisted version — which is exactly what an author expects
  // after pressing Publish. It applies only to the few tags listed in the
  // plan, so no other route's staleness behaviour changes.
  for (const tag of plan.tags) {
    try { revalidateTag(tag, { expire: 0 }); } catch { /* never fail a save over this */ }
  }
  for (const path of plan.paths) {
    try {
      revalidatePath(path);
      // Next records path revalidations as the tag `_N_T_<path>`; expiring
      // that tag outright gives the route cache the same "no stale window"
      // treatment the data cache gets above.
      revalidateTag(`_N_T_${path}`, { expire: 0 });
    } catch { /* ditto */ }
  }

  const cdn = await purgeUrls(plan.urls);
  return {
    plan,
    status: cdn === "failed" ? "partial" : "done",
    cdn,
    detail:
      cdn === "purged" ? "Cache cleared for the changed pages."
      : cdn === "not-configured" ? "Pages refreshed. The CDN edge copy will catch up on its own — set CACHE_PURGE_ZONE_ID and CACHE_PURGE_API_TOKEN to clear it instantly."
      : cdn === "failed" ? "Pages refreshed, but the CDN purge did not go through."
      : "Pages refreshed.",
  };
}

/** Convenience: build the plan for an action and run it.
 *
 *  THIS FUNCTION CANNOT THROW. It is called from inside the admin routes'
 *  try/catch, after the database write has already succeeded — so an exception
 *  escaping here would be reported to the author as "could not save", which
 *  would be a lie. Cache work failing must never turn a successful publish
 *  into a failed one. */
export async function revalidateForAction(action: AdminAction): Promise<RevalidationResult> {
  try {
    return await runPlan(planFor(action, baseUrl()));
  } catch (e) {
    console.error("[cinetonight] revalidation failed after a successful write:", e);
    return {
      plan: { tags: [], paths: [], urls: [] },
      status: "partial",
      cdn: "failed",
      detail: "Saved. The cache refresh did not run, so the live page may take a few minutes to catch up.",
    };
  }
}

export { planFor, inHomeGuides, type AdminAction };
