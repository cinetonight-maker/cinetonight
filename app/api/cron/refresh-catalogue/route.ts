import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { trendingLiveTmdb, fetchTitle, parseTmdbId, tmdbConfigured } from "@/lib/tmdb";
import type { Movie } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Keep each run bounded: enough to keep the catalogue feeling alive, never
// enough to flood it (or blow through TMDB rate limits) in one go.
const MAX_NEW_PER_RUN = 8;
const HERO_SLIDES = 5;

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — no secret set, no runs allowed
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function toRow(m: Movie) {
  return {
    id: m.id, tmdb_id: m.tmdbId ?? null, title: m.title, year: m.year, genres: m.genres, kind: m.kind,
    rating: m.rating, votes: m.votes ?? null, runtime: m.runtime, cert: m.cert, language: m.language,
    director: m.director, writers: m.writers, cast_list: m.cast, description: m.desc,
    poster_path: m.posterPath ?? null, backdrop_path: m.backdropPath ?? null, trailer_key: m.trailerKey ?? null,
  };
}

/** Daily catalogue auto-refresh: pulls TMDB's current global trending list,
 *  adds any titles the catalogue doesn't have yet (full details — cast,
 *  trailer, certification — via fetchTitle, exactly like adding through
 *  the dashboard), and rotates the homepage hero to the top trending
 *  titles that have backdrop art. Editor-added titles are never touched,
 *  and nothing is ever deleted — this only ADDS and re-points the hero.
 *  Wired in vercel.json as a scheduled cron; Vercel sends CRON_SECRET as a
 *  bearer token automatically once that env var is set. */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!tmdbConfigured) {
    return NextResponse.json({ ok: true, skipped: "TMDB_API_KEY not set." });
  }

  const admin = supabaseAdmin();
  const summary = { added: [] as string[], heroSlides: [] as string[], errors: [] as string[] };

  try {
    // 1 · Current global trending (movies + shows, TMDB's real trending feed).
    const trending = await trendingLiveTmdb("all", 20);
    if (!trending.length) return NextResponse.json({ ok: true, skipped: "TMDB returned no trending titles." });

    // 2 · What do we already have? Match by tmdb_id.
    const { data: existingRows, error: exErr } = await admin.from("movies").select("id, tmdb_id");
    if (exErr) throw exErr;
    const byTmdbId = new Map<number, string>();
    for (const r of existingRows ?? []) if (r.tmdb_id) byTmdbId.set(Number(r.tmdb_id), r.id);

    // 3 · Add missing trending titles (bounded), with full details.
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
        summary.added.push(`${full.title} (${full.year})`);
        added++;
      } catch (e) {
        summary.errors.push(`add "${t.title}": ${(e as Error).message}`);
      }
    }

    // 4 · Re-point the hero at the top trending titles we now hold locally
    //     (backdrop art required — the hero is a full-bleed banner).
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
      if (heroErr) summary.errors.push(`hero: ${heroErr.message}`);
      else summary.heroSlides = heroIds;
    }

    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return NextResponse.json({ error: `Refresh failed: ${(e as Error).message}`, ...summary }, { status: 500 });
  }
}
