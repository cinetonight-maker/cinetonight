import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { revalidateForAction } from "@/lib/revalidateCms";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Version history for a static page — the same contract as the blog's.
 *
 * GET  ?pageId=…              → the last 30 snapshots (newest first)
 * POST { pageId, revisionId } → restore that snapshot
 *
 * Restoring does NOT delete anything: the current state is snapshotted first,
 * so "restore" is itself undoable. History only ever grows. */

const MISSING = /relation .* does not exist|could not find the table/i;

export async function GET(request: Request) {
  const pageId = new URL(request.url).searchParams.get("pageId");
  if (!pageId) return NextResponse.json({ error: "Missing pageId." }, { status: 400 });
  try {
    const { data, error } = await supabaseAdmin()
      .from("page_revisions")
      .select("id, title, status, note, author, created_at")
      .eq("page_id", pageId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) {
      if (MISSING.test(error.message)) return NextResponse.json({ revisions: [], unsupported: true });
      throw error;
    }
    return NextResponse.json({ revisions: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: `Could not load history: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { pageId, revisionId, author } = await request.json();
    if (!pageId || !revisionId) return NextResponse.json({ error: "Missing pageId or revisionId." }, { status: 400 });

    const admin = supabaseAdmin();
    const { data: rev, error: e1 } = await admin.from("page_revisions").select("*").eq("id", revisionId).maybeSingle();
    if (e1) throw e1;
    if (!rev || rev.page_id !== pageId) return NextResponse.json({ error: "That version was not found." }, { status: 404 });

    // Snapshot what is there now, so restoring is itself reversible.
    const { data: before } = await admin.from("pages").select("*").eq("id", pageId).maybeSingle();
    if (before) {
      await admin.from("page_revisions").insert({
        page_id: pageId, title: before.title, content: before.content, slug: before.slug,
        meta_title: before.meta_title, meta_description: before.meta_description,
        status: before.status, note: "before restore", author: author ?? null,
      });
    }

    // Content only — status and the address stay as they are now, so a restore
    // can never silently republish a page or change its URL.
    const { data, error } = await admin.from("pages").update({
      title: rev.title, content: rev.content,
      meta_title: rev.meta_title, meta_description: rev.meta_description,
      draft_content: null, draft_saved_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", pageId).select().single();
    if (error) throw error;

    // A restore changes what the public page serves, so it revalidates like
    // any other explicit update.
    const revalidated = await revalidateForAction({ kind: "page", slug: data?.slug ?? before?.slug ?? "" });
    await recordAudit({
      module: "pages", action: "rollback",
      targetId: pageId, targetLabel: data?.title ?? null, before, after: data,
      note: `Rolled back to the version from ${new Date(rev.created_at).toLocaleString("en-GB")}`,
    });
    return NextResponse.json({ ok: true, page: data, revalidated });
  } catch (e) {
    return NextResponse.json({ error: `Could not restore: ${(e as Error).message}` }, { status: 500 });
  }
}
