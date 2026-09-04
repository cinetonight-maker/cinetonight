import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { revalidateForAction } from "@/lib/revalidateCms";
import { pruneRevisions } from "@/lib/retention";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================================
 * Static pages API — Stage 4 of the admin update.
 *
 * Same three rules as the blog API, for the same reasons:
 *   1. Autosave writes `draft_content` only — it can never change a live page.
 *   2. Delete moves the page to Trash and takes it off the site; permanent
 *      deletion is a separate, explicit call.
 *   3. New columns come from supabase/pages_cms.sql. If that has not been run,
 *      the extra fields are dropped from the write and saving keeps working
 *      exactly as before, rather than failing with a database error.
 *
 * A renamed slug is the one genuinely dangerous edit here: every existing link
 * to the old address breaks. The API allows it (you may need it) but the
 * screen warns loudly, and Internal Links will show you what broke.
 * ========================================================================= */

const slugify = (t: string) =>
  t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

/** Slugs owned by real routes. A page on one of these can never be reached,
 *  because Next gives static routes precedence over the catch-all. Rejecting
 *  it here is far kinder than letting someone write a page that silently
 *  never appears. */
const RESERVED = new Set([
  "admin", "api", "blog", "movie", "movies", "person", "channel", "search",
  "free-movies", "web-series", "tv-shows", "genres", "discover", "latest",
  "trending", "my-list", "account", "signin", "signup", "pricing", "faq",
  "follow", "links", "p", "rss.xml", "sitemap.xml", "robots.txt",
]);

/** Snapshot a page before it is overwritten. Best-effort by design: failing to
 *  record history must never block the author's save. */
async function snapshot(row: Record<string, unknown> | null, note: string, author?: string) {
  if (!row?.id) return;
  try {
    await supabaseAdmin().from("page_revisions").insert({
      page_id: row.id,
      title: row.title ?? null,
      content: row.content ?? null,
      slug: row.slug ?? null,
      meta_title: row.meta_title ?? null,
      meta_description: row.meta_description ?? null,
      status: row.status ?? null,
      note,
      author: author ?? null,
    });
    // Same reason as the blog route: a revision holds a full content snapshot,
    // and the database is 500 MB. Best effort — never fails the save.
    await pruneRevisions("page_revisions", "page_id", String(row.id));
  } catch { /* history is a nice-to-have; the save is not */ }
}

const isMissingSchema = (e: unknown) => {
  const m = (e as { message?: string })?.message ?? "";
  const code = (e as { code?: string })?.code ?? "";
  return code === "42703" || /column .* does not exist|could not find the .* column/i.test(m);
};

/** List pages. `?trash=1` returns the Trash instead of the working list.
 *  Filtered in JS so this route works before pages_cms.sql has been run. */
