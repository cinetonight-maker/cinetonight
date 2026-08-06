"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import { NAV } from "./Sidebar";

/** Mobile-only sticky bottom tab bar — replaces the left sidebar below the
 *  760px breakpoint (see .bottomnav / .sidebar rules in globals.css). */
export default function BottomNav() {
  const pathname = usePathname();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const items = NAV.filter((n) => n.bottom);

  return (
    <nav className="bottomnav" aria-label="Primary">
      {items.map((n) => (
        <Link key={n.href} className={active(n.href) ? "on" : undefined} href={n.href}>
          <Icon name={n.icon} size={20} />
          <span>{n.short ?? n.label}</span>
        </Link>
      ))}
    </nav>
  );
}
