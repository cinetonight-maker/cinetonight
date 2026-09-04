/* ============================================================================
 * lib/redirects.ts — the rules behind the Redirect Manager.
 *
 * PURE MODULE. No imports, no network, no React — so every rule is unit-tested
 * directly (tests/redirects.test.mjs) rather than only through a rendered
 * screen. The API route and the dashboard both call into here; neither owns a
 * second copy of any rule.
 *
 * THE ONE IDEA WORTH UNDERSTANDING: chains are removed when a rule is SAVED,
 * not when a request arrives. If you add A→B and B→C already exists, what gets
 * stored is A→C. That makes "one hop, always" a property of the data — the
 * request path never walks a chain, never counts hops, and cannot loop, because
 * a chain cannot exist in the table to begin with.
 * ========================================================================= */

/** Why a redirect exists. Closed set — mirrored by a CHECK constraint in
 *  supabase/redirects.sql so it cannot drift between code and database. */
export const REDIRECT_REASONS = [
  "slug_change", "content_merge", "duplicate_removal", "migration", "seo_cleanup", "other",
] as const;
export type RedirectReason = (typeof REDIRECT_REASONS)[number];

export const REASON_LABEL: Record<RedirectReason, string> = {
  slug_change: "Slug change",
  content_merge: "Content merge",
  duplicate_removal: "Duplicate removal",
  migration: "Migration",
  seo_cleanup: "SEO cleanup",
  other: "Other",
};

/** 308 and 301 are permanent; 307 and 302 are temporary.
 *
 *  New rules are created TEMPORARY on purpose. A permanent redirect is cached
 *  by browsers — sometimes indefinitely — so a mistake outlives deleting the
 *  rule. Verify the destination first, then promote. */
export const REDIRECT_STATUSES = [307, 308, 302, 301] as const;
export type RedirectStatus = (typeof REDIRECT_STATUSES)[number];
export const DEFAULT_STATUS: RedirectStatus = 307;
export const isPermanent = (status: number): boolean => status === 301 || status === 308;

/** The whole rule set loads as ONE cached query, so the payload has to be
 *  bounded. Enforced server-side at save time, never only in the UI. */
export const MAX_ENABLED_RULES = 500;
export const MAX_PATH_LENGTH = 512;

export interface RedirectRule {
  from_path: string;
  to_path: string;
  status: RedirectStatus;
  enabled: boolean;
  reason: RedirectReason;
  note?: string | null;
}

/* ---------------------------------------------------------------------------
 * Normalisation
 * ------------------------------------------------------------------------ */

/**
 * Reduce a path to the single form the table stores and the resolver compares.
 * Returns null for anything that is not a usable internal path.
 *
 * Lowercasing and trailing-slash stripping matter: without them `/Contact-Us/`
 * and `/contact-us` are two rows for one URL, and only one of them ever fires.
 */
