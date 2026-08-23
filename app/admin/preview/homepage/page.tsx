import Link from "next/link";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig, visibleSections, SECTION_META, DEFAULT_CONFIG } from "@/lib/homepageConfig";

/* ============================================================================
 * /admin/preview/homepage — the DRAFT homepage, read straight from the
 * database with no caching at any layer.
 *
 * HONEST ABOUT WHAT IT IS: this is a STRUCTURE preview, not a pixel-perfect
 * render. It shows exactly which sections will appear, in what order, with
 * the headings and counts you set. It does not re-render the real rails,
 * because doing so would fire the homepage's whole TMDB and Supabase workload
 * on every preview — the opposite of what the data budget in app/page.tsx
 * exists to protect.
 *
 * The parts that a pixel preview would tell you and this does not are the
 * parts you cannot change here anyway: the artwork and the card layout.
 * ========================================================================= */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Homepage preview", robots: { index: false, follow: false } };

export default async function HomepagePreview() {
  let draft = DEFAULT_CONFIG;
  let live = DEFAULT_CONFIG;
  let missing = false;
  try {
    const { data } = await supabaseAdmin().from("homepage_config").select("*").eq("id", 1).maybeSingle();
    live = normalizeConfig(data?.live_config ?? DEFAULT_CONFIG);
    draft = normalizeConfig(data?.draft_config ?? data?.live_config ?? DEFAULT_CONFIG);
  } catch { missing = true; }

  const visible = visibleSections(draft);
  const changed = JSON.stringify(live) !== JSON.stringify(draft);

  return (
    <div className="ad__body ad__body--one">
      <div className="ad__notice">
        <div>
          <b>Draft preview</b> — read from the database right now, with no caching.
          {missing
            ? " The Homepage Manager table is not set up yet, so this is the shipped default."
            : changed
              ? " This is NOT what visitors see: it is your unpublished draft."
              : " Your draft is identical to the live homepage."}
        </div>
        <div className="ad__actions">
          <Link className="ad__mini" href="/admin/homepage">Back to Homepage</Link>
          <a className="ad__mini" href="/" target="_blank" rel="noreferrer">Open the live homepage</a>
        </div>
      </div>

      <div className="ad__panel">
        <div className="hpmp">
          <div className="hpmp__locked">
            <span className="hpmp__lock">Fixed</span>
            <b>Hero question</b>
            <span>{draft.hero.picks.length ? `${draft.hero.picks.length} chosen title${draft.hero.picks.length === 1 ? "" : "s"} for the artwork` : "Artwork picked automatically from what is trending"}</span>
          </div>
          <div className="hpmp__locked">
            <span className="hpmp__lock">Fixed</span>
            <b>Quick Picks, moods and tonight&rsquo;s recommendation</b>
            <span>The decision engine — locked by the site design</span>
          </div>

          {visible.map((id, i) => {
            const meta = SECTION_META[id];
            const s = draft.sections[id];
            return (
              <div className="hpmp__sec" key={id}>
                <span className="hpmp__num">{i + 1}</span>
                <div>
                  <b>{s.title ?? meta.label}</b>
                  {s.sub && <span>{s.sub}</span>}
                  {!s.sub && <span>{meta.what}</span>}
                  {s.count && <em>{s.count} {meta.count?.unit}</em>}
                </div>
              </div>
            );
          })}

          {visible.length === 0 && (
            <div className="ad__empty">Every section is switched off — the page would end after the picker.</div>
          )}
        </div>
      </div>
    </div>
  );
}
