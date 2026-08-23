import "server-only";
import { cache } from "react";
import { supabasePublic, PUBLIC_TTL } from "./supabase/public";
import { normalizeConfig, DEFAULT_CONFIG, type HomepageConfig } from "./homepageConfig";

/** The LIVE homepage configuration.
 *
 *  Three deliberate properties:
 *
 *  1. It selects `live_config` and nothing else. The draft column is never
 *     read by public code, so an unpublished edit cannot reach a visitor.
 *  2. It falls back to DEFAULT_CONFIG on any problem — table missing, row
 *     empty, Supabase unreachable. A configuration fault can slow the site
 *     down; it can never blank the homepage.
 *  3. It is tagged `cms:homepage`, so pressing Publish refreshes it
 *     immediately instead of waiting out the TTL (lib/revalidateCms.ts).
 *     The TTL tier itself is unchanged. */
export const getHomepageConfig = cache(async (): Promise<HomepageConfig> => {
  try {
    const sb = supabasePublic(PUBLIC_TTL.stable, ["cms:homepage"]);
    if (!sb) return DEFAULT_CONFIG;
    const { data, error } = await sb.from("homepage_config").select("live_config").eq("id", 1).maybeSingle();
    if (error || !data?.live_config) return DEFAULT_CONFIG;
    return normalizeConfig(data.live_config);
  } catch {
    return DEFAULT_CONFIG;
  }
});
