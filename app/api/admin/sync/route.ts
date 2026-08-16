import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncCatalogue } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sync Center API. Auth is enforced for every /api/admin/** route by the
 *  middleware (Supabase session + admin_users allowlist) before this runs.
 *
 *  GET  - status for the dashboard panel: hero mode, catalogue size, and
 *         the last few sync runs from sync_log.
 *  POST - { action: "run" }                 -> run a full sync now
 *         { action: "heroMode", mode: ... } -> switch hero auto/manual */

export async function GET() {
  const admin = supabaseAdmin();
  try {
    const [{ data: home }, { count }, { data: runs }] = await Promise.all([
      // select * (not the column list) so this still works before the SQL
      // upgrade adds hero_mode - a missing column errors, a missing key doesn't
      admin.from("home_config").select("*").eq("id", 1).maybeSingle(),
      admin.from("movies").select("id", { count: "exact", head: true }),
      admin.from("sync_log").select("*").order("started_at", { ascending: false }).limit(10)
        .then((r) => (r.error ? { data: [] as any[] } : r)), // table may not exist until the SQL upgrade runs
    ]);
    return NextResponse.json({
      heroMode: home?.hero_mode === "manual" ? "manual" : "auto",
      catalogueCount: count ?? 0,
      runs: runs ?? [],
    });
  } catch (e) {
    return NextResponse.json({ error: `Could not load sync status: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    if (body?.action === "heroMode") {
      const mode = body.mode === "manual" ? "manual" : "auto";
      const { error } = await supabaseAdmin()
        .from("home_config")
        .update({ hero_mode: mode, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (error) throw error;
      return NextResponse.json({ ok: true, heroMode: mode });
    }

    if (body?.action === "run") {
      const result = await syncCatalogue("manual");
      return NextResponse.json(result, { status: result.ok ? 200 : 500 });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: `Sync failed: ${(e as Error).message}` }, { status: 500 });
  }
}