export async function GET(request: Request) {
  try {
    const trash = new URL(request.url).searchParams.get("trash") === "1";
    const { data, error } = await supabaseAdmin().from("pages").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as Record<string, unknown>[];
    return NextResponse.json({
      pages: rows.filter((r) => (trash ? !!r.deleted_at : !r.deleted_at)),
      trashCount: rows.filter((r) => !!r.deleted_at).length,
    });
  } catch (e) {
    return NextResponse.json({ error: `Could not load pages: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Create a page. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = String(body?.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });

    const admin = supabaseAdmin();
    let slug = slugify(body?.slug || title);
    if (RESERVED.has(slug)) {
      return NextResponse.json({ error: `“/${slug}” is already used by a section of the site. Pick a different address.` }, { status: 400 });
    }
    const { data: clash } = await admin.from("pages").select("id").eq("slug", slug).maybeSingle();
    if (!slug || clash) slug = `${slug || "page"}-${Date.now().toString(36)}`;

    const base = {
      slug, title,
      content: typeof body?.content === "string" ? body.content : "",
      status: body?.status === "published" ? "published" : "draft",
    };
    const extra: Record<string, unknown> = {};
    if (typeof body?.metaTitle === "string") extra.meta_title = body.metaTitle.slice(0, 70);
    if (typeof body?.metaDescription === "string") extra.meta_description = body.metaDescription.slice(0, 170);

    let ins = await admin.from("pages").insert({ ...base, ...extra }).select().single();
    if (ins.error && isMissingSchema(ins.error)) ins = await admin.from("pages").insert(base).select().single();
    if (ins.error) throw ins.error;
    if (ins.data?.status === "published") await snapshot(ins.data, "published", body?.author);
    // Explicit create → refresh this page's cached reads. /[slug] is
    // force-dynamic, so there is no route-cache entry to touch.
    const revalidated = await revalidateForAction({ kind: "page", slug: ins.data?.slug ?? slug });
    await recordAudit({
      module: "pages", action: ins.data?.status === "published" ? "publish" : "create",
      targetId: ins.data?.id, targetLabel: ins.data?.title,
      before: null, after: ins.data, note: `Created as ${ins.data?.status}`,
    });
    return NextResponse.json({ ok: true, page: ins.data, revalidated });
  } catch (e) {
    return NextResponse.json({ error: `Could not create page: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Update a page.
 *  `mode: "autosave"` → draft_content only.
 *  `action: "trash" | "restore" | "discardDraft"`.
 *  otherwise → a normal save. */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const id = String(body?.id ?? "");
    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

    const admin = supabaseAdmin();
    const { data: before } = await admin.from("pages").select("*").eq("id", id).maybeSingle();
    if (!before) return NextResponse.json({ error: "That page no longer exists." }, { status: 404 });

    if (body?.mode === "autosave") {
      if (typeof body.content !== "string") return NextResponse.json({ error: "Nothing to autosave." }, { status: 400 });
      const { error } = await admin.from("pages")
        .update({ draft_content: body.content, draft_saved_at: new Date().toISOString() }).eq("id", id);
      if (error) {
        if (isMissingSchema(error)) return NextResponse.json({ ok: false, unsupported: true });
        throw error;
      }
      // NO REVALIDATION HERE, AND THERE NEVER MAY BE. Autosave writes
      // `draft_content`, which the public page never reads.
      return NextResponse.json({ ok: true, savedAt: new Date().toISOString(), revalidated: null });
    }

    if (body?.action === "trash" || body?.action === "restore") {
      const toTrash = body.action === "trash";
      const patch = toTrash
        ? { deleted_at: new Date().toISOString(), status: "draft", updated_at: new Date().toISOString() }
        : { deleted_at: null, updated_at: new Date().toISOString() };
      const { data, error } = await admin.from("pages").update(patch).eq("id", id).select().single();
      if (error) {
        if (isMissingSchema(error)) {
          return NextResponse.json({ error: "Trash needs the CMS database update. Run supabase/pages_cms.sql in Supabase → SQL Editor, then try again." }, { status: 400 });
        }
        throw error;
      }
      if (toTrash) await snapshot(before, `moved to Trash (was ${before.status})`, body?.author);
      // Both directions change what the public site serves for this address.
      const revalidated = await revalidateForAction({ kind: "page", slug: before.slug });
      await recordAudit({
        module: "pages", action: toTrash ? "trash" : "restore",
        targetId: id, targetLabel: before.title, before, after: data,
        note: toTrash ? `Moved to Trash (was ${before.status})` : "Restored from Trash as a draft",
      });
      return NextResponse.json({ ok: true, page: data, revalidated });
    }

    if (body?.action === "discardDraft") {
      const { error } = await admin.from("pages").update({ draft_content: null, draft_saved_at: null }).eq("id", id);
      if (error && !isMissingSchema(error)) throw error;
      // Also public-invisible.
      return NextResponse.json({ ok: true, revalidated: null });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.title === "string") patch.title = body.title;
    if (typeof body.slug === "string" && body.slug.trim()) {
      const slug = slugify(body.slug);
      if (RESERVED.has(slug)) {
        return NextResponse.json({ error: `“/${slug}” is already used by a section of the site. Pick a different address.` }, { status: 400 });
      }
      const { data: clash } = await admin.from("pages").select("id").eq("slug", slug).maybeSingle();
      if (clash && clash.id !== id) {
        return NextResponse.json({ error: `Another page already uses “/${slug}”.` }, { status: 400 });
      }
      patch.slug = slug;
    }
    if (typeof body.content === "string") patch.content = body.content;
    if (body.status === "draft" || body.status === "published") patch.status = body.status;

    const extra: Record<string, unknown> = {};
    if (typeof body.metaTitle === "string") extra.meta_title = body.metaTitle.slice(0, 70);
    if (typeof body.metaDescription === "string") extra.meta_description = body.metaDescription.slice(0, 170);
    if (typeof body.content === "string") { extra.draft_content = null; extra.draft_saved_at = null; }

    // Snapshot the OLD state before overwriting anything that was public.
    if (before.status === "published") {
      await snapshot(before, typeof body.revisionNote === "string" ? body.revisionNote : "updated", body?.author);
    }

    let upd = await admin.from("pages").update({ ...patch, ...extra }).eq("id", id).select().single();
    if (upd.error && isMissingSchema(upd.error)) upd = await admin.from("pages").update(patch).eq("id", id).select().single();
    if (upd.error) throw upd.error;

    // Explicit Save/Publish/Unpublish. When the address changed, BOTH the old
    // and the new one are refreshed — the old address must stop serving the
    // page it no longer owns.
    const newSlug = upd.data?.slug ?? before.slug;
    const revalidated = await revalidateForAction({ kind: "page", slug: newSlug });
    if (newSlug !== before.slug) await revalidateForAction({ kind: "page", slug: before.slug });
    const wentLive = before.status !== "published" && upd.data?.status === "published";
    const wentDark = before.status === "published" && upd.data?.status !== "published";
    await recordAudit({
      module: "pages",
      action: wentLive ? "publish" : wentDark ? "unpublish" : "update",
      targetId: id, targetLabel: upd.data?.title ?? before.title,
      before, after: upd.data,
      note: newSlug !== before.slug ? `Address changed from /${before.slug} to /${newSlug} - existing links to the old address now break` : undefined,
    });
    return NextResponse.json({ ok: true, page: upd.data, revalidated });
  } catch (e) {
    return NextResponse.json({ error: `Could not save page: ${(e as Error).message}` }, { status: 500 });
  }
}

/** DELETE ?id=…             → move to Trash (reversible)
 *  DELETE ?id=…&permanent=1 → really delete */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const permanent = url.searchParams.get("permanent") === "1";
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  try {
    const admin = supabaseAdmin();
    if (permanent) {
      const { data: gone } = await admin.from("pages").select("*").eq("id", id).maybeSingle();
      const { error } = await admin.from("pages").delete().eq("id", id);
      if (error) throw error;
      const revalidated = gone ? await revalidateForAction({ kind: "page", slug: gone.slug }) : null;
      await recordAudit({
        module: "pages", action: "delete",
        targetId: id, targetLabel: gone?.title ?? null, before: gone, after: null,
        note: "Deleted permanently - this cannot be undone",
      });
      return NextResponse.json({ ok: true, permanent: true, revalidated });
    }
    const { data: before } = await admin.from("pages").select("*").eq("id", id).maybeSingle();
    const { error } = await admin.from("pages")
      .update({ deleted_at: new Date().toISOString(), status: "draft", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      if (isMissingSchema(error)) {
        return NextResponse.json({ error: "Trash needs the CMS database update. Run supabase/pages_cms.sql in Supabase → SQL Editor. (Nothing was deleted.)" }, { status: 400 });
      }
      throw error;
    }
    if (before) await snapshot(before, `moved to Trash (was ${before.status})`);
    // Trash takes the page off the site now, so its cached reads go too.
    const revalidated = before ? await revalidateForAction({ kind: "page", slug: before.slug }) : null;
    await recordAudit({
      module: "pages", action: "trash",
      targetId: id, targetLabel: before?.title ?? null, before, after: null,
      note: before ? `Moved to Trash (was ${before.status})` : "Moved to Trash",
    });
    return NextResponse.json({ ok: true, trashed: true, revalidated });
  } catch (e) {
    return NextResponse.json({ error: `Could not delete page: ${(e as Error).message}` }, { status: 500 });
  }
}
