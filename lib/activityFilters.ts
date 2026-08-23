/* ============================================================================
 * lib/activityFilters.ts — the filter rules for the Activity Log.
 *
 * Pure functions, no database, no Next — so the two things that could actually
 * go wrong here are unit-tested: the date-range maths, and the escaping of a
 * search term before it reaches a query string.
 *
 * The log is READ ONLY. Nothing in this file, or in the route that uses it,
 * can write, edit or delete an entry.
 * ========================================================================= */

export const AUDIT_MODULES = [
  "blog", "pages", "homepage", "discovery", "catalogue",
  "free-movies", "media", "navigation", "comments", "settings", "sync", "redirects",
] as const;

export const AUDIT_ACTIONS = [
  "create", "publish", "update", "schedule", "unpublish",
  "trash", "restore", "rollback", "delete", "settings", "enable", "disable", "import",
] as const;

export type DatePreset = "all" | "today" | "7d" | "30d" | "90d" | "custom";

export const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "custom", label: "Custom range" },
];

/** ISO bounds for a preset. `now` is passed in so this is deterministic and
 *  testable — never read the clock inside a pure function. */
export function rangeFor(preset: DatePreset, now: Date): { from?: string; to?: string } {
  if (preset === "all" || preset === "custom") return {};
  if (preset === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString() };
  }
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  return { from: new Date(now.getTime() - days * 86_400_000).toISOString() };
}

/** A `<input type="date">` value ("2026-08-21") to an ISO bound.
 *  `end` pushes it to the last millisecond of that day, so a range whose
 *  "to" is today actually includes today — the classic off-by-one that makes
 *  a date filter look broken. */
export function dayBound(value: string, end = false): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  if (end) d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/** PostgREST's `or=` filter is a comma-and-parenthesis separated grammar, so a
 *  search term containing those characters would break out of the value and
 *  change the filter's meaning. Strip them, along with the LIKE wildcards, and
 *  bound the length. Anything left is matched literally. */
export function sanitizeSearch(raw: string): string {
  return raw
    .replace(/[,()*%\\"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export interface ActivityQuery {
  module?: string;
  action?: string;
  actor?: string;
  preset?: DatePreset;
  customFrom?: string;
  customTo?: string;
  search?: string;
  before?: string;
}

/** Build the query string the Activity API expects. Only known-good values
 *  are ever forwarded: an unrecognised module or action is dropped rather
 *  than passed through. */
export function buildActivityQuery(q: ActivityQuery, now: Date): string {
  const p = new URLSearchParams();

  if (q.module && (AUDIT_MODULES as readonly string[]).includes(q.module)) p.set("module", q.module);
  if (q.action && (AUDIT_ACTIONS as readonly string[]).includes(q.action)) p.set("action", q.action);
  if (q.actor) p.set("actor", q.actor.slice(0, 160));

  if (q.preset === "custom") {
    const from = q.customFrom ? dayBound(q.customFrom) : undefined;
    const to = q.customTo ? dayBound(q.customTo, true) : undefined;
    if (from) p.set("from", from);
    if (to) p.set("to", to);
  } else if (q.preset) {
    const { from, to } = rangeFor(q.preset, now);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
  }

  const s = q.search ? sanitizeSearch(q.search) : "";
  if (s) p.set("q", s);

  // Pagination cursor — always applied last so it survives every filter.
  if (q.before) p.set("before", q.before);

  return p.toString();
}

/** A one-line summary of what is currently being filtered, for the UI. */
export function describeFilters(q: ActivityQuery): string {
  const bits: string[] = [];
  if (q.module) bits.push(q.module);
  if (q.action) bits.push(q.action);
  if (q.actor) bits.push(q.actor);
  if (q.preset && q.preset !== "all") {
    bits.push(DATE_PRESETS.find((d) => d.id === q.preset)?.label.toLowerCase() ?? q.preset);
  }
  const s = q.search ? sanitizeSearch(q.search) : "";
  if (s) bits.push(`“${s}”`);
  return bits.length ? bits.join(" · ") : "everything";
}
