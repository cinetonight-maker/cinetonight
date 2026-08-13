import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendTelegramMessage } from "@/lib/telegram";
import { baseUrl } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Never flood the channel in one run (e.g. after a big catalogue import) —
// whatever's left over just gets picked up on the next scheduled run since
// the watermark only advances past what was actually posted.
const MAX_PER_RUN = 10;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — no secret set, no runs allowed
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** Daily digest → Telegram: announces movies and blog posts added since the
 *  last run (see `bot_state` in supabase/schema.sql). Wired up in
 *  vercel.json as a scheduled cron hitting this route; Vercel signs those
 *  requests with CRON_SECRET automatically once that env var is set, which
 *  is also what stops randoms from POSTing to this URL and spamming the
 *  channel on demand. No-ops cleanly (200, not an error) if the Telegram
 *  bot or Supabase aren't configured yet — this route is safe to deploy
 *  and schedule before either is set up. */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const base = baseUrl();
  const supabase = supabaseAdmin();
  const results = { moviesPosted: 0, blogPosted: 0, errors: [] as string[] };

  try {
    const { data: state, error: stateErr } = await supabase.from("bot_state").select("*").eq("id", 1).maybeSingle();
    if (stateErr) throw new Error(`Could not read bot_state: ${stateErr.message}`);
    const lastMovie = state?.last_movie_posted_at ?? new Date(0).toISOString();
    const lastBlog = state?.last_blog_posted_at ?? new Date(0).toISOString();

    const [movieRes, blogRes] = await Promise.all([
      supabase
        .from("movies")
        .select("id, title, year, created_at")
        .gt("created_at", lastMovie)
        .order("created_at", { ascending: true })
        .limit(MAX_PER_RUN),
      supabase
        .from("blog_posts")
        .select("slug, title, created_at")
        .eq("status", "published")
        .gt("created_at", lastBlog)
        .order("created_at", { ascending: true })
        .limit(MAX_PER_RUN),
    ]);
    // Surfacing these explicitly matters: silently treating "the query
    // failed" the same as "there's nothing new" would report a clean 200
    // while quietly never posting anything again.
    if (movieRes.error) throw new Error(`Could not read movies: ${movieRes.error.message}`);
    if (blogRes.error) throw new Error(`Could not read blog_posts: ${blogRes.error.message}`);
    const newMovies = movieRes.data;
    const newBlogs = blogRes.data;

    let newestMovieAt = lastMovie;
    for (const m of newMovies ?? []) {
      const text = `🎬 <b>New on CineTonight</b>\n${escapeHtml(m.title)}${m.year ? ` (${m.year})` : ""}\n${base}/movie/${m.id}`;
      const sent = await sendTelegramMessage(text);
      if (sent.ok) { results.moviesPosted++; newestMovieAt = m.created_at as string; }
      else results.errors.push(`movie ${m.id}: ${sent.error}`);
    }

    let newestBlogAt = lastBlog;
    for (const b of newBlogs ?? []) {
      const text = `📝 <b>New on the CineTonight Blog</b>\n${escapeHtml(b.title)}\n${base}/blog/${b.slug}`;
      const sent = await sendTelegramMessage(text);
      if (sent.ok) { results.blogPosted++; newestBlogAt = b.created_at as string; }
      else results.errors.push(`blog ${b.slug}: ${sent.error}`);
    }

    // Only advance the watermark past items that actually posted — if
    // Telegram was down partway through, the unset ones get retried
    // tomorrow instead of silently skipped forever.
    await supabase.from("bot_state").upsert({ id: 1, last_movie_posted_at: newestMovieAt, last_blog_posted_at: newestBlogAt });

    return NextResponse.json({ ok: true, ...results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message, ...results }, { status: 500 });
  }
}
