import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Best-effort per-IP throttle for the public comment form: this was
 *  previously wide open (no auth, no limit — trivially spammable). An
 *  in-memory map only limits a single warm serverless instance, not a whole
 *  fleet, but it's a real deterrent for casual bots/scripts and costs
 *  nothing extra to run. For a multi-instance production deployment under
 *  sustained abuse, swap this for a shared store (Upstash Redis, Vercel KV,
 *  or a Postgres-backed check) keyed the same way. */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const hits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  // Bound memory: this map only grows with distinct IPs seen in the current
  // process lifetime, so periodically drop fully-expired entries.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) hits.delete(key);
    }
  }
  return recent.length > RATE_LIMIT_MAX;
}

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

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
    if (isRateLimited(clientIp(request))) {
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
