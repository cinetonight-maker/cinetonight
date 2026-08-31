import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { revalidateForAction } from "@/lib/revalidateCms";
import { pruneRevisions } from "@/lib/retention";
import { inHomeGuides } from "@/lib/revalidatePlan";
import { recordAudit, currentActor } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================================
 * Blog CMS API — Stage 2 of the admin update.
 *
 * Three rules this file is built around:
 *
 *  1. AUTOSAVE CAN NEVER PUBLISH. Autosave writes `draft_body` only. The
 *     public site reads `body`. So an autosave, however often it fires, can
 *     not change a single character of a live article.
 *
 *  2. NOTHING IS DESTROYED BY ACCIDENT. Delete moves a post to Trash
 *     (`deleted_at` set + status forced to draft, so it leaves the site
 *     immediately). Permanent delete is a separate, explicit call.
 *
 *  3. EVERY PUBLISHED CHANGE IS RECOVERABLE. Before a published post is
 *     overwritten, its current state is snapshotted into `blog_revisions`.
 *
 * Graceful degradation: the new columns/table come from supabase/blog_cms.sql.
 * If that has not been run yet, revision writes are skipped silently and the
 * new fields are dropped from the patch, so saving keeps working exactly as
 * it did before instead of failing with a database error.
 * ========================================================================= */

const slugify = (t: string) =>
  t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

/** Body may arrive as Markdown (new) or an array of paragraphs (old drafts
 *  still open in a browser tab). Store Markdown either way. */
const asMarkdown = (v: unknown): string | null => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((x) => String(x ?? "")).join("\n\n");
  return null;
};

/** Is a row visible on the public site right now? Mirrors lib/data.ts exactly:
 *  published, or scheduled with its time already passed. */
const isLive = (row: { status?: string; publish_at?: string | null; deleted_at?: string | null } | null | undefined) =>
  !!row && !row.deleted_at &&
  (row.status === "published" ||
    (row.status === "scheduled" && !!row.publish_at && new Date(row.publish_at).getTime() <= Date.now()));

/** The live post slugs in the order the site renders them (newest first), so
 *  we can tell whether a change touches the homepage Guides strip. One small
 *  query, run only on explicit publish/update actions. */
async function liveSlugsNewestFirst(): Promise<string[]> {
  try {
    const { data } = await supabaseAdmin()
      .from("blog_posts")
      .select("slug, status, publish_at, deleted_at")
      .order("created_at", { ascending: false })
      .limit(50);
    return ((data ?? []) as any[]).filter(isLive).map((r) => r.slug);
  } catch { return []; }
}

/** Revalidate after an explicit publish/update/trash. NEVER called by the
 *  autosave branch — see the note there.
 *
 *  `beforeSlugs` is the live list captured BEFORE the write, so a post
 *  DROPPING OUT of the homepage Guides strip is caught as well as one
 *  entering it. Without it, trashing the newest guide would leave the
 *  homepage showing a post that no longer exists. */
async function revalidateBlog(slug: string, before: any, after: any, beforeSlugs: string[]) {
  const afterSlugs = await liveSlugsNewestFirst();
  return revalidateForAction({
    kind: "blog",
    slug,
    wasLive: isLive(before),
    isLive: isLive(after),
    touchesHomeGuides: inHomeGuides(beforeSlugs, slug) || inHomeGuides(afterSlugs, slug),
  });
}

/** True when the failure is "that column/table does not exist yet". */
const isMissingSchema = (e: unknown) => {
  const m = (e as { message?: string })?.message ?? "";
  const code = (e as { code?: string })?.code ?? "";
  return code === "42703" || code === "42P01" || /column .* does not exist|could not find the .* column|relation .* does not exist/i.test(m);
};


/** SEO columns added by supabase/blog_seo.sql. Collected separately from the
 *  base payload so the whole save still works when that file has not been run
 *  yet — the insert/update retries without them (see isMissingSchema). */
function seoExtra(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // Author lives in the same optional-column bucket (supabase/blog_author.sql)
  // for the same reason: the save must still succeed before that file is run.
  if (typeof body.author === "string") out.author = body.author.trim().slice(0, 60) || null;
  if (typeof body.focusKeyword === "string") out.focus_keyword = body.focusKeyword.trim().slice(0, 120) || null;
  if (Array.isArray(body.secondaryKeywords)) {
    out.secondary_keywords = (body.secondaryKeywords as unknown[])
      .map((k) => String(k).trim()).filter(Boolean).slice(0, 12);
  }
  // Blank means "this article is its own canonical", which is the right answer
  // almost always — so an empty string must clear the column, not store "".
  if (typeof body.canonicalUrl === "string") {
    const v = body.canonicalUrl.trim();
    out.canonical_url = /^https?:\/\/\S+$/i.test(v) || v.startsWith("/") ? v.slice(0, 500) : null;
  }
  if (typeof body.ogImage === "string") out.og_image = body.ogImage.trim().slice(0, 500) || null;
  if (typeof body.noindex === "boolean") out.noindex = body.noindex;
  return out;
}

