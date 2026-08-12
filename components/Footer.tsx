import Link from "next/link";
import Icon from "./Icon";
import { supabasePublic } from "@/lib/supabase/public";
import { getSiteSettings } from "@/lib/data";

// Maps each icon to the matching key in Settings → social. Every icon here
// used to link to "#" regardless of what was saved in the dashboard — now
// only platforms the admin actually filled in are shown at all.
const SOCIAL: [string, string, string][] = [
  ["facebook", "fb", "#1877f2"], ["twitter", "tw", "#1da1f2"],
  ["instagram", "ig", "#e1306c"], ["youtube", "yt", "#ff0000"],
];

// Static fallbacks — used until you add real links in Dashboard → Menus & Footer,
// and always used if Supabase isn't configured yet. Terms/Privacy point at
// the real /p/ pages seeded by scripts/seed-legal-pages.mjs; Refund Policy
// has no page yet, so it stays a placeholder until one's written.
const FALLBACK_LEGAL: [string, string][] = [["Terms of Service", "/p/terms-of-service"], ["Privacy Policy", "/p/privacy-policy"], ["Refund Policy", "#"]];

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
  const fallbackSupport: [string, string][] = [
    ["Help Center", "#"],
    ["Contact Us", "/p/contact"],
    ["DMCA", "#"],
  ];
  const support = links?.support?.length ? links.support.map((l) => [l.label, l.url] as [string, string]) : fallbackSupport;
  const legal = links?.legal?.length ? links.legal.map((l) => [l.label, l.url] as [string, string]) : FALLBACK_LEGAL;
  const social = SOCIAL.map(([key, icon, bg]) => [icon, bg, settings.social[key]] as const).filter(([, , url]) => !!url);

  return (
    <footer className="footer">
      <div className="footer__in">
        <div className="footer__brand">
          <div className="brand__name">MOVIE<b style={{ color: "var(--purple2)" }}>X</b></div>
          <p>Your Entertainment Hub. Watch the latest movies and web series in HD quality.</p>
        </div>
        <div>
          <h4>Explore</h4>
          <Link href="/">Home</Link><Link href="/movies">Movies</Link><Link href="/web-series">Web Series</Link>
          <Link href="/blog">Blog</Link><Link href="/pricing">Pricing</Link><Link href="/p/about-us">About</Link>
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
            <h4>Connect With Us</h4>
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
        © 2024 MOVIEX. All rights reserved. · Demo project.
        <br />
        <span className="tmdb-attr">
          Movie &amp; TV data provided by{" "}
          <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDB</a>.
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </span>
      </div>
    </footer>
  );
}
