import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin().from("site_settings").select("*").eq("id", 1).single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: `Could not load settings: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Body: { site_title?, site_description?, meta_keywords?, contact_email?, social?, maintenance_mode? } */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const patch: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() };
    for (const k of ["site_title", "site_description", "meta_keywords", "contact_email"]) {
      if (typeof body[k] === "string") patch[k] = body[k];
    }
    if (body.social && typeof body.social === "object") patch.social = body.social;
    if (body.maintenance_mode !== undefined) patch.maintenance_mode = !!body.maintenance_mode;

    const { data, error } = await supabaseAdmin().from("site_settings").upsert(patch).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, settings: data });
  } catch (e) {
    return NextResponse.json({ error: `Could not save settings: ${(e as Error).message}` }, { status: 500 });
  }
}
