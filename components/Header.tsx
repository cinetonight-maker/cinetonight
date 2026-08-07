"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import Icon from "./Icon";
import { useWatchlist } from "@/lib/watchlist";
import { NAV } from "./Sidebar";

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { count } = useWatchlist();
  const [q, setQ] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  // Close the drawer on any route change (e.g. back/forward navigation),
  // not just clicks on its own links.
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const v = q.trim();
    setDrawerOpen(false);
    router.push(v ? `/search?q=${encodeURIComponent(v)}` : "/search");
  }

  return (
    <>
    <header className="header">
      <button
        className="burger"
        aria-label="Open menu"
        aria-expanded={drawerOpen}
        onClick={() => {
          // Desktop: expand the icon-only sidebar to show labels (no-op on
          // mobile, where .sidebar is display:none). Mobile: open the nav
          // drawer below — the sidebar has no on-screen equivalent there,
          // so without this the burger button did nothing at all on phones.
          document.body.classList.toggle("sb-expanded");
          setDrawerOpen(true);
        }}
      >
        <Icon name="menu" size={20} />
      </button>
      <Link className="brand" href="/">
        <div className="brand__name">MOVIE<b>X</b></div>
        <div className="brand__tag">Watch More, Stream Better.</div>
      </Link>
      <nav className="topnav">
        {NAV.filter((n) => n.top && n.href !== "/").map((n) => (
          <Link key={n.href} className={active(n.href) ? "on" : undefined} href={n.href}>{n.label}</Link>
        ))}
      </nav>
      <form className="search" onSubmit={onSearch}>
        <input placeholder="Search movies, web series..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <button className="sb" type="submit" aria-label="Search"><Icon name="search" size={14} /></button>
      </form>
      <Link className="premium-mini" href="/pricing" aria-label="Go Premium">
        <Icon name="crown" size={14} /><span>Premium</span>
      </Link>
      <Link className="hicon" href="/my-list" aria-label="My List">
        <Icon name="bell" size={18} />
        {count > 0 ? <span className="wl-badge">{count}</span> : null}
      </Link>
      <Link className="hicon" href="/signin" aria-label="Account"><Icon name="user" size={18} /></Link>
    </header>

    {/* Mobile nav drawer — rendered as a SIBLING of <header>, not inside it.
        <header> has backdrop-filter (for the frosted-glass effect), and
        backdrop-filter/filter/transform on an ancestor creates a new
        containing block for position:fixed descendants — so a fixed drawer
        nested inside <header> gets sized relative to the header's own
        ~70px-tall box instead of the viewport, squashing it into a sliver
        instead of a full-height panel. Keeping it outside avoids that.
        The sidebar is hidden below 760px (bottom nav takes over for the
        4-5 primary links), so this is the only way to reach the rest of
        the site nav (TV Shows, Genres, Blog, ...) on a phone. CSS-only on
        desktop (media query), so this markup has zero effect there beyond
        being present in the DOM. */}
    <div className={`navdrawer__overlay${drawerOpen ? " open" : ""}`} onClick={() => setDrawerOpen(false)} />
    <div className={`navdrawer${drawerOpen ? " open" : ""}`} role="dialog" aria-modal="true" aria-label="Menu">
      <div className="navdrawer__head">
        <div className="brand__name">MOVIE<b>X</b></div>
        <button type="button" className="navdrawer__x" aria-label="Close menu" onClick={() => setDrawerOpen(false)}>
          <Icon name="x" size={18} />
        </button>
      </div>
      <nav className="navdrawer__nav">
        {NAV.map((n) => (
          <Link
            key={n.href}
            className={`navdrawer__link${active(n.href) ? " on" : ""}`}
            href={n.href}
            onClick={() => setDrawerOpen(false)}
          >
            <Icon name={n.icon} size={18} /> {n.label}
          </Link>
        ))}
      </nav>
    </div>
    </>
  );
}
