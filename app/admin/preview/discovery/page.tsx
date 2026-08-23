import Link from "next/link";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  normalizeConfig, enabledMoods, enabledQuickPicks, enabledExploreTabs,
  describeConfig, RULE_SUMMARY, DEFAULT_CONFIG,
} from "@/lib/discoveryConfig";

/* The DRAFT discovery experience, read straight from the database with no
 * caching. Structure preview, for the same reason as the homepage one: it
 * shows exactly what a visitor will be offered and in what order, without
 * firing the recommendation engine's TMDB workload on every preview. */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Discovery preview", robots: { index: false, follow: false } };

export default async function DiscoveryPreview() {
  let draft = DEFAULT_CONFIG, live = DEFAULT_CONFIG, missing = false;
  try {
    const { data } = await supabaseAdmin().from("discovery_config").select("*").eq("id", 1).maybeSingle();
    live = normalizeConfig(data?.live_config ?? DEFAULT_CONFIG);
    draft = normalizeConfig(data?.draft_config ?? data?.live_config ?? DEFAULT_CONFIG);
  } catch { missing = true; }

  const changed = JSON.stringify(live) !== JSON.stringify(draft);
  const t = draft.tonight;

  return (
    <div className="ad__body ad__body--one">
      <div className="ad__notice">
        <div>
          <b>Draft preview</b> — read from the database right now, with no caching.
          {missing
            ? " The Discovery Manager table is not set up yet, so this is the shipped default."
            : changed
              ? " This is NOT what visitors see: it is your unpublished draft."
              : " Your draft is identical to what is live."}
        </div>
        <div className="ad__actions">
          <Link className="ad__mini" href="/admin/discovery">Back to Discovery</Link>
          <a className="ad__mini" href="/discover" target="_blank" rel="noreferrer">Open live Discover</a>
        </div>
      </div>

      <div className="ad__panel">
        <p className="ad__hintline">{describeConfig(draft)}</p>

        <h3 className="ad__h3">Mood picker, in order</h3>
        <div className="dscchips" style={{ marginBottom: 18 }}>
          {enabledMoods(draft).map((id) => (
            <span className="dscchip" key={id} title={RULE_SUMMARY.moods[id]}>
              {draft.moods.entries[id].icon} {draft.moods.entries[id].label}
            </span>
          ))}
        </div>

        <h3 className="ad__h3">Quick Picks, in order</h3>
        <div className="dscgrid" style={{ marginBottom: 18 }}>
          {enabledQuickPicks(draft).map((id) => (
            <div className="dsc" key={id}>
              <div className="dsc__t">{draft.quickPicks.entries[id].label}</div>
              <div className="dsc__s">{draft.quickPicks.entries[id].sub}</div>
            </div>
          ))}
        </div>

        <h3 className="ad__h3">Explore Tonight tabs</h3>
        <div className="dscchips" style={{ marginBottom: 18 }}>
          {enabledExploreTabs(draft).map((id) => (
            <span className={`dscchip${id === draft.explore.defaultTab ? " on" : ""}`} key={id}>
              {draft.explore.entries[id].label}{id === draft.explore.defaultTab ? " · opens first" : ""}
            </span>
          ))}
        </div>

        <h3 className="ad__h3">Tonight&rsquo;s Pick rules</h3>
        <p className="ov__empty">
          {t.preferMood === "any" && t.minRating === 0 && t.kind === "any"
            ? "Open to everything — the engine picks freely."
            : [
                t.preferMood === "any" ? null : `Leans towards ${draft.moods.entries[t.preferMood].label}`,
                t.minRating > 0 ? `rating ${t.minRating} and above` : null,
                t.kind === "any" ? null : t.kind === "movie" ? "films only" : "series only",
              ].filter(Boolean).join(" · ")}
        </p>
      </div>
    </div>
  );
}
