import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin().from("nav_links").select("*").order("location").order("sort_order");
    if (error) throw error;
    return NextResponse.json({ links: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: `Could not load links: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Create a link. Body: { location, label, url, sort_order?, is_external? } */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const location = String(body?.location ?? "");
    const label = String(body?.label ?? "").trim();
    const url = String(body?.url ?? "").trim();
    if (!["footer_explore", "footer_support", "footer_legal", "header"].includes(location)) {
      return NextResponse.json({ error: "Invalid location." }, { status: 400 });
    }
    if (!label || !url) return NextResponse.json({ error: "Label and URL are required." }, { status: 400 });

    const { data, error } = await supabaseAdmin()
      .from("nav_links")
      .insert({ location, label, url, sort_order: Number(body?.sort_order) || 0, is_external: !!body?.is_external })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, link: data });
  } catch (e) {
    return NextResponse.json({ error: `Could not create link: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Update a link. Body: { id, ...patch } */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const id = String(body?.id ?? "");
    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
    const patch: Record<string, unknown> = {};
    for (const k of ["label", "url", "location"]) if (typeof body[k] === "string") patch[k] = body[k];
    if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0;
    if (body.is_external !== undefined) patch.is_external = !!body.is_external;

    const { data, error } = await supabaseAdmin().from("nav_links").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, link: data });
  } catch (e) {
    return NextResponse.json({ error: `Could not save link: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Delete a link: DELETE /api/admin/nav?id=... */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    const { error } = await supabaseAdmin().from("nav_links").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `Could not delete link: ${(e as Error).message}` }, { status: 500 });
  }
}