/** Snapshot a post before it is overwritten. Best-effort by design: failing to
 *  record history must never block the author's save. */
async function snapshot(row: Record<string, unknown> | null, note: string, author?: string) {
  if (!row?.id) return;
  try {
    await supabaseAdmin().from("blog_revisions").insert({
      post_id: row.id,
      title: row.title ?? null,
      body: asMarkdown(row.body),
      excerpt: row.excerpt ?? null,
      meta_title: row.meta_title ?? null,
      meta_description: row.meta_description ?? null,
      image_url: row.image_url ?? null,
      image_alt: row.image_alt ?? null,
      cat: row.cat ?? null,
      status: row.status ?? null,
      focus_keyword: row.focus_keyword ?? null,
      secondary_keywords: (row.secondary_keywords as string[] | undefined) ?? null,
      canonical_url: row.canonical_url ?? null,
      og_image: row.og_image ?? null,
      noindex: row.noindex ?? null,
      note,
      author: author ?? null,
    });
    // Keep this post's history bounded. The database is 500 MB and a revision
    // holds a full body snapshot, so without this a heavily-edited article
    // grows without limit. Best effort — never fails the save.
    await pruneRevisions("blog_revisions", "post_id", String(row.id));
  } catch { /* history is a nice-to-have; the save is not */ }
}

/** List posts for the dashboard.
 *  `?trash=1` returns the Trash instead of the working list.
 *  Filtering happens in JS, not in the query, so this route still works
 *  before supabase/blog_cms.sql has been run (no `deleted_at` reference). */
