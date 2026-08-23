"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import BrandMark from "@/components/BrandMark";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ADMIN_GROUPS, ADMIN_NAV, adminItemBySlug } from "@/lib/adminNav";

/** The admin chrome: grouped sidebar + top bar with search, alerts and account.
 *
 *  Client component, but it lives ONLY under /admin — Next code-splits per
 *  route, so none of this ships to a normal visitor's bundle (verified against
 *  the build manifest after every change). */

type Hit = { label: string; sub: string; href: string; icon: string };

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<{ n: number; href: string; text: string } | null>(null);

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<Hit[]>([]);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Remember the collapsed preference between visits (admin-only, per device).
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("ct:admin:collapsed") === "1"); } catch {}
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      try { localStorage.setItem("ct:admin:collapsed", v ? "0" : "1"); } catch {}
      return !v;
    });
  };

  // Close the mobile drawer and the search panel on navigation.
  useEffect(() => { setDrawer(false); setOpen(false); }, [pathname]);

  const slug = pathname.replace(/^\/admin\/?/, "").split("/")[0] ?? "";
  const current = adminItemBySlug(slug);

  // The login screen lives under /admin and therefore inherits this layout —
  // but it must NOT show the admin chrome: a signed-out visitor should see a
  // login form, not the whole dashboard IA behind it.
  const isLogin = pathname.startsWith("/admin/login");

  /* Who is signed in, and what needs looking at. Both real: the account comes
     from the Supabase session, the alert count from the Overview API — the
     same figures the Overview screen shows. The bell is hidden entirely when
     there is nothing to report, rather than showing a decorative zero. */
  useEffect(() => {
    if (isLogin) return;
    let alive = true;
    supabaseBrowser().auth.getUser()
      .then(({ data }) => { if (alive) setEmail(data.user?.email ?? null); })
      .catch(() => {});
    fetch("/api/admin/overview")
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j?.counts) return;
        const comments = j.counts.comments ?? 0;
        const attention = j.attentionTotal ?? 0;
        if (comments > 0) {
          setAlerts({ n: comments + attention, href: "/admin/comments", text: `${comments} comment${comments === 1 ? "" : "s"} waiting for review` });
        } else if (attention > 0) {
          setAlerts({ n: attention, href: "/admin/blog", text: `${attention} post${attention === 1 ? "" : "s"} missing an image or description` });
        } else setAlerts(null);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [isLogin]);

  /* Search covers the admin sections AND real content. The content list is
     fetched once, on first use, so simply opening a page never pays for it. */
  const loadContent = useCallback(async () => {
    if (content.length) return;
    try {
      const r = await fetch("/api/admin/links?targets=1");
      const j = await r.json();
      const KIND: Record<string, [string, string]> = {
        post: ["Blog post", "article"], page: ["Page", "article"], movie: ["Movie", "film"],
        series: ["Series", "film"], free: ["Free movie", "playc"],
      };
      const EDIT: Record<string, string> = {
        post: "/admin/blog", page: "/admin/pages", movie: "/admin/catalogue",
        series: "/admin/catalogue", free: "/admin/free-movies",
      };
      setContent((j.targets ?? [])
        .filter((t: { kind: string }) => t.kind !== "section")
        .map((t: { kind: string; label: string; path: string }) => ({
          label: t.label,
          sub: `${KIND[t.kind]?.[0] ?? "Page"} · ${t.path}`,
          href: EDIT[t.kind] ?? t.path,
          icon: KIND[t.kind]?.[1] ?? "article",
        })));
    } catch { /* search still works over the sections */ }
  }, [content.length]);

  const hits = useMemo<Hit[]>(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const sections: Hit[] = ADMIN_NAV
      .filter((i) => !i.planned && (i.label.toLowerCase().includes(needle) || (i.hint ?? "").toLowerCase().includes(needle)))
      .map((i) => ({ label: i.label, sub: i.hint ?? "Admin section", href: i.slug ? `/admin/${i.slug}` : "/admin", icon: i.icon }));
    const items = content.filter((c) => c.label.toLowerCase().includes(needle)).slice(0, 8);
    return [...sections, ...items].slice(0, 10);
  }, [q, content]);

  // Ctrl/⌘+K focuses search; Escape closes it.
  useEffect(() => {
    if (isLogin) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); searchRef.current?.focus(); setOpen(true); loadContent();
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLogin, loadContent]);

  // Click outside closes the results.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const logout = async () => {
    await supabaseBrowser().auth.signOut();
    router.push("/admin/login");
    router.refresh();
  };

  if (isLogin) return <>{children}</>;

  return (
    <div className={`adm${collapsed ? " adm--narrow" : ""}${drawer ? " adm--drawer" : ""}`}>
      <div className="adm__scrim" onClick={() => setDrawer(false)} aria-hidden={!drawer} />

      <aside className="adm__side" aria-label="Admin sections">
        <div className="adm__brand">
          <BrandMark size={26} />
          {!collapsed && (
            <div className="adm__brandtxt">
              <div className="adm__brandname">Cine<b>Tonight</b></div>
              <div className="adm__brandsub">Admin Dashboard</div>
            </div>
          )}
        </div>

        <nav className="adm__nav">
          {ADMIN_GROUPS.map((g) => {
            const items = ADMIN_NAV.filter((i) => i.group === g.id);
            if (!items.length) return null;
            return (
              <div className="adm__group" key={g.id}>
                {g.label && !collapsed && <div className="adm__grouplabel">{g.label}</div>}
                {items.map((i) => {
                  const href = i.slug ? `/admin/${i.slug}` : "/admin";
                  const on = slug === i.slug;
                  const title = i.planned ? `${i.label} — coming in this update` : i.label;
                  return i.planned ? (
                    <span key={i.slug} className="adm__item adm__item--soon" title={title} aria-disabled="true">
                      <span className="adm__ico"><Icon name={i.icon} size={17} /></span>
                      {!collapsed && <span className="adm__label">{i.label}</span>}
                      {!collapsed && <span className="adm__soon">Soon</span>}
                    </span>
                  ) : (
                    <Link
                      key={i.slug}
                      href={href}
                      className={`adm__item${on ? " on" : ""}`}
                      title={title}
                      aria-label={i.label}
                      aria-current={on ? "page" : undefined}
                    >
                      <span className="adm__ico"><Icon name={i.icon} size={17} /></span>
                      {!collapsed && <span className="adm__label">{i.label}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="adm__sidefoot">
          <a className="adm__foot" href="/" target="_blank" rel="noreferrer" title="View Website">
            <Icon name="arrow" size={15} />
            {!collapsed && <span>View Website</span>}
          </a>
          <button
            type="button"
            className="adm__foot adm__collapse"
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Icon name={collapsed ? "chevr" : "chevl"} size={15} />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      <div className="adm__main">
        <header className="adm__top">
          <button
            type="button"
            className="adm__burger"
            onClick={() => setDrawer((v) => !v)}
            aria-label="Open admin menu"
            aria-expanded={drawer}
          >
            <Icon name="menu" size={18} />
          </button>

          <span className="adm__pageico"><Icon name={current?.icon ?? "home"} size={17} /></span>
          <div className="adm__titles">
            <h1 className="adm__title">{current?.label ?? "Overview"}</h1>
            {current?.hint && <p className="adm__hint">{current.hint}</p>}
          </div>

          <div className="adm__search" ref={boxRef}>
            <Icon name="search" size={15} />
            <input
              ref={searchRef}
              value={q}
              placeholder="Search sections, posts, pages, movies…"
              onFocus={() => { setOpen(true); loadContent(); }}
              onChange={(e) => { setQ(e.target.value); setOpen(true); }}
              aria-label="Search the dashboard"
            />
            <kbd className="adm__kbd">Ctrl K</kbd>
            {open && q.trim() && (
              <div className="adm__results">
                {hits.length === 0 && <div className="adm__noresult">Nothing matches “{q}”.</div>}
                {hits.map((h) => (
                  <Link key={`${h.href}-${h.label}`} href={h.href} className="adm__result" onClick={() => { setOpen(false); setQ(""); }}>
                    <span className="adm__resico"><Icon name={h.icon} size={14} /></span>
                    <span className="adm__resbody">
                      <span className="adm__resl">{h.label}</span>
                      <span className="adm__ress">{h.sub}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {alerts && (
            <Link className="adm__bell" href={alerts.href} title={alerts.text} aria-label={alerts.text}>
              <Icon name="bell" size={16} />
              <em>{alerts.n > 9 ? "9+" : alerts.n}</em>
            </Link>
          )}

          <div className="adm__acct">
            <span className="adm__avatar">{(email ?? "A").slice(0, 1).toUpperCase()}</span>
            <span className="adm__acctxt">
              <b>{email ? email.split("@")[0] : "Admin"}</b>
              <em>Signed in</em>
            </span>
            <button type="button" className="adm__signout" onClick={logout} title="Sign out" aria-label="Sign out">
              <Icon name="arrow" size={14} />
            </button>
          </div>

          <a className="adm__viewsite" href="/" target="_blank" rel="noreferrer">
            View Site <Icon name="arrow" size={13} />
          </a>
        </header>

        <main className="adm__content">{children}</main>
      </div>
    </div>
  );
}
