import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { clientKey, isRateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

/** Public: list approved comments for a title. GET /api/comments?movieId=... */
export async function GET(request: Request) {
  // The POST limiter (5/min) protects writes; reads were unlimited, which
  // let anything spray ?movieId=<junk> into direct Supabase queries. 60/min
  // is far above what a real visitor generates. The admin client here does
  // NOT cache (route handlers fetch no-store), so this is quota protection
  // for Supabase, not an R2 concern.
  if (isRateLimited(clientKey(request), "comments-read", { windowMs: RATE_LIMIT_WINDOW_MS, max: 60 })) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const movieId = (new URL(request.url).searchParams.get("movieId") ?? "").slice(0, 120);
  if (!movieId) return NextResponse.json({ error: "Missing movieId." }, { status: 400 });
  try {
    const { data, error } = await supabaseAdmin()
      .from("comments")
      .select("id, name, body, rating, created_at")
      .eq("movie_id", movieId)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(100);
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
    if (isRateLimited(clientKey(request), "comments", { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX })) {
      return NextResponse.json({ error: "Too many comments — please wait a minute and try again." }, { status: 429 });
    }

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
