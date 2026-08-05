import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List every comment (pending + approved + rejected) for the dashboard. */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin().from("comments").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ comments: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: `Could not load comments: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Approve/reject a comment. Body: { id, status: "approved" | "rejected" | "pending" } */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = String(body?.id ?? "");
    const status = body?.status;
    if (!id || !["approved", "rejected", "pending"].includes(status)) {
      return NextResponse.json({ error: "Missing id or invalid status." }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin().from("comments").update({ status }).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, comment: data });
  } catch (e) {
    return NextResponse.json({ error: `Could not update comment: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Delete a comment: DELETE /api/admin/comments?id=... */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    const { error } = await supabaseAdmin().from("comments").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `Could not delete comment: ${(e as Error).message}` }, { status: 500 });
  }
}
