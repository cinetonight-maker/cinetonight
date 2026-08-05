import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** List every page (draft + published) — auth already checked by middleware. */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin().from("pages").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ pages: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: `Could not load pages: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Create a page. Body: { title, content?, status? } */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = String(body?.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });

    let slug = slugify(body?.slug || title);
    const admin = supabaseAdmin();
    const { data: clash } = await admin.from("pages").select("id").eq("slug", slug).maybeSingle();
    if (clash) slug = `${slug}-${Date.now().toString(36)}`;

    const { data, error } = await admin
      .from("pages")
      .insert({ slug, title, content: body?.content ?? "", status: body?.status === "published" ? "published" : "draft" })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, page: data });
  } catch (e) {
    return NextResponse.json({ error: `Could not create page: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Update a page. Body: { id, title?, slug?, content?, status? } */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const id = String(body?.id ?? "");
    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.title === "string") patch.title = body.title;
    if (typeof body.slug === "string" && body.slug.trim()) patch.slug = slugify(body.slug);
    if (typeof body.content === "string") patch.content = body.content;
    if (body.status === "draft" || body.status === "published") patch.status = body.status;

    const { data, error } = await supabaseAdmin().from("pages").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, page: data });
  } catch (e) {
    return NextResponse.json({ error: `Could not save page: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Delete a page: DELETE /api/admin/pages?id=... */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    const { error } = await supabaseAdmin().from("pages").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `Could not delete page: ${(e as Error).message}` }, { status: 500 });
  }
}
