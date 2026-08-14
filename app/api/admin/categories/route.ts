import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Blog category manager. Auth is enforced for every /api/admin/** route by
 *  the proxy (Supabase session + admin_users allowlist) before this runs. */

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin()
      .from("blog_categories").select("*").order("name", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ categories: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: `Could not load categories: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Create: POST { name } */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body?.name ?? "").trim().slice(0, 40);
    if (!name) return NextResponse.json({ error: "Category name is required." }, { status: 400 });
    const { data, error } = await supabaseAdmin()
      .from("blog_categories").upsert({ name }, { onConflict: "name" }).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, category: data });
  } catch (e) {
    return NextResponse.json({ error: `Could not add category: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Delete: DELETE /api/admin/categories?id=... (posts keep their label) */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    const { error } = await supabaseAdmin().from("blog_categories").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `Could not delete category: ${(e as Error).message}` }, { status: 500 });
  }
}
