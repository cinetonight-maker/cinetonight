import type { Metadata } from "next";
import Link from "next/link";
import { getSiteSettings } from "@/lib/data";
import { baseUrl } from "@/lib/site";

const TITLE = "Follow CineTonight — Daily Picks, Trailers & OTT Updates";
const DESCRIPTION =
  "Follow CineTonight on Instagram, YouTube, TikTok, Facebook and Telegram for daily what-to-watch picks, trailers, Top 10s and new OTT release updates.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${baseUrl()}/follow` },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: `${baseUrl()}/follow` },
};
export const dynamic = "force-dynamic";

/** What each platform gives a follower — the reason to tap Follow, not
 *  just a wall of icons. Only platforms with a saved URL render. Logos are
 *  self-hosted official-style SVGs in public/social-logos/. */
const PLATFORMS: { key: string; logo: string; name: string; color: string; handle: string; gives: string; cta: string }[] = [
  { key: "instagram", logo: "instagram", name: "Instagram", color: "#d6249f", handle: "@cinetonight", gives: "Daily picks, posters and reels: what to watch tonight, in 30 seconds of scrolling.", cta: "Follow" },
  { key: "youtube", logo: "youtube", name: "YouTube", color: "#FF0000", handle: "@cinetonight", gives: "Trailers, Top 10 countdowns and weekly new-on-OTT roundups.", cta: "Subscribe" },
  { key: "tiktok", logo: "tiktok", name: "TikTok", color: "#FE2C55", handle: "@cine.tonight", gives: "Quick clips and countdowns: the fastest way to find your next watch.", cta: "Follow" },
  { key: "facebook", logo: "facebook", name: "Facebook", color: "#1877F2", handle: "CineTonight", gives: "New OTT release alerts and weekend watchlists for the family.", cta: "Follow" },
  { key: "telegram", logo: "telegram", name: "Telegram", color: "#229ED9", handle: "@cinetonight", gives: "One message a day: tonight's pick plus anything big that just dropped.", cta: "Join" },
  { key: "twitter", logo: "x", name: "X", color: "#444455", handle: "@cinetonight", gives: "Release news and hot takes as they happen.", cta: "Follow" },
];

export default async function FollowPage() {
  const { social } = await getSiteSettings();
  const cards = PLATFORMS.filter((p) => social[p.key]);

  return (
    <div className="page">
      <div className="crumb">
        <Link href="/">Home</Link><span className="sep">›</span>
        <span className="cur">Follow Us</span>
      </div>
      <div className="page__head">
        <h1>Follow CineTonight</h1>
        <p>
          The site answers &quot;what should I watch tonight?&quot; whenever you visit. Our socials
          bring the answer to you: pick the platform you already open every day.
        </p>
      </div>

      <div className="follow__grid">
        {cards.map((p) => (
          <a key={p.key} className="follow__card" href={social[p.key]} target="_blank" rel="noopener noreferrer"
            style={{ borderColor: `color-mix(in srgb, ${p.color} 32%, var(--line))` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny self-hosted brand SVG */}
            <img className="follow__logo" src={`/social-logos/${p.logo}.svg`} alt={`${p.name} logo`} loading="lazy" />
            <span className="follow__body">
              <span className="follow__name">{p.name} <span className="follow__handle">{p.handle}</span></span>
              <span className="follow__gives">{p.gives}</span>
            </span>
            <span className="follow__cta" style={{ background: p.color }}>{p.cta}</span>
          </a>
        ))}
      </div>

      <p className="follow__note">
        Prefer email? Use the &quot;Never miss a premiere&quot; box in the sidebar on any page and
        weekly picks land in your inbox. Questions or suggestions: <Link href="/contact">contact us</Link>.
      </p>
    </div>
  );
}
