import Link from "next/link";
import Icon from "./Icon";
import { supabasePublic } from "@/lib/supabase/public";

const SOCIAL: [string, string][] = [["fb", "#1877f2"], ["tw", "#1da1f2"], ["ig", "#e1306c"], ["tg", "#0088cc"], ["yt", "#ff0000"]];

// Static fallbacks — used until you add real links in Dashboard → Menus & Footer,
// and always used if Supabase isn't configured yet.
const FALLBACK_SUPPORT: [string, string][] = [["Help Center", "#"], ["Contact Us", "#"], ["DMCA", "#"]];
const FALLBACK_LEGAL: [string, string][] = [["Terms of Service", "#"], ["Privacy Policy", "#"], ["Refund Policy", "#"]];

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
  const links = await getFooterLinks();
  const support = links?.support?.length ? links.support.map((l) => [l.label, l.url] as [string, string]) : FALLBACK_SUPPORT;
  const legal = links?.legal?.length ? links.legal.map((l) => [l.label, l.url] as [string, string]) : FALLBACK_LEGAL;

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
          <Link href="/blog">Blog</Link><Link href="/pricing">Pricing</Link>
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
        <div>
          <h4>Connect With Us</h4>
          <div className="social">
            {SOCIAL.map(([n, bg]) => <a key={n} href="#" style={{ background: bg }} aria-label={n}><Icon name={n} size={16} /></a>)}
          </div>
        </div>
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
