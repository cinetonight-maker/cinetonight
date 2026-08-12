// Pushes ONLY content/site.json's hero + rows + continueWatching into
// Supabase's home_config table. This is the missing piece after editing
// content/site.json: that file is just an offline fallback — the live
// site (and `npm run dev`, since it points at the same real Supabase
// project) reads home_config from Supabase itself, so editing the JSON
// alone never shows up until this runs.
//
// Deliberately narrower than scripts/migrate-content-to-supabase.mjs: this
// one does NOT touch the movies or blog_posts tables, so it can't clobber
// any catalogue/blog edits you've made through /admin since the last full
// migration. Safe to re-run any time you change content/site.json's rows.
//
// Usage:  node scripts/sync-home-rows.mjs

import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
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

async function loadJson(relPath) {
  const text = await readFile(resolve(process.cwd(), relPath), "utf8");
  return JSON.parse(text);
}

try {
  const site = await loadJson("content/site.json");
  const { error } = await supabase.from("home_config").upsert(
    {
      id: 1,
      hero_slides: site.hero?.slides ?? [],
      hero_interval_ms: site.hero?.intervalMs ?? 6000,
      rows: site.rows ?? [],
      continue_watching: site.continueWatching ?? [],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(error.message);
  console.log(`✓ Synced hero slides, ${site.rows?.length ?? 0} home rows (including K-Drama, Anime, C-Drama, Telugu), and ${site.continueWatching?.length ?? 0} continue-watching entries to Supabase.`);
  console.log("Refresh your site (or restart `npm run dev`) to see them.");
} catch (e) {
  console.error("\nSync failed:", e.message);
  process.exit(1);
}