export function normalizePath(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  let p = input.trim();
  if (!p) return null;

  // An absolute URL is REFUSED, never reduced to its path.
  //
  // The first version of this accepted "https://host/x" and kept "/x" as a
  // convenience for pasting out of the browser bar. A test caught what that
  // actually does: "https://evil.example/x" silently became the internal path
  // "/x" — so an external destination the validator was supposed to reject
  // sailed through as a valid internal one. Silently rewriting someone's URL
  // into a different URL is worse than making them paste the path.
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return null;

  if (!p.startsWith("/")) return null;
  if (p.startsWith("//")) return null;          // protocol-relative → off-site
  if (/^\/\\/.test(p)) return null;             // some browsers read /\evil as //evil
  if (p.includes("..")) return null;            // path traversal
  if (/[\s<>"'`]/.test(p)) return null;         // whitespace and markup characters

  p = p.split("#")[0].split("?")[0];            // fragments and queries are not part of the key
  p = p.replace(/\/{2,}/g, "/");                // collapse accidental double slashes
  if (p.length > 1) p = p.replace(/\/+$/, "");  // strip trailing slash, but keep "/"
  p = p.toLowerCase();

  if (!p.startsWith("/")) return null;
  if (p.length > MAX_PATH_LENGTH) return null;
  return p;
}

/** The site root can never be a redirect source — that would take the whole
 *  site offline with one row. */
export const isRedirectableSource = (path: string): boolean => path !== "/";

/* ---------------------------------------------------------------------------
 * Validation
 * ------------------------------------------------------------------------ */

export interface ValidationResult {
  ok: boolean;
  from?: string;
  to?: string;
  status?: RedirectStatus;
  reason?: RedirectReason;
  errors: string[];
}

/**
 * Validate one rule in isolation — shape only. Relationships with other rules
 * (loops, chains, duplicates) are checked by planRuleWrite, and existence of
 * the source page by the caller, which is the only thing that knows.
 */
export function validateRule(input: {
  from?: string | null;
  to?: string | null;
  status?: number | null;
  reason?: string | null;
}): ValidationResult {
  const errors: string[] = [];

  const from = normalizePath(input.from);
  const to = normalizePath(input.to);

  if (!from) errors.push("The old address is not a valid internal path. It must start with “/”.");
  else if (!isRedirectableSource(from)) errors.push("The home page cannot be redirected away.");

  if (!to) {
    errors.push(
      "The new address is not a valid internal path. Only addresses on this site are allowed — " +
      "sending visitors to another domain would hand it your traffic and your ranking.",
    );
  }

  if (from && to && from === to) errors.push("That redirects the address to itself.");

  const status = (input.status ?? DEFAULT_STATUS) as RedirectStatus;
  if (!REDIRECT_STATUSES.includes(status)) errors.push("Unsupported redirect type.");

  const reason = (input.reason ?? "other") as RedirectReason;
  if (!REDIRECT_REASONS.includes(reason)) errors.push("Unknown reason.");

  return errors.length
    ? { ok: false, errors }
    : { ok: true, from: from!, to: to!, status, reason, errors: [] };
}

/* ---------------------------------------------------------------------------
 * Chain flattening and loop detection
 * ------------------------------------------------------------------------ */

/** Follow `start` through the rule set to its final destination.
 *  Returns null when the walk revisits a path — i.e. a loop. */
export function finalTarget(rules: Map<string, string>, start: string): string | null {
  const seen = new Set<string>([start]);
  let current = start;
  // The bound is belt-and-braces: with flattening in place a walk is at most
  // one step, but a hand-edited table should still never spin.
  for (let i = 0; i <= MAX_ENABLED_RULES; i++) {
    const next = rules.get(current);
    if (next === undefined) return current;
    if (seen.has(next)) return null;
    seen.add(next);
    current = next;
  }
  return null;
}

export interface WritePlan {
  ok: boolean;
  /** The rule to store, with its destination already flattened. */
  rule?: RedirectRule;
  /** Existing rules whose destination must be rewritten in the same
   *  transaction, so the table never contains a chain. */
  rewrites: { from_path: string; to_path: string }[];
  errors: string[];
}

/**
 * Work out exactly what to write for one new or edited rule.
 *
 * `existing` is every ENABLED rule currently stored (from → to). Disabled rules
 * are deliberately excluded: they do not redirect anything, so they cannot form
 * a chain or a loop, and letting them constrain edits would be confusing.
 */
export function planRuleWrite(
  existing: Map<string, string>,
  input: { from?: string | null; to?: string | null; status?: number | null; reason?: string | null; note?: string | null; enabled?: boolean },
): WritePlan {
  const v = validateRule(input);
  if (!v.ok) return { ok: false, rewrites: [], errors: v.errors };

  const from = v.from!;
  const to = v.to!;

  // Work against a copy that excludes any previous version of this rule, so
  // editing a rule never sees its own old destination.
  const others = new Map(existing);
  others.delete(from);

  // Where does the destination actually end up?
  const settled = finalTarget(others, to);
  if (settled === null) {
    return { ok: false, rewrites: [], errors: ["That would create a redirect loop."] };
  }
  if (settled === from) {
    return {
      ok: false, rewrites: [],
      errors: ["That would create a redirect loop — the new address leads back here."],
    };
  }

  // Anything that pointed AT this rule's source now has to point at the same
  // final destination, or the table would hold a two-hop chain.
  const rewrites: { from_path: string; to_path: string }[] = [];
  for (const [f, t] of others) {
    if (t === from && f !== settled) rewrites.push({ from_path: f, to_path: settled });
  }

  return {
    ok: true,
    rule: {
      from_path: from,
      to_path: settled,
      status: v.status!,
      reason: v.reason!,
      enabled: input.enabled === true,
      note: input.note?.trim() || null,
    },
    rewrites,
    errors: [],
  };
}

/** Is this rule set free of chains? Every enabled destination must not itself
 *  be an enabled source. Used as an invariant check in tests and by the
 *  dashboard's health line. */
export function findChains(rules: Map<string, string>): { from: string; via: string; to: string }[] {
  const out: { from: string; via: string; to: string }[] = [];
  for (const [from, to] of rules) {
    const next = rules.get(to);
    if (next !== undefined) out.push({ from, via: to, to: next });
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * Resolution (the request path)
 * ------------------------------------------------------------------------ */

export interface Resolution {
  match: boolean;
  to?: string;
  status?: RedirectStatus;
}

/**
 * What should happen for this request path? Deliberately a single Map lookup —
 * no walking, no recursion — because flattening has already guaranteed the
 * stored destination is final.
 */
export function resolveRedirect(
  rules: Map<string, { to: string; status: RedirectStatus }>,
  requestPath: string,
): Resolution {
  const key = normalizePath(requestPath);
  if (!key) return { match: false };
  const hit = rules.get(key);
  return hit ? { match: true, to: hit.to, status: hit.status } : { match: false };
}

/**
 * Cache-Control for a redirect response.
 *
 * Measured on the live stack: a 308 from these routes inherited
 * `stale-while-revalidate=2592000` from the next.config header rule — thirty
 * days at the edge, with no max-age, so browsers were free to hold it too.
 * That is exactly how a permanent redirect becomes one you cannot take back.
 *
 * Temporary redirects are not cached at all. Permanent ones get a short,
 * explicit window: long enough that crawlers and the CDN benefit, short enough
 * that a mistake ages out instead of living in someone's browser forever.
 */
export const redirectCacheControl = (status: number): string =>
  isPermanent(status)
    ? "public, max-age=600, s-maxage=3600"
    : "no-store";

/* ---------------------------------------------------------------------------
 * Bulk import
 * ------------------------------------------------------------------------ */

export interface BulkRow {
  line: number;
  raw: string;
  ok: boolean;
  from?: string;
  to?: string;
  status?: RedirectStatus;
  reason?: RedirectReason;
  error?: string;
}

/**
 * Parse pasted CSV: `from,to[,status]`. One row per line, blank lines and
 * lines starting with # ignored, an optional header row skipped.
 *
 * Parsing NEVER writes anything. The caller runs this, shows the report, and
 * only then applies — which is what makes a bad paste harmless.
 */
export function parseBulk(text: string, reason: RedirectReason = "migration"): BulkRow[] {
  const out: BulkRow[] = [];
  const seen = new Set<string>();
  const lines = (text ?? "").split(/\r?\n/);

  lines.forEach((raw, i) => {
    const line = i + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const cells = trimmed.split(",").map((c) => c.trim());
    // Skip a header row rather than reporting it as an error.
    if (i === 0 && /^(from|old|source)/i.test(cells[0] ?? "")) return;

    if (cells.length < 2) {
      out.push({ line, raw: trimmed, ok: false, error: "Needs two values: old address, new address." });
      return;
    }

    const statusCell = cells[2];
    const status = statusCell ? Number(statusCell) : DEFAULT_STATUS;
    const v = validateRule({ from: cells[0], to: cells[1], status, reason });
    if (!v.ok) {
      out.push({ line, raw: trimmed, ok: false, error: v.errors.join(" ") });
      return;
    }
    if (seen.has(v.from!)) {
      out.push({ line, raw: trimmed, ok: false, error: `Duplicate — ${v.from} appears earlier in this list.` });
      return;
    }
    seen.add(v.from!);
    out.push({ line, raw: trimmed, ok: true, from: v.from, to: v.to, status: v.status, reason: v.reason });
  });

  return out;
}

export const bulkSummary = (rows: BulkRow[]) => ({
  total: rows.length,
  valid: rows.filter((r) => r.ok).length,
  invalid: rows.filter((r) => !r.ok).length,
});
