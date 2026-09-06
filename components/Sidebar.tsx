"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";

export const NAV: { icon: string; label: string; href: string; top?: boolean; bottom?: boolean; side?: boolean; topOrder?: number; short?: string }[] = [
  // Phase 3 navigation (§19–20).
  //   top:    header nav — LOCKED order via topOrder:
  //           Movies, Series, Trending, Discover, Guides, My List
  //   side:   desktop icon sidebar — LOCKED: Home, Discover, Search,
  //           Movies, Series, My List (array order)
  //   bottom: mobile tab bar — Home, Movies, Search, Series, My List
  //   (no flags = reachable via the mobile drawer + footer only)
  // Visible label standard is "Series" (§19); the /tv-shows route keeps its
  // drawer label until the Phase 4 route/SEO consolidation.
  { icon: "home", label: "Home", href: "/", bottom: true, side: true },
  { icon: "compass", label: "Discover", href: "/discover", top: true, topOrder: 4, side: true },
  { icon: "search", label: "Search", href: "/search", bottom: true, side: true },
  { icon: "film", label: "Movies", href: "/movies", top: true, topOrder: 1, bottom: true, side: true },
  { icon: "monitor", label: "Series", href: "/web-series", top: true, topOrder: 2, bottom: true, side: true, short: "Series" },
  { icon: "trend", label: "Trending", href: "/trending", top: true, topOrder: 3 },
  { icon: "article", label: "Guides", href: "/blog", top: true, topOrder: 5 },
  { icon: "bookmark", label: "My List", href: "/my-list", top: true, topOrder: 6, bottom: true, side: true },
  // Drawer/footer-only destinations (kept fully reachable, off the chrome):
  { icon: "tv", label: "TV Shows", href: "/tv-shows" },
  { icon: "grid", label: "Genres", href: "/genres" },
  { icon: "sparkle", label: "Latest", href: "/latest" },
  { icon: "playc", label: "Free Movies", href: "/free-movies" },
  { icon: "sparkle", label: "Follow Us", href: "/follow" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const primary = NAV.filter((n) => n.side);
  // Rest of the site nav (Trending, Guides, TV Shows, Genres, ...) — hidden
  // via CSS while the rail is collapsed (body:not(.sb-expanded)) so the
  // narrow icon-only rail never grows past its curated primary set, and
  // shown once expanded so the drawer gives full parity with the mobile
  // nav drawer instead of stopping at 6 items.
  const rest = NAV.filter((n) => !n.side);
  return (
    <aside className="sidebar">
      <nav aria-label="Primary">
        {primary.map((n) => (
          <Link
            key={n.href}
            className={`nav-item${active(n.href) ? " on" : ""}`}
            href={n.href}
            title={n.label}
            aria-label={n.label}
            aria-current={active(n.href) ? "page" : undefined}
          >
            <span className="nav-item__ico"><Icon name={n.icon} size={18} /></span>
            <span className="nav-item__label">{n.label}</span>
          </Link>
        ))}
        {rest.length > 0 && <div className="nav-item__divider" aria-hidden="true" />}
        {rest.map((n) => (
          <Link
            key={n.href}
            className={`nav-item nav-item--extra${active(n.href) ? " on" : ""}`}
            href={n.href}
            title={n.label}
            aria-label={n.label}
            aria-current={active(n.href) ? "page" : undefined}
          >
            <span className="nav-item__ico"><Icon name={n.icon} size={18} /></span>
            <span className="nav-item__label">{n.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
