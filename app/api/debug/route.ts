export async function GET() {
  return Response.json({
    hasKey: !!process.env.TMDB_API_KEY,
    keyPreview: process.env.TMDB_API_KEY?.slice(0, 6) ?? "NOT FOUND",
  });
}