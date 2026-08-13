"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";

export const NAV: { icon: string; label: string; href: string; top?: boolean; bottom?: boolean; short?: string }[] = [
  { icon: "home", label: "Home", href: "/", top: true, bottom: true },
  { icon: "film", label: "Movies", href: "/movies", top: true, bottom: true },
  { icon: "search", label: "Search", href: "/search", bottom: true },
  { icon: "monitor", label: "Web Series", href: "/web-series", top: true, bottom: true, short: "Series" },
  // TV Shows & Genres deliberately have no `top` flag — removed from the
  // header nav to keep it tight (still reachable via sidebar + mobile drawer).
  { icon: "tv", label: "TV Shows", href: "/tv-shows" },
  { icon: "grid", label: "Genres", href: "/genres" },
  { icon: "trend", label: "Trending", href: "/trending", top: true },
  { icon: "sparkle", label: "Latest", href: "/latest" },
  { icon: "playc", label: "Free Movies", href: "/free-movies", top: true, short: "Free" },
  { icon: "article", label: "Blog", href: "/blog", top: true },
  { icon: "bookmark", label: "My List", href: "/my-list", bottom: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <aside className="sidebar">
      <nav>
        {NAV.map((n) => (
          <Link key={n.href} className={`nav-item${active(n.href) ? " on" : ""}`} href={n.href} title={n.label}>
            <span className="nav-item__ico"><Icon name={n.icon} size={18} /></span>
            <span className="nav-item__label">{n.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
