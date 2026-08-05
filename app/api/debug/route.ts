// Dev-only env-var sanity check. Never returns any part of a real secret —
// only whether it's set — and is disabled entirely once deployed
// (production), so nothing here is reachable by the public.
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not available in production." }, { status: 404 });
  }
  return Response.json({ hasTmdbKey: !!process.env.TMDB_API_KEY });
}