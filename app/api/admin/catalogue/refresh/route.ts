import { NextResponse } from "next/server";
import { fetchTitle } from "@/lib/tmdb";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { MovieKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Re-pull a title from TMDB and overwrite its TMDB-sourced fields, keeping
 *  the catalogue slug (id) and any custom poster/backdrop override intact.
 *  Body: { id: "<catalogue slug>" } — the title must already have a tmdb_id. */
export async function POST(request: Request) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

    const admin = supabaseAdmin();
    const { data: existing, error: findErr } = await admin.from("movies").select("id, tmdb_id, kind").eq("id", id).maybeSingle();
    if (findErr) throw findErr;
    if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (!existing.tmdb_id) return NextResponse.json({ error: "This title has no TMDB id to refresh from (it was added manually)." }, { status: 400 });

    const fresh = await fetchTitle(existing.kind as MovieKind, String(existing.tmdb_id));
    if (!fresh) return NextResponse.json({ error: "TMDB didn't return anything for this title — it may have been removed there." }, { status: 502 });

    const patch = {
      title: fresh.title, year: fresh.year, genres: fresh.genres, rating: fresh.rating, votes: fresh.votes ?? null,
      runtime: fresh.runtime, cert: fresh.cert, language: fresh.language, director: fresh.director, writers: fresh.writers,
      cast_list: fresh.cast, description: fresh.desc, poster_path: fresh.posterPath, backdrop_path: fresh.backdropPath,
      trailer_key: fresh.trailerKey, updated_at: new Date().toISOString(),
    };
    const { data, error } = await admin.from("movies").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, movie: data });
  } catch (e) {
    return NextResponse.json({ error: `Could not refresh: ${(e as Error).message}` }, { status: 500 });
  }
}
