import Link from "next/link";
import Icon from "./Icon";
import { supabasePublic } from "@/lib/supabase/public";
import { getSiteSettings } from "@/lib/data";
import BrandMark from "@/components/BrandMark";

// Maps each icon to the matching key in Settings → social. Every icon here
// used to link to "#" regardless of what was saved in the dashboard — now
// only platforms the admin actually filled in are shown at all.
const SOCIAL: [string, string, string][] = [
  ["facebook", "fb", "#1877f2"], ["twitter", "tw", "#1da1f2"],
  ["instagram", "ig", "#e1306c"], ["youtube", "yt", "#ff0000"],
  ["tiktok", "tiktok", "#111111"], ["telegram", "telegram", "#229ED9"],
];

// Static fallbacks — used until you add real links in Dashboard → Menus & Footer,
// and always used if Supabase isn't configured yet. Terms/Privacy point at
// the real pages seeded by scripts/seed-legal-pages.mjs; Refund Policy
// has no page yet, so it stays a placeholder until one's written.
const FALLBACK_LEGAL: [string, string][] = [["Terms of Service", "/terms-of-service"], ["Privacy Policy", "/privacy-policy"]];

type NavLink = { label: string; url: string; is_external: boolean };

async function getFooterLinks() {
  const supabase = supabasePublic();
  if (!supabase) return null;
  const { data } = await supabase
    .from("nav_links")
    .select("location, label, url, sort_order, is_external")
    .in("location", ["footer_support", "footer_legal"])
    .order("sort_order");
  if (!data) return null;
  return {
    support: data.filter((l) => l.location === "footer_support") as NavLink[],
    legal: data.filter((l) => l.location === "footer_legal") as NavLink[],
  };
}

export default async function Footer() {
  const [links, settings] = await Promise.all([getFooterLinks(), getSiteSettings()]);
  // "Contact Us" now points at the real Contact page (seeded by
  // scripts/seed-legal-pages.mjs) instead of a raw mailto — falls back to
  // mailto if Settings → Contact email is set but the page hasn't been
  // seeded yet, and to "#" if neither exists (still overridden by a real
  // nav_link if one's been added under Menus & Footer).
  // Every fallback link goes somewhere REAL — '#' links read as broken to
  // both users and crawlers. Help/DMCA both route to Contact (that's where
  // those requests are handled) until dedicated pages exist.
  const fallbackSupport: [string, string][] = [
    ["Help Center", "/contact"],
    ["Contact Us", "/contact"],
    ["DMCA", "/contact"],
  ];
  const support = links?.support?.length ? links.support.map((l) => [l.label, l.url] as [string, string]) : fallbackSupport;
  const legal = links?.legal?.length ? links.legal.map((l) => [l.label, l.url] as [string, string]) : FALLBACK_LEGAL;
  const social = SOCIAL.map(([key, icon, bg]) => [icon, bg, settings.social[key]] as const).filter(([, , url]) => !!url);

  return (
    <footer className="footer">
      <div className="footer__in">
        <div className="footer__brand">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><BrandMark size={26} /><div className="brand__name">Cine<b style={{ color: "var(--purple2)" }}>Tonight</b></div></div>
          <p>Your nightly guide to what's worth watching. Play the trailer, check the ratings, and see exactly where every movie and show streams in your country.</p>
        </div>
        <div>
          <h4>Explore</h4>
          <Link href="/">Home</Link><Link href="/movies">Movies</Link><Link href="/web-series">Web Series</Link>
          <Link href="/free-movies">Free Movies</Link><Link href="/blog">Blog</Link><Link href="/follow">Follow Us</Link><Link href="/about-us">About</Link>
        </div>
        <div>
          <h4>Support</h4>
          <Link href="/signin">Sign In</Link>
          {support.map(([label, url]) => <a key={label} href={url}>{label}</a>)}
        </div>
        <div>
          <h4>Legal</h4>
          {legal.map(([label, url]) => <a key={label} href={url}>{label}</a>)}
        </div>
        {social.length > 0 && (
          <div>
            <h4><Link href="/follow" style={{ color: "inherit" }}>Connect With Us</Link></h4>
            <div className="social">
              {social.map(([n, bg, url]) => (
                <a key={n} href={url} target="_blank" rel="noopener noreferrer" style={{ background: bg }} aria-label={n}>
                  <Icon name={n} size={16} />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="footer__copy">
        © {new Date().getFullYear()} CineTonight. All rights reserved.
        <br />
        <span className="tmdb-attr">
          Posters, ratings and title details are powered by{" "}
          <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDB</a>, with thanks to their community.
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </span>
      </div>
    </footer>
  );
}
