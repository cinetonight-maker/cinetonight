import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: list approved comments for a title. GET /api/comments?movieId=... */
export async function GET(request: Request) {
  const movieId = new URL(request.url).searchParams.get("movieId");
  if (!movieId) return NextResponse.json({ error: "Missing movieId." }, { status: 400 });
  try {
    const { data, error } = await supabaseAdmin()
      .from("comments")
      .select("id, name, body, rating, created_at")
      .eq("movie_id", movieId)
      .eq("status", "approved")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ comments: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: `Could not load comments: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Public: submit a comment. Always lands as status="pending" — an admin has
 *  to approve it in the dashboard before it appears anywhere. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const movieId = String(body?.movieId ?? "").trim();
    const name = String(body?.name ?? "").trim().slice(0, 80);
    const text = String(body?.body ?? "").trim().slice(0, 2000);
    const rating = Number.isFinite(body?.rating) ? Math.min(5, Math.max(1, Math.round(body.rating))) : null;

    if (!movieId || !name || !text) {
      return NextResponse.json({ error: "Missing movieId, name, or body." }, { status: 400 });
    }

    const { error } = await supabaseAdmin()
      .from("comments")
      .insert({ movie_id: movieId, name, body: text, rating, status: "pending" });
    if (error) throw error;

    return NextResponse.json({ ok: true, message: "Thanks! Your comment will appear once it's approved." });
  } catch (e) {
    return NextResponse.json({ error: `Could not submit: ${(e as Error).message}` }, { status: 500 });
  }
}
