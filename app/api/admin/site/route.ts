import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hero slides, home-row rules, and continue-watching — same shape the
 *  dashboard's Hero/Rows tabs already work with, now backed by the
 *  `home_config` Supabase table instead of content/site.json, so it works
 *  on the live site too, not just `npm run dev`. */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin().from("home_config").select("*").eq("id", 1).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ hero: { slides: [], intervalMs: 6000 }, rows: [], continueWatching: [] });
    return NextResponse.json({
      hero: { slides: data.hero_slides ?? [], intervalMs: data.hero_interval_ms ?? 6000 },
      rows: data.rows ?? [],
      continueWatching: data.continue_watching ?? [],
    });
  } catch (e) {
    return NextResponse.json({ error: `Could not read home config: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || !Array.isArray(body.rows)) {
      return NextResponse.json({ error: "Invalid site config." }, { status: 400 });
    }
    const { error } = await supabaseAdmin().from("home_config").upsert({
      id: 1,
      hero_slides: body.hero?.slides ?? [],
      hero_interval_ms: body.hero?.intervalMs ?? 6000,
      rows: body.rows,
      continue_watching: body.continueWatching ?? [],
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `Could not save: ${(e as Error).message}` }, { status: 500 });
  }
}
