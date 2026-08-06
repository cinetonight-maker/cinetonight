// One-time migration: copies your existing content/movies.json and
// content/site.json into Supabase (movies, home_config, blog_posts tables),
// so nothing you already have is lost when the dashboard cuts over from
// local files to the database.
//
// Safe to re-run — it upserts by id/slug, so running it twice just
// overwrites with the same data instead of duplicating rows. Run it AFTER
// applying supabase/schema.sql.
//
// Usage:  node scripts/migrate-content-to-supabase.mjs

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

async function migrateMovies() {
  const movies = await loadJson("content/movies.json");
  const rows = movies.map((m) => ({
    id: m.id,
    tmdb_id: m.tmdbId ?? null,
    title: m.title,
    year: m.year ?? 0,
    genres: m.genres ?? [],
    kind: m.kind ?? "movie",
    rating: m.rating ?? 0,
    votes: m.votes ?? null,
    runtime: m.runtime ?? "",
    cert: m.cert ?? "",
    language: m.language ?? "",
    director: m.director ?? "",
    writers: m.writers ?? "",
    cast_list: m.cast ?? [],
    description: m.desc ?? "",
    poster_path: m.posterPath ?? null,
    backdrop_path: m.backdropPath ?? null,
    trailer_key: m.trailerKey ?? null,
  }));
  // upsert in batches to stay well under any request-size limit
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { error } = await supabase.from("movies").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`movies upsert failed: ${error.message}`);
  }
  console.log(`✓ Migrated ${rows.length} catalogue titles.`);
}

async function migrateHomeConfig() {
  const site = await loadJson("content/site.json");
  const { error } = await supabase.from("home_config").upsert(
    {
      id: 1,
      hero_slides: site.hero?.slides ?? [],
      hero_interval_ms: site.hero?.intervalMs ?? 6000,
      rows: site.rows ?? [],
      continue_watching: site.continueWatching ?? [],
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`home_config upsert failed: ${error.message}`);
  console.log(`✓ Migrated hero slides, ${site.rows?.length ?? 0} home rows, and ${site.continueWatching?.length ?? 0} continue-watching entries.`);
}

async function migrateBlog() {
  const site = await loadJson("content/site.json");
  const posts = site.blog ?? [];
  const rows = posts.map((b) => ({
    slug: b.slug,
    title: b.title,
    cat: b.cat ?? "Guide",
    excerpt: b.excerpt ?? "",
    body: b.body ?? [],
    date_label: b.date ?? "",
    read_label: b.read ?? "5 min",
    status: "published",
  }));
  if (rows.length) {
    const { error } = await supabase.from("blog_posts").upsert(rows, { onConflict: "slug" });
    if (error) throw new Error(`blog_posts upsert failed: ${error.message}`);
  }
  console.log(`✓ Migrated ${rows.length} blog posts.`);
}

try {
  await migrateMovies();
  await migrateHomeConfig();
  await migrateBlog();
  console.log("\nDone. Your catalogue, home page config, and blog posts now live in Supabase.");
  console.log("content/movies.json and content/site.json are no longer read by the live site — keep them as a local backup if you like, or delete them later.");
} catch (e) {
  console.error("\nMigration failed:", e.message);
  process.exit(1);
}
