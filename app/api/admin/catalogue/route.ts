import { NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fetchTitle, parseTmdbId } from "@/lib/tmdb";
import type { Movie } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE = resolve(process.cwd(), "content/movies.json");

function guard() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "The dashboard is available in development only (npm run dev)." },
      { status: 403 },
    );
  }
  return null;
}

const readAll = async (): Promise<Movie[]> => JSON.parse(await readFile(FILE, "utf8"));
const writeAll = (list: Movie[]) => writeFile(FILE, JSON.stringify(list, null, 2), "utf8");

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function GET() {
  const blocked = guard();
  if (blocked) return blocked;
  return NextResponse.json({ movies: await readAll() });
}

/** Add a title to the catalogue by TMDB id (body: { tmdbId: "tmdb-m-123" | number, kind }). */
export async function POST(request: Request) {
  const blocked = guard();
  if (blocked) return blocked;
  try {
    const { id, kind } = await request.json();
    const parsed = typeof id === "string" ? parseTmdbId(id) : null;
    const realKind = parsed?.kind ?? (kind === "series" ? "series" : "movie");
    const realId = parsed?.id ?? String(id);

    const full = await fetchTitle(realKind, realId);
    if (!full) return NextResponse.json({ error: "Could not fetch that title from TMDB." }, { status: 404 });

    const list = await readAll();
    if (list.some((m) => m.tmdbId === full.tmdbId)) {
      return NextResponse.json({ error: "That title is already in the catalogue." }, { status: 409 });
    }
    // give it a clean slug id (falls back to the tmdb id if taken)
    let slug = slugify(full.title);
    if (!slug || list.some((m) => m.id === slug)) slug = `${slug || "title"}-${full.tmdbId}`;

    const added: Movie = { ...full, id: slug };
    list.push(added);
    await writeAll(list);
    return NextResponse.json({ ok: true, movie: added });
  } catch (e) {
    return NextResponse.json({ error: `Could not add: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Remove a title: DELETE /api/admin/catalogue?id=slug */
export async function DELETE(request: Request) {
  const blocked = guard();
  if (blocked) return blocked;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const list = await readAll();
  const next = list.filter((m) => m.id !== id);
  if (next.length === list.length) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await writeAll(next);
  return NextResponse.json({ ok: true });
}
