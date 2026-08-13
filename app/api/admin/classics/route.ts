import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function cleanPatch(body: any): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string") patch.title = body.title.trim();
  if (typeof body.slug === "string" && body.slug.trim()) patch.slug = slugify(body.slug);
  if (body.year !== undefined) patch.year = Number(body.year) || 0;
  if (body.source_type === "archive" || body.source_type === "youtube") patch.source_type = body.source_type;
  if (typeof body.source_id === "string") patch.source_id = body.source_id.trim();
  if (body.tmdb_id !== undefined) patch.tmdb_id = body.tmdb_id === null || body.tmdb_id === "" ? null : Number(body.tmdb_id) || null;
  if (typeof body.description === "string") patch.description = body.description;
  if (typeof body.runtime === "string") patch.runtime = body.runtime.trim() || null;
  if (typeof body.genre === "string") patch.genre = body.genre.trim() || null;
  if (body.status === "draft" || body.status === "published") patch.status = body.status;
  if (typeof body.note === "string") patch.note = body.note.trim() || null;
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0;
  return patch;
}

/** List every classic (draft + published) — auth already checked by middleware. */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin()
      .from("classics")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ classics: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: `Could not load classics: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Create. Body: { title, year, source_type, source_id, ... } */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = String(body?.title ?? "").trim();
    const sourceId = String(body?.source_id ?? "").trim();
    if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
    if (!sourceId) return NextResponse.json({ error: "Source ID is required (the archive.org identifier or YouTube video id)." }, { status: 400 });

    let slug = slugify(body?.slug || title);
    const admin = supabaseAdmin();
    const { data: clash } = await admin.from("classics").select("id").eq("slug", slug).maybeSingle();
    if (clash) slug = `${slug}-${Date.now().toString(36)}`;

    const { data, error } = await admin
      .from("classics")
      .insert({ ...cleanPatch(body), slug, title, source_id: sourceId, status: body?.status === "published" ? "published" : "draft" })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, classic: data });
  } catch (e) {
    return NextResponse.json({ error: `Could not add film: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Update. Body: { id, ...fields } */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const id = String(body?.id ?? "");
    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
    const patch = { ...cleanPatch(body), updated_at: new Date().toISOString() };
    const { data, error } = await supabaseAdmin().from("classics").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, classic: data });
  } catch (e) {
    return NextResponse.json({ error: `Could not save film: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Delete: DELETE /api/admin/classics?id=... */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    const { error } = await supabaseAdmin().from("classics").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `Could not delete film: ${(e as Error).message}` }, { status: 500 });
  }
}
