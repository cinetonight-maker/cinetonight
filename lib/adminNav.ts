/* ============================================================================
 * lib/adminNav.ts — the admin information architecture, in one place.
 *
 * Stage 1 of the CMS major update. Every admin screen is a ROUTE
 * (`/admin/<slug>`), so screens are deep-linkable, browser back/forward
 * works, and no screen's state is lost by switching section — the three
 * things the old single-component tab strip could not do.
 *
 * `section` maps a route to the tab the existing AdminDashboard renders, so
 * Stage 1 re-houses the working features without rewriting them (they are
 * upgraded module-by-module in later stages).
 *
 * Pure data — no imports, safe for both server and client components.
 * ========================================================================= */

export type AdminGroup = "overview" | "content" | "catalogue" | "discovery" | "media" | "site" | "system";

export interface AdminNavItem {
  /** URL slug under /admin ("" = the Overview index). */
  slug: string;
  label: string;
  icon: string;
  group: AdminGroup;
  /** Existing AdminDashboard tab this route renders, when it maps to one. */
  section?: string;
  /** Not built yet — rendered as a disabled "Coming in this update" row so
   *  the IA is visible without pretending the screen exists. */
  planned?: boolean;
  /** One-line description shown on the Overview and in tooltips. */
  hint?: string;
}

export const ADMIN_GROUPS: { id: AdminGroup; label: string }[] = [
  { id: "overview", label: "" },
  { id: "content", label: "Content" },
  { id: "catalogue", label: "Catalogue" },
  { id: "discovery", label: "Discovery" },
  { id: "media", label: "Media" },
  { id: "site", label: "Site" },
  { id: "system", label: "System" },
];

export const ADMIN_NAV: AdminNavItem[] = [
  { slug: "", label: "Overview", icon: "home", group: "overview", hint: "Everything at a glance" },
  { slug: "homepage", label: "Homepage", icon: "grid", group: "overview", hint: "Hero picks, section order and headings" },

  { slug: "blog", label: "Blog Posts", icon: "article", group: "content", section: "blog", hint: "Write, schedule and publish guides" },
  { slug: "pages", label: "Pages", icon: "article", group: "content", section: "pages", hint: "Static pages (About, FAQ, policies)" },
  { slug: "links", label: "Internal Links", icon: "arrow", group: "content", hint: "Broken links, orphan pages and dead ends" },
  { slug: "redirects", label: "Redirects", icon: "arrow", group: "content", hint: "Send an old address to a new one, without a deploy" },

  { slug: "catalogue", label: "Movies & Series", icon: "film", group: "catalogue", section: "catalogue", hint: "The curated CineTonight catalogue" },
  { slug: "free-movies", label: "Free Movies", icon: "playc", group: "catalogue", section: "classics", hint: "Legally free classics" },

  { slug: "discovery", label: "Discovery", icon: "compass", group: "discovery", hint: "Moods, Quick Picks, Explore tabs and Tonight's Pick" },
  { slug: "providers", label: "Streaming Services", icon: "monitor", group: "discovery", planned: true, hint: "Which providers show, and their order" },

  { slug: "media", label: "Media Library", icon: "tv", group: "media", hint: "Images, storage used, and what nothing points at" },

  { slug: "navigation", label: "Navigation", icon: "menu", group: "site", section: "menus", hint: "Footer links and social" },
  { slug: "scheduling", label: "Scheduling", icon: "cal", group: "site", planned: true, hint: "Everything queued to go live" },
  { slug: "sync", label: "Sync Center", icon: "trend", group: "site", section: "sync", hint: "Refresh catalogue data from TMDB" },
  { slug: "comments", label: "Comments", icon: "reply", group: "site", section: "comments", hint: "Moderate reader comments" },

  { slug: "activity", label: "Activity Log", icon: "cal", group: "system", hint: "Who changed what, and when" },
  { slug: "health", label: "System Health", icon: "check", group: "system", hint: "Setup checklist, services and storage" },
  { slug: "settings", label: "Settings", icon: "user", group: "system", hint: "Site title, description, contact and social links" },
];

export const adminItemBySlug = (slug: string) => ADMIN_NAV.find((i) => i.slug === slug);
/** Slugs that render an existing dashboard section (used by the route page). */
export const ADMIN_SECTION_SLUGS = ADMIN_NAV.filter((i) => i.section).map((i) => i.slug);
