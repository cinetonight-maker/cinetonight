import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { renderMarkdown } from "@/lib/markdown";

/* The static page exactly as it will look, read straight from the database
 * with no caching at any layer. Same purpose as the blog preview: the public
 * page is cached for speed, so this is how you confirm a save immediately.
 *
 * Admin-only (middleware covers /admin/**), force-dynamic, noindex. */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

export default async function PagePreview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const { data } = await supabaseAdmin()
    .from("pages")
    .select("title, content, status, deleted_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) notFound();

  const live = data.status === "published" && !data.deleted_at;

  return (
    <div className="ad__body ad__body--one">
      <div className="ad__notice">
        <div>
          <b>Preview</b> — this is the real content from the database, right now.
          {data.deleted_at
            ? " This page is in Trash, so it is not on the site."
            : live
              ? " It is live; the public page may take a few minutes to catch up."
              : " It is a draft and is not on the site."}
        </div>
        <div className="ad__actions">
          <Link className="ad__mini" href="/admin/pages">Back to Pages</Link>
          {live && <a className="ad__mini" href={`/${slug}`} target="_blank" rel="noreferrer">Open the public page</a>}
        </div>
      </div>

      <div className="ad__panel">
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 18 }}>{data.title}</h1>
          {/* eslint-disable-next-line react/no-danger -- sanitized by renderMarkdown, the same renderer the public page uses */}
          <div className="pagecontent" dangerouslySetInnerHTML={{ __html: renderMarkdown(data.content) }} />
        </div>
      </div>
    </div>
  );
}
