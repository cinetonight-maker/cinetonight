import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { clientKey, isRateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same per-client throttle as /api/comments — see lib/rateLimit.ts for the
 *  tradeoffs (single-instance only, but a real deterrent for casual bots
 *  at zero extra infrastructure cost). */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

// Deliberately simple (not RFC 5322) — this is a UX sanity check, not a
// delivery guarantee. Bad addresses just bounce later; this only exists to
// catch "forgot to type anything" / obvious typos before hitting the DB.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Public: subscribe an email. POST /api/subscribers { email }.
 *  Used by the "Never miss a premiere" sidebar widget — previously a
 *  <button> with no handler, so every email typed there just vanished. */
export async function POST(request: Request) {
  try {
    if (isRateLimited(clientKey(request), "subscribers", { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX })) {
      return NextResponse.json({ error: "Too many attempts — please wait a minute and try again." }, { status: 429 });
    }

    const body = await request.json();
    const email = String(body?.email ?? "").trim().toLowerCase().slice(0, 254);

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const { error } = await supabaseAdmin()
      .from("subscribers")
      .upsert({ email, status: "active" }, { onConflict: "email" });
    if (error) throw error;

    return NextResponse.json({ ok: true, message: "You're subscribed! Weekly picks land in your inbox soon." });
  } catch (e) {
    return NextResponse.json({ error: `Could not subscribe: ${(e as Error).message}` }, { status: 500 });
  }
}