export async function GET(request: Request) {
  try {
    const trash = new URL(request.url).searchParams.get("trash") === "1";
    const { data, error } = await supabaseAdmin()
      .from("blog_posts").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as Record<string, unknown>[];
    const posts = rows.filter((r) => (trash ? !!r.deleted_at : !r.deleted_at));
    return NextResponse.json({ posts, trashCount: rows.filter((r) => !!r.deleted_at).length });
  } catch (e) {
    return NextResponse.json({ error: `Could not load posts: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Create a post. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = String(body?.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });

    const admin = supabaseAdmin();
    let slug = slugify(body?.slug || title);
    const { data: clash } = await admin.from("blog_posts").select("id").eq("slug", slug).maybeSingle();
    if (!slug || clash) slug = `${slug || "post"}-${Date.now().toString(36)}`;

    // Captured before the write, so we can tell whether the homepage Guides
    // strip changes as a result of this action.
    const beforeSlugs = await liveSlugsNewestFirst();

    const base: Record<string, unknown> = {
      slug, title,
      cat: body?.cat || "Guide",
      excerpt: body?.excerpt ?? "",
      body: asMarkdown(body?.body) ?? "",
      image_url: body?.imageUrl || null,
      date_label: body?.date ?? new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      read_label: body?.read ?? "5 min",
      status: ["draft", "published", "scheduled"].includes(body?.status) ? body.status : "published",
      meta_title: typeof body?.metaTitle === "string" ? body.metaTitle.slice(0, 70) : "",
      meta_description: typeof body?.metaDescription === "string" ? body.metaDescription.slice(0, 170) : "",
      publish_at: body?.publishAt ? new Date(body.publishAt).toISOString() : null,
    };
    const extra: Record<string, unknown> = {};
    if (typeof body?.imageAlt === "string") extra.image_alt = body.imageAlt.slice(0, 200);
    if (Array.isArray(body?.tags)) extra.tags = body.tags.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 12);
    Object.assign(extra, seoExtra(body ?? {}));

    let ins = await admin.from("blog_posts").insert({ ...base, ...extra }).select().single();
    // Retry without the new columns if the migration has not been run yet.
    if (ins.error && isMissingSchema(ins.error)) ins = await admin.from("blog_posts").insert(base).select().single();
    if (ins.error) throw ins.error;

    if (ins.data?.status === "published") await snapshot(ins.data, "published", body?.author);

    // Explicit create → surgical revalidation. A post created as a DRAFT
    // produces an empty plan (planFor returns EMPTY_PLAN when it was not live
    // before and is not live now), so nothing public is invalidated.
    const revalidated = await revalidateBlog(slug, null, ins.data, beforeSlugs);
    await recordAudit({
      module: "blog",
      action: ins.data?.status === "published" ? "publish" : "create",
      targetId: ins.data?.id, targetLabel: ins.data?.title,
      before: null, after: ins.data,
      note: `Created as ${ins.data?.status}`,
    });
    return NextResponse.json({ ok: true, post: ins.data, revalidated });
  } catch (e) {
    return NextResponse.json({ error: `Could not create post: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Update a post.
 *
 *  `mode: "autosave"`  → writes draft_body/draft_saved_at ONLY.
 *  `action: "trash" | "restore" | "discardDraft" | "restoreRevision"`
 *  otherwise            → a normal save, with a revision snapshot first.
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const id = String(body?.id ?? "");
    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

    const admin = supabaseAdmin();
    const { data: before } = await admin.from("blog_posts").select("*").eq("id", id).maybeSingle();
    if (!before) return NextResponse.json({ error: "That post no longer exists." }, { status: 404 });

    // Draft-only operations return before this point, so the extra query below
    // is never paid by an autosave.
    const publicChange = body?.mode !== "autosave" && body?.action !== "discardDraft";
    const beforeSlugs = publicChange ? await liveSlugsNewestFirst() : [];

    /* ---- autosave: draft only, never touches the live article ---- */
    if (body?.mode === "autosave") {
      const md = asMarkdown(body?.body);
      if (md === null) return NextResponse.json({ error: "Nothing to autosave." }, { status: 400 });
      const { error } = await admin.from("blog_posts")
        .update({ draft_body: md, draft_saved_at: new Date().toISOString() }).eq("id", id);
      if (error) {
        // No draft columns yet → tell the client to stop trying, quietly.
        if (isMissingSchema(error)) return NextResponse.json({ ok: false, unsupported: true });
        throw error;
      }
      // NO REVALIDATION HERE, AND THERE NEVER MAY BE. Autosave writes
      // `draft_body`, a column the public site never reads, so there is
      // nothing public to invalidate. `revalidated: null` is returned
      // explicitly so the contract is visible in the response and can be
      // asserted by a test rather than assumed.
      return NextResponse.json({ ok: true, savedAt: new Date().toISOString(), revalidated: null });
    }

    /* ---- trash / restore ---- */
    if (body?.action === "trash" || body?.action === "restore") {
      const toTrash = body.action === "trash";
      const patch = toTrash
        // Force status to draft as well: that is what makes the post leave the
        // public site the moment it is trashed, even on the fallback path.
        ? { deleted_at: new Date().toISOString(), status: "draft", updated_at: new Date().toISOString() }
        : { deleted_at: null, updated_at: new Date().toISOString() };
      const { data, error } = await admin.from("blog_posts").update(patch).eq("id", id).select().single();
      if (error) {
        if (isMissingSchema(error)) {
          return NextResponse.json({ error: "Trash needs the CMS database update. Run supabase/blog_cms.sql in Supabase → SQL Editor, then try again." }, { status: 400 });
        }
        throw error;
      }
      if (toTrash) await snapshot(before, `moved to Trash (was ${before.status})`, body?.author);
      const revalidated = await revalidateBlog(before.slug, before, data, beforeSlugs);
      await recordAudit({
        module: "blog", action: toTrash ? "trash" : "restore",
        targetId: id, targetLabel: before.title, before, after: data,
        note: toTrash ? `Moved to Trash (was ${before.status})` : "Restored from Trash as a draft",
      });
      return NextResponse.json({ ok: true, post: data, revalidated });
    }

    /* ---- discard the autosaved draft ---- */
    if (body?.action === "discardDraft") {
      // Also public-invisible: discarding a draft cannot change the live page.
      const { error } = await admin.from("blog_posts").update({ draft_body: null, draft_saved_at: null }).eq("id", id);
      if (error && !isMissingSchema(error)) throw error;
      return NextResponse.json({ ok: true, revalidated: null });
    }

    /* ---- normal save ---- */
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.title === "string") patch.title = body.title;
    if (typeof body.slug === "string" && body.slug.trim()) patch.slug = slugify(body.slug);
    if (typeof body.cat === "string") patch.cat = body.cat;
    if (typeof body.excerpt === "string") patch.excerpt = body.excerpt;
    const md = asMarkdown(body.body);
    if (md !== null) patch.body = md;
    if (body.imageUrl !== undefined) patch.image_url = body.imageUrl || null;
    if (typeof body.date === "string") patch.date_label = body.date;
    if (typeof body.read === "string") patch.read_label = body.read;
    if (["draft", "published", "scheduled"].includes(body.status)) patch.status = body.status;
    if (typeof body.metaTitle === "string") patch.meta_title = body.metaTitle.slice(0, 70);
    if (typeof body.metaDescription === "string") patch.meta_description = body.metaDescription.slice(0, 170);
    if (body.publishAt !== undefined) patch.publish_at = body.publishAt ? new Date(body.publishAt).toISOString() : null;

    const extra: Record<string, unknown> = {};
    if (typeof body.imageAlt === "string") extra.image_alt = body.imageAlt.slice(0, 200);
    if (Array.isArray(body.tags)) extra.tags = body.tags.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 12);
    Object.assign(extra, seoExtra(body ?? {}));
    // A successful save supersedes the autosaved draft.
    if (md !== null) { extra.draft_body = null; extra.draft_saved_at = null; }

    // Snapshot the OLD state before overwriting anything that was public.
    if (before.status === "published" || before.status === "scheduled") {
      await snapshot(before, typeof body.revisionNote === "string" ? body.revisionNote : "updated", body?.author);
    }

    let upd = await admin.from("blog_posts").update({ ...patch, ...extra }).eq("id", id).select().single();
    if (upd.error && isMissingSchema(upd.error)) upd = await admin.from("blog_posts").update(patch).eq("id", id).select().single();
    if (upd.error) throw upd.error;

    // Explicit Save/Publish/Unpublish → surgical revalidation. A draft that
    // stays a draft yields an empty plan and invalidates nothing.
    const revalidated = await revalidateBlog(upd.data?.slug ?? before.slug, before, upd.data, beforeSlugs);
    // One audit row per explicit save. The verb reflects what actually
    // happened to visibility, not just which button was pressed.
    const wentLive = before.status !== "published" && upd.data?.status === "published";
    const wentDark = before.status === "published" && upd.data?.status !== "published";
    await recordAudit({
      module: "blog",
      action: wentLive ? "publish" : wentDark ? "unpublish" : upd.data?.status === "scheduled" ? "schedule" : "update",
      targetId: id, targetLabel: upd.data?.title ?? before.title,
      before, after: upd.data,
    });
    return NextResponse.json({ ok: true, post: upd.data, revalidated });
  } catch (e) {
    return NextResponse.json({ error: `Could not save post: ${(e as Error).message}` }, { status: 500 });
  }
}

