import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "media";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin().from("media").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ media: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: `Could not load media: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Upload a file: multipart/form-data with a "file" field. */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 15MB)." }, { status: 400 });

    const admin = supabaseAdmin();
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${Date.now()}-${cleanName}`;

    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (upErr) throw upErr;

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);

    const { data, error } = await admin
      .from("media")
      .insert({ name: file.name, path, url: pub.publicUrl, size: file.size, mime_type: file.type || null })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, media: data });
  } catch (e) {
    return NextResponse.json({ error: `Upload failed: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Delete a file: DELETE /api/admin/media?id=... */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    const admin = supabaseAdmin();
    const { data: row } = await admin.from("media").select("path").eq("id", id).single();
    if (row?.path) await admin.storage.from(BUCKET).remove([row.path]);
    const { error } = await admin.from("media").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `Could not delete: ${(e as Error).message}` }, { status: 500 });
  }
}
