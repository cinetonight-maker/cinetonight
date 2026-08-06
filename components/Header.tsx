"use client";

import { FormEvent, useState } from "react";
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
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const v = q.trim();
    router.push(v ? `/search?q=${encodeURIComponent(v)}` : "/search");
  }

  return (
    <header className="header">
      <button className="burger" aria-label="Toggle menu"
        onClick={() => document.body.classList.toggle("sb-expanded")}><Icon name="menu" size={20} /></button>
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
  );
}
