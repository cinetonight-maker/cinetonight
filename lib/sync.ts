import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { trendingLiveTmdb, fetchTitle, parseTmdbId, tmdbConfigured } from "@/lib/tmdb";
import type { Movie, MovieKind } from "@/lib/types";

/** One sync engine for the whole catalogue, shared by the daily cron and the
 *  dashboard's Sync Now button, so both paths always behave identically.
 *
 *  A run does three things, each bounded so a single run can never flood the
 *  catalogue or blow through TMDB rate limits:
 *   1. ADD    - pulls TMDB's current global trending list and adds any titles
 *               the catalogue is missing (full details, like a dashboard add).
 *   2. FRESHEN - re-pulls the STALEST existing titles (oldest updated_at)
 *               so ratings, votes, artwork and trailers stay current forever.
 *               Custom poster/backdrop uploads are never touched.
 *   3. HERO   - if hero mode is 'auto', re-points the homepage hero at the
 *               top trending titles with backdrop art. 'manual' mode locks
 *               the hero to the editor's picks and skips this entirely.
 *  Every run is recorded in sync_log so the dashboard can show what happened.
 *  Nothing is ever deleted by a sync. */

const MAX_NEW_PER_RUN = 8;
const MAX_FRESHEN_PER_RUN = 15;
const HERO_SLIDES = 5;

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export type SyncResult = {
  ok: boolean;
  skipped?: string;
  added: string[];
  refreshed: number;
  heroSlides: string[];
  heroMode: "auto" | "manual";
  errors: string[];
};

function toRow(m: Movie) {
  return {
    id: m.id, tmdb_id: m.tmdbId ?? null, title: m.title, year: m.year, genres: m.genres, kind: m.kind,
    rating: m.rating, votes: m.votes ?? null, runtime: m.runtime, cert: m.cert, language: m.language,
    director: m.director, writers: m.writers, cast_list: m.cast, description: m.desc,
    poster_path: m.posterPath ?? null, backdrop_path: m.backdropPath ?? null, trailer_key: m.trailerKey ?? null,
  };
}

function freshenPatch(fresh: Movie) {
  return {
    title: fresh.title, year: fresh.year, genres: fresh.genres, rating: fresh.rating, votes: fresh.votes ?? null,
    runtime: fresh.runtime, cert: fresh.cert, language: fresh.language, director: fresh.director, writers: fresh.writers,
    cast_list: fresh.cast, description: fresh.desc, poster_path: fresh.posterPath, backdrop_path: fresh.backdropPath,
    trailer_key: fresh.trailerKey, updated_at: new Date().toISOString(),
  };
}

export async function syncCatalogue(trigger: "cron" | "manual"): Promise<SyncResult> {
  const result: SyncResult = { ok: true, added: [], refreshed: 0, heroSlides: [], heroMode: "auto", errors: [] };
  if (!tmdbConfigured) return { ...result, skipped: "TMDB_API_KEY not set." };

  const admin = supabaseAdmin();
  const startedAt = new Date().toISOString();

  try {
    /* -- hero mode (read early: it also drives step 3) ------------------- */
    // select * so this works even before the SQL upgrade adds hero_mode
    const { data: home } = await admin.from("home_config").select("*").eq("id", 1).maybeSingle();
    result.heroMode = home?.hero_mode === "manual" ? "manual" : "auto";

    /* -- 1 - current global trending ------------------------------------ */
    const trending = await trendingLiveTmdb("all", 20);
    if (!trending.length) return { ...result, skipped: "TMDB returned no trending titles." };

    const { data: existingRows, error: exErr } = await admin
      .from("movies").select("id, tmdb_id, kind, updated_at");
    if (exErr) throw exErr;
    const byTmdbId = new Map<number, string>();
    for (const r of existingRows ?? []) if (r.tmdb_id) byTmdbId.set(Number(r.tmdb_id), r.id);

    /* -- 2 - add missing trending titles (bounded) ----------------------- */
    let added = 0;
    for (const t of trending) {
      if (added >= MAX_NEW_PER_RUN) break;
      if (!t.tmdbId || byTmdbId.has(t.tmdbId)) continue;
      const parsed = parseTmdbId(t.id);
      if (!parsed) continue;
      try {
        const full = await fetchTitle(parsed.kind, parsed.id);
        if (!full?.tmdbId) continue;
        let slug = slugify(full.title) || `title-${full.tmdbId}`;
        const { data: clash } = await admin.from("movies").select("id").eq("id", slug).maybeSingle();
        if (clash) slug = `${slug}-${full.year || full.tmdbId}`;
        const { error: insErr } = await admin.from("movies").insert(toRow({ ...full, id: slug }));
        if (insErr) throw insErr;
        byTmdbId.set(full.tmdbId, slug);
        result.added.push(`${full.title} (${full.year})`);
        added++;
      } catch (e) {
        result.errors.push(`add "${t.title}": ${(e as Error).message}`);
      }
    }

    /* -- 3 - freshen the stalest existing titles (bounded) --------------- */
    const stalest = (existingRows ?? [])
      .filter((r) => r.tmdb_id)
      .sort((a, b) => new Date(a.updated_at ?? 0).getTime() - new Date(b.updated_at ?? 0).getTime())
      .slice(0, MAX_FRESHEN_PER_RUN);
    for (const row of stalest) {
      try {
        const fresh = await fetchTitle(row.kind as MovieKind, String(row.tmdb_id));
        if (!fresh) continue;
        const { error: upErr } = await admin.from("movies").update(freshenPatch(fresh)).eq("id", row.id);
        if (upErr) throw upErr;
        result.refreshed++;
      } catch (e) {
        result.errors.push(`freshen "${row.id}": ${(e as Error).message}`);
      }
    }

    /* -- 4 - hero rotation (auto mode only) ------------------------------ */
    if (result.heroMode === "auto") {
      const heroIds: string[] = [];
      for (const t of trending) {
        if (heroIds.length >= HERO_SLIDES) break;
        const localId = t.tmdbId ? byTmdbId.get(t.tmdbId) : undefined;
        if (localId && t.backdropPath) heroIds.push(localId);
      }
      if (heroIds.length >= 3) {
        const { error: heroErr } = await admin
          .from("home_config")
          .update({ hero_slides: heroIds, updated_at: new Date().toISOString() })
          .eq("id", 1);
        if (heroErr) result.errors.push(`hero: ${heroErr.message}`);
        else result.heroSlides = heroIds;
      }
    }
  } catch (e) {
    result.ok = false;
    result.errors.push((e as Error).message);
  }

  /* -- record the run (best effort: a logging failure never fails a sync,
        and a missing sync_log table just means the SQL upgrade hasn't been
        run yet - the sync itself still works) --------------------------- */
  try {
    await supabaseAdmin().from("sync_log").insert({
      trigger, started_at: startedAt, finished_at: new Date().toISOString(),
      ok: result.ok, added: result.added, refreshed: result.refreshed,
      hero_slides: result.heroSlides, errors: result.errors,
    });
  } catch { /* ignore */ }

  return result;
}
