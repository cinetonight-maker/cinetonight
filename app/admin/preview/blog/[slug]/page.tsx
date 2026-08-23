import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { renderMarkdown, readingTime } from "@/lib/markdown";
import { img } from "@/lib/images";

/* ============================================================================
 * /admin/preview/blog/<slug> — the article exactly as it will look, read
 * straight from the database with no caching at any layer.
 *
 * Why this exists: the public /blog/<slug> page is cached for speed (that is
 * deliberate and is what keeps the site cheap and fast), so a change can take
 * a few minutes to appear there. That delay used to make a successful save
 * look like a failed one. This page removes the doubt: it always shows the
 * true, current content the moment you save.
 *
 * It is behind admin auth (middleware covers /admin/**), force-dynamic, and
 * noindex — it must never be cached, shared or indexed.
 * ========================================================================= */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

export default async function BlogPreview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const { data } = await supabaseAdmin()
    .from("blog_posts")
    .select("title, cat, excerpt, body, image_url, image_alt, date_label, status, publish_at, deleted_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) notFound();

  const image = data.image_url || img(`article-${slug}`, 1000, 500);
  const live = data.status === "published"
    || (data.status === "scheduled" && data.publish_at && new Date(data.publish_at).getTime() <= Date.now());

  return (
    <div className="ad__body ad__body--one">
      <div className="ad__notice">
        <div>
          <b>Preview</b> — this is the real content from the database, right now.
          {data.deleted_at
            ? " This post is in Trash, so it is not on the site."
            : live
              ? " It is live on the site; the public page may take a few minutes to catch up."
              : data.status === "scheduled"
                ? ` It is scheduled for ${new Date(data.publish_at!).toLocaleString()} and is not on the site yet.`
                : " It is a draft and is not on the site."}
        </div>
        <div className="ad__actions">
          <Link className="ad__mini" href="/admin/blog">Back to Blog Posts</Link>
          {live && <a className="ad__mini" href={`/blog/${slug}`} target="_blank" rel="noreferrer">Open the public page</a>}
        </div>
      </div>

      <div className="ad__panel">
        <div className="article" style={{ maxWidth: 820 }}>
          <span className="article__cat">{data.cat}</span>
          <h1 className="article__t">{data.title}</h1>
          <div className="article__meta">By Editorial Desk · {data.date_label} · {readingTime(data.body)} read</div>
          {/* Plain <img>: next/image would optimise and cache an image that is
             about to change again — pointless work for a preview. */}
          <div className="article__img"><img alt={data.image_alt || data.title} src={image} /></div>
          {/* eslint-disable-next-line react/no-danger -- sanitized by renderMarkdown, the same renderer the public page uses */}
          <div className="article__body" dangerouslySetInnerHTML={{ __html: renderMarkdown(data.body ?? data.excerpt) }} />
        </div>
      </div>
    </div>
  );
}
