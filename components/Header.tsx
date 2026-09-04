"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import BrandMark from "@/components/BrandMark";
import SearchBox from "./SearchBox";
import { useScrollLock } from "@/lib/useScrollLock";
import { useWatchlist } from "@/lib/watchlist";
import { useAuth } from "@/lib/auth";
import { NAV } from "./Sidebar";

export default function Header() {
  const pathname = usePathname();
  const { count } = useWatchlist();
  const { user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Desktop icon-rail expansion — mirrored in state purely so aria-expanded
  // reports the truth on desktop (the CSS itself keys off the body class).
  const [railExpanded, setRailExpanded] = useState(false);
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  // Shared, counted, restoring scroll lock (see lib/useScrollLock).
  useScrollLock(drawerOpen);

  // Close the drawer on any route change (e.g. back/forward navigation),
  // not just clicks on its own links.
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  // The drawer only EXISTS below 761px (globals.css hides it above that).
  // If the viewport grows past the breakpoint while it is open — rotating a
  // tablet, dragging a window wider — close it, so the lock can never
  // outlive the UI that owns it.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const sync = () => { if (!mq.matches) setDrawerOpen(false); };
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <>
    <header className="header">
      <button
        className="burger"
        aria-label="Open menu"
        aria-expanded={drawerOpen || railExpanded}
        onClick={() => {
          // ONE button, TWO jobs, chosen by viewport — never both at once.
          //
          // Below 761px the nav drawer is the only nav surface, so the
          // burger toggles it. Above 761px the drawer is display:none and
          // the burger expands the icon rail instead.
          //
          // The previous version did BOTH unconditionally, which is what
          // froze the page on desktop: it set drawerOpen=true (locking body
          // scroll) while the drawer itself was invisible, so there was no
          // overlay or X to close it — and because the handler only ever
          // set `true`, clicking the burger again produced no state change,
          // no effect re-run, and no unlock. Only a route change or a
          // refresh recovered. Note `setDrawerOpen(v => !v)`: a real
          // toggle, so a second tap on mobile also closes and unlocks.
          if (window.matchMedia("(max-width: 760px)").matches) {
            setDrawerOpen((v) => !v);
          } else {
            document.body.classList.toggle("sb-expanded");
            setRailExpanded((v) => !v);
          }
        }}
      >
        <Icon name="menu" size={20} />
      </button>
      <Link className="brand" href="/">
        <BrandMark size={30} />
        <div className="brand__txt">
          <div className="brand__name">Cine<b>Tonight</b></div>
          <div className="brand__tag">Know what to watch.</div>
        </div>
      </Link>
      <nav className="topnav">
        {NAV.filter((n) => n.top && n.href !== "/").sort((a, b) => (a.topOrder ?? 99) - (b.topOrder ?? 99)).map((n) => (
          <Link key={n.href} className={active(n.href) ? "on" : undefined} href={n.href}>{n.label}</Link>
        ))}
      </nav>
      <SearchBox onNavigate={() => setDrawerOpen(false)} />
      <Link className="hicon" href="/my-list" aria-label="My List">
        <Icon name="bell" size={18} />
        {count > 0 ? <span className="wl-badge">{count}</span> : null}
      </Link>
      {/* prefetch=false ON PURPOSE: prefetching /signin pulls the whole
          supabase-js SDK chunk (~250 KB) into every visitor's session even
          though almost nobody clicks this. The rare visitor who does waits
          one extra round trip. See lib/auth.tsx for the lazy-auth design. */}
      <Link prefetch={false} className="hicon" href={user ? "/account" : "/signin"} aria-label={user ? "My Account" : "Sign In"}>
        {user ? (
          <span className="hicon__initial" aria-hidden="true">
            {(user.user_metadata?.full_name || user.email || "?").trim().charAt(0).toUpperCase()}
          </span>
        ) : (
          <Icon name="user" size={18} />
        )}
      </Link>
    </header>

    {/* Mobile nav drawer - rendered as a SIBLING of <header>, not inside it.
        <header> has backdrop-filter (for the frosted-glass effect), and
        backdrop-filter/filter/transform on an ancestor creates a new
        containing block for position:fixed descendants - so a fixed drawer
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
        <BrandMark size={22} /><div className="brand__name">Cine<b>Tonight</b></div>
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
