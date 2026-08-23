import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Version history for a post.
 *
 * GET  ?postId=…            → the last 30 snapshots (newest first)
 * POST { postId, revisionId } → restore that snapshot
 *
 * Restoring does NOT delete anything: the current state is snapshotted first,
 * so "restore" is itself undoable. History only ever grows. */

const MISSING = /relation .* does not exist|could not find the table/i;

export async function GET(request: Request) {
  const postId = new URL(request.url).searchParams.get("postId");
  if (!postId) return NextResponse.json({ error: "Missing postId." }, { status: 400 });
  try {
    const { data, error } = await supabaseAdmin()
      .from("blog_revisions")
      .select("id, title, excerpt, status, note, author, created_at")
      .eq("post_id", postId)
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
    const { postId, revisionId, author } = await request.json();
    if (!postId || !revisionId) return NextResponse.json({ error: "Missing postId or revisionId." }, { status: 400 });

    const admin = supabaseAdmin();
    const { data: rev, error: e1 } = await admin.from("blog_revisions").select("*").eq("id", revisionId).maybeSingle();
    if (e1) throw e1;
    if (!rev || rev.post_id !== postId) return NextResponse.json({ error: "That version was not found." }, { status: 404 });

    // Snapshot what is there now, so restoring is itself reversible.
    const { data: before } = await admin.from("blog_posts").select("*").eq("id", postId).maybeSingle();
    if (before) {
      await admin.from("blog_revisions").insert({
        post_id: postId, title: before.title, body: before.body, excerpt: before.excerpt,
        meta_title: before.meta_title, meta_description: before.meta_description,
        image_url: before.image_url, image_alt: before.image_alt, cat: before.cat,
        status: before.status, note: "before restore", author: author ?? null,
      });
    }

    // Content only — status, schedule and slug stay as they are now, so a
    // restore can never silently republish or unpublish a post.
    const { data, error } = await admin.from("blog_posts").update({
      title: rev.title, body: rev.body, excerpt: rev.excerpt,
      meta_title: rev.meta_title, meta_description: rev.meta_description,
      image_url: rev.image_url, image_alt: rev.image_alt, cat: rev.cat,
      draft_body: null, draft_saved_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", postId).select().single();
    if (error) throw error;

    await recordAudit({
      module: "blog", action: "rollback",
      targetId: postId, targetLabel: data?.title ?? null,
      before, after: data,
      note: `Rolled back to the version from ${new Date(rev.created_at).toLocaleString("en-GB")}`,
    });
    return NextResponse.json({ ok: true, post: data });
  } catch (e) {
    return NextResponse.json({ error: `Could not restore: ${(e as Error).message}` }, { status: 500 });
  }
}
