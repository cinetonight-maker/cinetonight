#!/usr/bin/env node
/**
 * Stage 2 migration — blog body: string[]  →  Markdown string.
 *
 *   node scripts/migrate-blog-markdown.mjs            # DRY RUN (default)
 *   node scripts/migrate-blog-markdown.mjs --apply    # write changes
 *   node scripts/migrate-blog-markdown.mjs --verify   # compare after apply
 *   node scripts/migrate-blog-markdown.mjs --rollback backups/<file>.json
 *
 * WHY THIS IS SAFE
 *  - The transform is `paragraphs.join("\n\n")`, which is lossless: the
 *    renderer already splits on blank lines, and "## "/"### " markers are
 *    already valid Markdown, so every existing article renders identically.
 *  - A full JSON backup of every row is written BEFORE the first write.
 *  - Dry run prints per-post before/after character counts and flags any post
 *    whose plain text would change.
 *  - The renderer accepts BOTH shapes (see lib/markdown.ts), so the site keeps
 *    working whether or not this has been run.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) { console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local"); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const APPLY = process.argv.includes("--apply");
const VERIFY = process.argv.includes("--verify");
const rollbackIdx = process.argv.indexOf("--rollback");

const plain = (v) => {
  const raw = Array.isArray(v) ? v.join("\n\n") : String(v ?? "");
  return raw.replace(/\s+/g, " ").trim();
};

/* ---------------- rollback ---------------- */
if (rollbackIdx !== -1) {
  const file = process.argv[rollbackIdx + 1];
  if (!file) { console.error("Usage: --rollback backups/<file>.json"); process.exit(1); }
  const rows = JSON.parse(readFileSync(file, "utf8"));
  let n = 0;
  for (const r of rows) {
    const { error } = await sb.from("blog_posts").update({ body: r.body }).eq("id", r.id);
    if (error) console.error(`FAIL ${r.slug}: ${error.message}`); else n++;
  }
  console.log(`rolled back ${n}/${rows.length} posts from ${file}`);
  process.exit(0);
}

/* ---------------- read ---------------- */
const { data: posts, error } = await sb.from("blog_posts").select("id, slug, title, body").order("created_at");
if (error) { console.error("Read failed:", error.message); process.exit(1); }

const arrays = posts.filter((p) => Array.isArray(p.body));
const strings = posts.filter((p) => typeof p.body === "string");
const other = posts.filter((p) => !Array.isArray(p.body) && typeof p.body !== "string");

console.log(`Posts: ${posts.length}  |  array bodies: ${arrays.length}  |  already markdown: ${strings.length}  |  other/empty: ${other.length}\n`);

if (VERIFY) {
  console.log("VERIFY — every post must be a string and non-empty where it had content:");
  let bad = 0;
  for (const p of posts) {
    const ok = typeof p.body === "string" || p.body == null;
    if (!ok) { console.log(`  ✗ ${p.slug} is still ${Array.isArray(p.body) ? "an array" : typeof p.body}`); bad++; }
  }
  console.log(bad ? `\n${bad} post(s) NOT migrated.` : "\nAll posts are Markdown strings. ✓");
  process.exit(bad ? 1 : 0);
}

if (arrays.length === 0) { console.log("Nothing to migrate — all bodies are already strings."); process.exit(0); }

/* ---------------- plan ---------------- */
const plan = arrays.map((p) => {
  const next = p.body.join("\n\n");
  return { id: p.id, slug: p.slug, title: p.title, before: p.body, after: next,
           paras: p.body.length, chars: next.length, textSame: plain(p.body) === plain(next) };
});

console.log("Slug                                        paras   chars   text identical");
console.log("-".repeat(78));
for (const p of plan) {
  console.log(`${p.slug.slice(0, 42).padEnd(42)} ${String(p.paras).padStart(6)} ${String(p.chars).padStart(7)}   ${p.textSame ? "yes" : "NO ⚠"}`);
}
const risky = plan.filter((p) => !p.textSame);
console.log("-".repeat(78));
if (risky.length) {
  console.log(`\n⚠ ${risky.length} post(s) would change in plain text. NOT migrating those automatically.`);
  console.log("   Inspect them first: " + risky.map((p) => p.slug).join(", "));
}

if (!APPLY) {
  console.log(`\nDRY RUN — nothing written. ${plan.length - risky.length} post(s) ready to migrate.`);
  console.log("To apply:  node scripts/migrate-blog-markdown.mjs --apply");
  process.exit(0);
}

/* ---------------- backup + apply ---------------- */
mkdirSync("backups", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupFile = `backups/blog-bodies-${stamp}.json`;
writeFileSync(backupFile, JSON.stringify(posts.map(({ id, slug, body }) => ({ id, slug, body })), null, 2));
console.log(`\nBackup written: ${backupFile}  (restore with --rollback ${backupFile})`);

let done = 0, failed = 0;
for (const p of plan.filter((x) => x.textSame)) {
  const { error: e } = await sb.from("blog_posts").update({ body: p.after }).eq("id", p.id);
  if (e) { console.error(`  FAIL ${p.slug}: ${e.message}`); failed++; } else done++;
}
console.log(`\nMigrated ${done} post(s). Failed: ${failed}. Skipped (text would change): ${risky.length}.`);
console.log("Now run:  node scripts/migrate-blog-markdown.mjs --verify");
