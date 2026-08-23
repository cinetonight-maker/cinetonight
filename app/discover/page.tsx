import Link from "next/link";
import type { Metadata } from "next";
import Icon from "@/components/Icon";
// MOODS is no longer read here — which moods appear comes from the dashboard
// config; lib/moods.ts still owns the ids and the genre rules.
import { QUICK_PICKS } from "@/lib/quickPicks";
import { getDiscoveryConfig } from "@/lib/discovery";
import { enabledMoods, enabledQuickPicks } from "@/lib/discoveryConfig";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { baseUrl } from "@/lib/site";

/** Discover hub — Phase 3 (§21).
 *
 *  A small, fully static launchpad that gives the future discovery
 *  architecture a home WITHOUT building the future pages yet: today every
 *  tile routes to an EXISTING controlled page (browse routes, /genres,
 *  /free-movies) or to the homepage picker anchored at #tonights-pick.
 *  Future dedicated Mood pages, Right Now pages, Studio/Franchise pages and
 *  Movie Match slot in here later by swapping a tile's href — no homepage
 *  rewrite, no new layout.
 *
 *  COST: zero data fetches. Static config only, ISR-cached for a day (the
 *  "stable" tier — content changes only when this file changes). */
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Discover — Find Something to Watch Tonight",
  description:
    "Every way to find your next watch on CineTonight: by mood, by quick pick, by genre, by industry, or straight from tonight's trending list.",
  alternates: { canonical: "/discover" },
};

const WAYS: { icon: string; title: string; sub: string; href: string }[] = [
  { icon: "sparkle", title: "Pick For Me", sub: "One strong recommendation, chosen for tonight", href: "/#tonights-pick" },
  { icon: "film", title: "Movies", sub: "Browse films — trending, latest, top rated", href: "/movies" },
  { icon: "monitor", title: "Series", sub: "Browse series and web originals", href: "/web-series" },
  { icon: "grid", title: "Genres", sub: "Action to romance, every lane", href: "/genres" },
  { icon: "trend", title: "Trending Tonight", sub: "What the world is watching right now", href: "/trending" },
  { icon: "playc", title: "Free Classics", sub: "Full films you can legally watch free", href: "/free-movies" },
];

export default async function DiscoverPage() {
  // One small cached read, tagged `cms:discovery` so Publish refreshes this
  // page immediately. MOODS / QUICK_PICKS still supply the ids and rules; the
  // config only decides which are shown, their labels and their order.
  const disc = await getDiscoveryConfig();
  const moodChips = enabledMoods(disc).map((id) => ({
    id, label: disc.moods.entries[id].label!, icon: disc.moods.entries[id].icon!,
  }));
  const pickChips = enabledQuickPicks(disc).map((id) => ({
    id, label: disc.quickPicks.entries[id].label!,
    icon: QUICK_PICKS.find((q) => q.id === id)?.icon ?? "star",
  }));

  const crumbs = breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Discover" }]);
  return (
    <div className="page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs).replace(/</g, "\\u003c") }}
      />
      <section className="sec">
        <div className="sec__head">
          <div className="sec__titles">
            <h1 className="dsc__h">Discover</h1>
            <p className="sec__sub">Every way to answer &ldquo;what should I watch tonight?&rdquo;</p>
          </div>
        </div>
        <div className="dscgrid">
          {WAYS.map((w) => (
            <Link className="dsc" href={w.href} key={w.title}>
              <span className="dsc__ico"><Icon name={w.icon} size={20} /></span>
              <span className="dsc__t">{w.title}</span>
              <span className="dsc__s">{w.sub}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="sec">
        <div className="sec__head">
          <div className="sec__titles">
            <h2>By mood</h2>
            <p className="sec__sub">Tap a mood — the homepage picker takes it from there</p>
          </div>
        </div>
        <div className="dscchips">
          {/* Which moods are offered, their labels and order, come from the
              dashboard. The ids and the genre rules behind them do not — see
              lib/discoveryConfig.ts. */}
          {moodChips.map((m) => (
            <Link className="dscchip" href="/#tonights-pick" key={m.id}>
              <span aria-hidden="true">{m.icon}</span> {m.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="sec">
        <div className="sec__head">
          <div className="sec__titles">
            <h2>Quick picks</h2>
            <p className="sec__sub">One-tap starting points</p>
          </div>
        </div>
        <div className="dscchips">
          {pickChips.map((q) => (
            <Link className="dscchip" href="/#tonights-pick" key={q.id}>
              <Icon name={q.icon} size={14} /> {q.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
