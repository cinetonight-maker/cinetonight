import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** List every post (draft + published) for the dashboard. */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin().from("blog_posts").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ posts: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: `Could not load posts: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Create a post. Body: { title, slug?, cat?, excerpt?, body?, imageUrl?, date?, read?, status? } */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = String(body?.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });

    const admin = supabaseAdmin();
    let slug = slugify(body?.slug || title);
    const { data: clash } = await admin.from("blog_posts").select("id").eq("slug", slug).maybeSingle();
    if (!slug || clash) slug = `${slug || "post"}-${Date.now().toString(36)}`;

    const { data, error } = await admin.from("blog_posts").insert({
      slug, title,
      cat: body?.cat || "Guide",
      excerpt: body?.excerpt ?? "",
      body: Array.isArray(body?.body) ? body.body : [],
      image_url: body?.imageUrl || null,
      date_label: body?.date ?? new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      read_label: body?.read ?? "5 min",
      status: body?.status === "draft" ? "draft" : "published",
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, post: data });
  } catch (e) {
    return NextResponse.json({ error: `Could not create post: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Update a post. Body: { id, ...patch } */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const id = String(body?.id ?? "");
    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.title === "string") patch.title = body.title;
    if (typeof body.slug === "string" && body.slug.trim()) patch.slug = slugify(body.slug);
    if (typeof body.cat === "string") patch.cat = body.cat;
    if (typeof body.excerpt === "string") patch.excerpt = body.excerpt;
    if (Array.isArray(body.body)) patch.body = body.body;
    if (body.imageUrl !== undefined) patch.image_url = body.imageUrl || null;
    if (typeof body.date === "string") patch.date_label = body.date;
    if (typeof body.read === "string") patch.read_label = body.read;
    if (body.status === "draft" || body.status === "published") patch.status = body.status;

    const { data, error } = await supabaseAdmin().from("blog_posts").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, post: data });
  } catch (e) {
    return NextResponse.json({ error: `Could not save post: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Delete a post: DELETE /api/admin/blog?id=... */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    const { error } = await supabaseAdmin().from("blog_posts").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `Could not delete post: ${(e as Error).message}` }, { status: 500 });
  }
}