/** DELETE /api/admin/blog?id=...            → move to Trash (reversible)
 *  DELETE /api/admin/blog?id=...&permanent=1 → really delete (Trash only) */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const permanent = url.searchParams.get("permanent") === "1";
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  try {
    const admin = supabaseAdmin();
    if (permanent) {
      // Permanent delete only ever runs on something already in Trash, which
      // is already off the site and was revalidated when it was trashed.
      const { data: gone } = await admin.from("blog_posts").select("slug, status, publish_at, deleted_at").eq("id", id).maybeSingle();
      const beforeSlugs = await liveSlugsNewestFirst();
      const { error } = await admin.from("blog_posts").delete().eq("id", id);
      if (error) throw error;
      const revalidated = gone
        ? await revalidateBlog(gone.slug, gone, null, beforeSlugs)
        : null;
      await recordAudit({
        module: "blog", action: "delete",
        targetId: id, targetLabel: gone?.slug ?? null, before: gone, after: null,
        note: "Deleted permanently — this cannot be undone",
      });
      return NextResponse.json({ ok: true, permanent: true, revalidated });
    }

    const beforeSlugs = await liveSlugsNewestFirst();
    const { data: before } = await admin.from("blog_posts").select("*").eq("id", id).maybeSingle();
    const { error } = await admin.from("blog_posts")
      .update({ deleted_at: new Date().toISOString(), status: "draft", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      // Without the migration there is no Trash — do NOT silently hard-delete.
      if (isMissingSchema(error)) {
        return NextResponse.json({ error: "Trash needs the CMS database update. Run supabase/blog_cms.sql in Supabase → SQL Editor. (Nothing was deleted.)" }, { status: 400 });
      }
      throw error;
    }
    if (before) await snapshot(before, `moved to Trash (was ${before.status})`);
    // Trash takes the post off the site NOW, so the article, /blog and (if it
    // was in the Guides strip) the homepage are all refreshed immediately.
    const revalidated = before
      ? await revalidateBlog(before.slug, before, { ...before, deleted_at: new Date().toISOString(), status: "draft" }, beforeSlugs)
      : null;
    await recordAudit({
      module: "blog", action: "trash",
      targetId: id, targetLabel: before?.title ?? null, before, after: null,
      note: before ? `Moved to Trash (was ${before.status})` : "Moved to Trash",
    });
    return NextResponse.json({ ok: true, trashed: true, revalidated });
  } catch (e) {
    return NextResponse.json({ error: `Could not delete post: ${(e as Error).message}` }, { status: 500 });
  }
}
