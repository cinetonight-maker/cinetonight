// One-time seed (and re-seed) of the `classics` table from
// content/classics.json — run AFTER creating the table with
// supabase/classics.sql (Supabase Dashboard → SQL Editor).
//
// Upserts by slug, so re-running never duplicates. After this, manage the
// shelf from Dashboard → Free Movies; the JSON file remains only as the
// offline fallback the site uses if Supabase is ever unreachable.
//
// Usage:  node scripts/sync-classics.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { readFile as readFileP } from "node:fs/promises";
import { resolve } from "node:path";
import { WebSocket } from "ws";

function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const rawLine of text.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* no .env.local — fine if the vars are already in the environment */
  }
}
loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (check .env.local).");
  process.exit(1);
}

const supabase = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: WebSocket },
});

// --prune: after syncing, DELETE any rows whose slug is NOT in
// content/classics.json — makes the table an exact mirror of the file.
// Use it when the file is your source of truth (e.g. replacing the whole
// shelf). DON'T use it once you're curating from the dashboard, or it
// will delete films you added there that aren't in the JSON.
const prune = process.argv.includes("--prune");

try {
  const classics = JSON.parse(await readFileP(resolve(process.cwd(), "content/classics.json"), "utf8"));
  let order = 0;
  for (const c of classics) {
    const { error } = await supabase.from("classics").upsert(
      {
        slug: c.slug,
        title: c.title,
        year: c.year,
        source_type: c.source.type,
        source_id: c.source.id,
        tmdb_id: c.tmdbId ?? null,
        description: c.desc ?? "",
        runtime: c.runtime ?? null,
        genre: c.genre ?? null,
        status: c.status === "published" ? "published" : "draft",
        note: c.note ?? null,
        sort_order: order++,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" },
    );
    if (error) throw new Error(`"${c.slug}": ${error.message}`);
    console.log(`✓ ${c.status.padEnd(9)} ${c.title} (${c.year})`);
  }
  if (prune) {
    const keep = classics.map((c) => c.slug);
    const { data: existing, error: listErr } = await supabase.from("classics").select("slug");
    if (listErr) throw new Error(listErr.message);
    const stale = (existing ?? []).map((r) => r.slug).filter((s) => !keep.includes(s));
    if (stale.length) {
      const { error: delErr } = await supabase.from("classics").delete().in("slug", stale);
      if (delErr) throw new Error(delErr.message);
      for (const s of stale) console.log(`✕ removed   ${s} (not in classics.json)`);
    } else {
      console.log("(prune: nothing to remove — table already matches the file)");
    }
  }

  console.log(`\nDone — ${classics.length} films synced${prune ? ", table mirrored to the file" : ""}. Manage the shelf from /admin → Free Movies from now on.`);
} catch (e) {
  console.error("\nSync failed:", e.message);
  console.error("Did you run supabase/classics.sql in the Supabase SQL Editor first?");
  process.exit(1);
}
