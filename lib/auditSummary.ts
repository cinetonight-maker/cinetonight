/* ============================================================================
 * lib/auditSummary.ts — turning a database row into a BOUNDED audit snapshot.
 *
 * Pure functions, no database, no Next — so the size and redaction rules are
 * unit-tested in tests/auditSummary.test.mjs.
 *
 * WHY BOUNDED: an audit entry records that a change happened and what fields
 * moved. It is NOT a second copy of the content — the module's revisions table
 * already stores that, and it is what a rollback reads. Copying a 20 KB
 * article into every log row would bloat the table and duplicate storage for
 * no benefit.
 *
 * So: short values are kept verbatim (they are what makes a log readable —
 * "status: draft → published"), long text is replaced with a "<4,182 chars>"
 * marker, and anything that looks like a secret is dropped entirely.
 * ========================================================================= */

/** Longer than this and the value is replaced with a length marker. */
export const MAX_VALUE_CHARS = 200;
/** Hard ceiling on one snapshot, after which remaining fields are dropped. */
export const MAX_SNAPSHOT_CHARS = 4000;

/** Never recorded, even truncated. Belt-and-braces: none of these should be on
 *  a content row in the first place, but an audit log is exactly the wrong
 *  place to discover otherwise. */
const SECRET = /(password|secret|token|api[_-]?key|authorization|cookie|session)/i;

/** Fields that carry no information in a log — noise that hides the signal. */
const SKIP = new Set(["id", "created_at", "updated_at", "draft_body", "draft_content", "draft_saved_at"]);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A short content fingerprint (FNV-1a, 32-bit).
 *
 *  Needed because the length marker alone is not enough: rewriting a
 *  paragraph without changing the character count would produce the SAME
 *  "<5,000 chars>" marker before and after, and the change would be invisible
 *  in the log. A test caught exactly that. The fingerprint is not a security
 *  hash — it only has to differ when the text differs. */
export function fingerprint(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** One value, bounded. */
export function summarizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    return value.length > MAX_VALUE_CHARS
      ? `<${value.length.toLocaleString("en-US")} chars · ${fingerprint(value)}>`
      : value;
  }
  if (Array.isArray(value)) {
    // Arrays of short strings (tags, hero picks) are the interesting case and
    // are kept; anything bigger becomes a count.
    const flat = value.every((v) => typeof v === "string" || typeof v === "number");
    if (flat && value.length <= 24) return value;
    return `<${value.length} items · ${fingerprint(JSON.stringify(value))}>`;
  }
  if (isPlainObject(value)) {
    const json = JSON.stringify(value);
    return json.length > MAX_VALUE_CHARS
      ? `<object, ${json.length.toLocaleString("en-US")} chars · ${fingerprint(json)}>`
      : value;
  }
  return String(value);
}

/** A whole row, bounded and redacted. */
export function summarizeRow(row: unknown): Record<string, unknown> | null {
  if (!isPlainObject(row)) return null;
  const out: Record<string, unknown> = {};
  let budget = MAX_SNAPSHOT_CHARS;

  for (const [key, value] of Object.entries(row)) {
    if (SKIP.has(key)) continue;
    if (SECRET.test(key)) { out[key] = "<redacted>"; continue; }
    const v = summarizeValue(value);
    const cost = key.length + JSON.stringify(v ?? null).length + 4;
    if (cost > budget) { out["…"] = "truncated"; break; }
    budget -= cost;
    out[key] = v;
  }
  return out;
}

/** The fields that actually changed — what a reader of the log wants first.
 *  Compared on the SUMMARISED values, so a long body that changed shows up as
 *  a changed field without either version being copied into the log. */
export function changedFields(
  before: unknown,
  after: unknown,
): { field: string; from: unknown; to: unknown }[] {
  const a = summarizeRow(before) ?? {};
  const b = summarizeRow(after) ?? {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: { field: string; from: unknown; to: unknown }[] = [];
  for (const k of keys) {
    if (k === "…") continue;
    const from = a[k] ?? null;
    const to = b[k] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) out.push({ field: k, from, to });
  }
  return out.sort((x, y) => x.field.localeCompare(y.field));
}

/** One plain-English line for the log list: "status draft → published, title changed". */
export function describeChange(before: unknown, after: unknown): string {
  const changes = changedFields(before, after);
  if (!changes.length) return "No field changed";
  const parts = changes.slice(0, 3).map((c) => {
    // A "<5,000 chars · 4dda656d>" marker is short enough to print, but
    // printing it tells a reader nothing — say "changed" instead.
    const isMarker = (v: unknown) => typeof v === "string" && v.startsWith("<") && v.endsWith(">");
    const short = (v: unknown) =>
      v === null ? "empty"
      : isMarker(v) ? "changed"
      : typeof v === "string" && v.length <= 24 ? `“${v}”`
      : typeof v === "string" ? "changed"
      : JSON.stringify(v).length <= 24 ? JSON.stringify(v)
      : "changed";
    const from = short(c.from), to = short(c.to);
    return from === "changed" || to === "changed" ? `${c.field} changed` : `${c.field} ${from} → ${to}`;
  });
  const rest = changes.length - parts.length;
  return rest > 0 ? `${parts.join(", ")} +${rest} more` : parts.join(", ");
}
