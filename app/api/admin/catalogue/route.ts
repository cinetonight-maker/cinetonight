import { NextResponse } from "next/server";
import { fetchTitle, parseTmdbId } from "@/lib/tmdb";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Movie } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function toRow(m: Partial<Movie> & { id: string }) {
  const row: Record<string, unknown> = { id: m.id };
  if (m.tmdbId !== undefined) row.tmdb_id = m.tmdbId;
  if (m.title !== undefined) row.title = m.title;
  if (m.year !== undefined) row.year = m.year;
  if (m.genres !== undefined) row.genres = m.genres;
  if (m.kind !== undefined) row.kind = m.kind;
  if (m.rating !== undefined) row.rating = m.rating;
  if (m.votes !== undefined) row.votes = m.votes;
  if (m.runtime !== undefined) row.runtime = m.runtime;
  if (m.cert !== undefined) row.cert = m.cert;
  if (m.language !== undefined) row.language = m.language;
  if (m.director !== undefined) row.director = m.director;
  if (m.writers !== undefined) row.writers = m.writers;
  if (m.cast !== undefined) row.cast_list = m.cast;
  if (m.desc !== undefined) row.description = m.desc;
  if (m.posterPath !== undefined) row.poster_path = m.posterPath;
  if (m.backdropPath !== undefined) row.backdrop_path = m.backdropPath;
  if (m.trailerKey !== undefined) row.trailer_key = m.trailerKey;
  return row;
}

function fromRow(r: any): Movie {
  return {
    id: r.id, tmdbId: r.tmdb_id ?? undefined, title: r.title, year: r.year, genres: r.genres ?? [],
    kind: r.kind, rating: Number(r.rating) || 0, votes: r.votes ?? undefined, runtime: r.runtime ?? "",
    cert: r.cert ?? "", language: r.language ?? "", director: r.director ?? "", writers: r.writers ?? "",
    cast: r.cast_list ?? [], desc: r.description ?? "",
    posterPath: r.poster_url ?? r.poster_path ?? null, backdropPath: r.backdrop_url ?? r.backdrop_path ?? null,
    trailerKey: r.trailer_key ?? null,
  };
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin().from("movies").select("*").order("year", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ movies: (data ?? []).map(fromRow) });
  } catch (e) {
    return NextResponse.json({ error: `Could not load catalogue: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Add a title to the catalogue. Either by TMDB id (body: { id: "tmdb-m-123" | number, kind }),
 *  or manually with no TMDB match (body: { manual: true, title, kind }) — useful for titles TMDB
 *  doesn't have. Manual entries can still have every field filled in via the edit panel. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const admin = supabaseAdmin();

    if (body?.manual) {
      const title = String(body?.title ?? "").trim();
      if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
      const realKind = body?.kind === "series" ? "series" : "movie";

      let slug = slugify(title);
      const { data: clash } = await admin.from("movies").select("id").eq("id", slug).maybeSingle();
      if (!slug || clash) slug = `${slug || "title"}-${Date.now().toString(36)}`;

      const row = toRow({
        id: slug, title, kind: realKind, year: new Date().getFullYear(), genres: [], rating: 0,
        runtime: "", cert: "", language: "", director: "", writers: "", cast: [], desc: "",
      });
      const { data, error } = await admin.from("movies").insert(row).select().single();
      if (error) throw error;
      return NextResponse.json({ ok: true, movie: fromRow(data) });
    }

    const { id, kind } = body;
    const parsed = typeof id === "string" ? parseTmdbId(id) : null;
    const realKind = parsed?.kind ?? (kind === "series" ? "series" : "movie");
    const realId = parsed?.id ?? String(id);

    const full = await fetchTitle(realKind, realId);
    if (!full) return NextResponse.json({ error: "Could not fetch that title from TMDB." }, { status: 404 });

    const { data: existingByTmdb } = await admin.from("movies").select("id").eq("tmdb_id", full.tmdbId).maybeSingle();
    if (existingByTmdb) return NextResponse.json({ error: "That title is already in the catalogue." }, { status: 409 });

    let slug = slugify(full.title);
    const { data: clash } = await admin.from("movies").select("id").eq("id", slug).maybeSingle();
    if (!slug || clash) slug = `${slug || "title"}-${full.tmdbId}`;

    const row = toRow({ ...full, id: slug });
    const { data, error } = await admin.from("movies").insert(row).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, movie: fromRow(data) });
  } catch (e) {
    return NextResponse.json({ error: `Could not add: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Edit an existing title's fields. Body: { id, ...patch }. Accepts posterUrl/backdropUrl
 *  (Media Library URLs) to override the TMDB-sourced artwork for this one title. */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const id = String(body?.id ?? "");
    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const strFields: [string, string][] = [
      ["title", "title"], ["runtime", "runtime"], ["cert", "cert"], ["language", "language"],
      ["director", "director"], ["writers", "writers"], ["desc", "description"], ["kind", "kind"],
    ];
    for (const [from, to] of strFields) if (typeof body[from] === "string") patch[to] = body[from];
    if (body.year !== undefined) patch.year = Number(body.year) || 0;
    if (body.rating !== undefined) patch.rating = Number(body.rating) || 0;
    if (body.votes !== undefined) patch.votes = Number(body.votes) || 0;
    if (Array.isArray(body.genres)) patch.genres = body.genres;
    if (typeof body.posterUrl === "string") patch.poster_url = body.posterUrl || null;
    if (typeof body.backdropUrl === "string") patch.backdrop_url = body.backdropUrl || null;

    const { data, error } = await supabaseAdmin().from("movies").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, movie: fromRow(data) });
  } catch (e) {
    return NextResponse.json({ error: `Could not save: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Remove a title: DELETE /api/admin/catalogue?id=slug */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    const { error, count } = await supabaseAdmin().from("movies").delete({ count: "exact" }).eq("id", id);
    if (error) throw error;
    if (!count) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `Could not remove: ${(e as Error).message}` }, { status: 500 });
  }
}
