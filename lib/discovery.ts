import "server-only";
import { cache } from "react";
import { supabasePublic, PUBLIC_TTL } from "./supabase/public";
import { normalizeConfig, DEFAULT_CONFIG, type DiscoveryConfig } from "./discoveryConfig";

/** The LIVE discovery configuration — which moods, quick picks and Explore
 *  tabs are offered, in what order, and the Tonight's Pick rules.
 *
 *  Same three guarantees as lib/homepage.ts:
 *
 *  1. `live_config` only. The draft column is never read by public code, so an
 *     unpublished edit cannot reach a visitor.
 *  2. Falls back to the shipped default on ANY problem. A configuration fault
 *     can never empty the mood picker.
 *  3. Tagged `cms:discovery`, so Publish refreshes it immediately instead of
 *     waiting out the TTL. Adds one small query — no TMDB call, no extra work
 *     on the recommendation engine.
 *
 *  WHY THE 24-HOUR TIER, NOT 30 MINUTES: Next sets a route's effective
 *  revalidate to the MINIMUM of its own setting and every fetch inside it.
 *  On the 30-minute tier this read dragged /discover from a 1-day ceiling down
 *  to 30 minutes — 48x more R2 writes on that route, for a value that only
 *  changes when someone presses Publish. The tag is what makes a publish
 *  appear immediately; the TTL is only the quiet-period fallback. This keeps
 *  the Phase 1 cache tiers exactly as they were. */
export const getDiscoveryConfig = cache(async (): Promise<DiscoveryConfig> => {
  try {
    const sb = supabasePublic(PUBLIC_TTL.stable, ["cms:discovery"]);
    if (!sb) return DEFAULT_CONFIG;
    const { data, error } = await sb.from("discovery_config").select("live_config").eq("id", 1).maybeSingle();
    if (error || !data?.live_config) return DEFAULT_CONFIG;
    return normalizeConfig(data.live_config);
  } catch {
    return DEFAULT_CONFIG;
  }
});
