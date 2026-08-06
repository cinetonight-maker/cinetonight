// Dev-only env-var + Supabase connectivity sanity check. Never returns any
// part of a real secret — only whether it's set, and what a live read
// actually comes back with — and is disabled entirely once deployed
// (production), so nothing here is reachable by the public.
import { supabasePublic } from "@/lib/supabase/public";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not available in production." }, { status: 404 });
  }

  const out: Record<string, unknown> = {
    hasTmdbKey: !!process.env.TMDB_API_KEY || !!process.env.TMDB_READ_TOKEN,
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabasePublishableKey: !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };

  const sb = supabasePublic();
  out.supabasePublicClientCreated = !!sb;

  if (sb) {
    const movies = await sb.from("movies").select("id", { count: "exact", head: true });
    out.moviesReadable = { count: movies.count, error: movies.error?.message ?? null };

    const home = await sb.from("home_config").select("*").eq("id", 1).maybeSingle();
    out.homeConfigReadable = {
      found: !!home.data,
      error: home.error?.message ?? null,
      heroSlideCount: home.data?.hero_slides?.length ?? null,
      rowCount: home.data?.rows?.length ?? null,
      continueWatchingCount: home.data?.continue_watching?.length ?? null,
    };
  }

  return Response.json(out);
}