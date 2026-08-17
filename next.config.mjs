/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Serve images directly from their source CDNs instead of routing every
    // poster through Vercel's metered image optimizer. TMDB already delivers
    // pre-sized, CDN-cached art (we request exact w342/w500/w1280 variants),
    // so the optimizer added little — but its 5,000/month Hobby-plan cap
    // made the whole catalogue's images start FAILING once exhausted
    // (the "broken posters everywhere" incident). next/image keeps doing
    // lazy-loading and layout; only the transformation step is skipped.
    // If the project ever moves to Vercel Pro, this can be revisited.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org" },
      { protocol: "https", hostname: "picsum.photos" },
      // Uploaded Media Library files (blog featured images, catalogue poster
      // overrides) are served from Supabase Storage's public URL, which is
      // always <project-ref>.supabase.co — wildcard covers any project.
      { protocol: "https", hostname: "*.supabase.co" },
    ] },
  // Custom pages moved from /p/<slug> to /<slug> (keyword-bearing URLs).
  // A config-level redirect emits a REAL HTTP 308 before any rendering —
  // the in-app fallback (app/p/[slug]) streams a 200, which crawlers treat
  // less cleanly. permanent:true = 308, transfers indexed standing.
  async redirects() {
    return [
      { source: "/p/:slug", destination: "/:slug", permanent: true },
      // Old demo "Go Premium" page — CineTonight sells no streaming plans.
      { source: "/pricing", destination: "/", permanent: true },
    ];
  },
  // Baseline security headers — free, no third-party service required.
  // X-Frame-Options: DENY stops other sites from framing CineTonight for
  // clickjacking; it has no effect on us embedding YouTube trailers
  // (that's us framing them, not the reverse). HSTS only matters once the
  // site is actually served over HTTPS (true on Vercel by default).
  async headers() {
    return [
      // /admin already carries a noindex meta tag via its layout; this adds
      // the same directive at the HTTP-header level, which even non-HTML
      // responses and overly eager crawlers respect. robots.txt disallow +
      // meta noindex + header = every mechanism Google documents.
      // Edge-cacheable PUBLIC content routes.
      //
      // These carry a real Cache-Control with s-maxage, which is what a CDN
      // (Cloudflare here) reads, while max-age=0 keeps browsers revalidating
      // so a visitor never sees a frozen page. This is how the long-tail
      // routes get absorbed for FREE at the edge instead of being persisted
      // into the R2 incremental cache, which is what turned into a $70/month
      // surprise. /person/* is listed first because it is now rendered per
      // request (see that route's comment) and relies on this entirely.
      //
      // The path list is deliberately explicit rather than a broad "everything
      // except api" pattern: /account, /my-list and /admin must NEVER get a
      // public cache header, or one signed-in visitor's HTML could be served
      // to another from a shared cache.
      {
        source: "/person/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800" },
        ],
      },
      {
        source: "/movie/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=43200, stale-while-revalidate=604800" },
        ],
      },
      {
        source: "/(free-movies|genres|channel|blog|faq|follow)/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
        ],
      },
      // Kept for portability: harmless on Cloudflare, correct if this ever
      // runs on Vercel again. Affects ONLY an edge cache, never browsers.
      {
        source: "/((?!api/|admin|account|my-list).*)",
        headers: [
          { key: "Vercel-CDN-Cache-Control", value: "public, s-maxage=300, stale-while-revalidate=86400" },
        ],
      },
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};
export default nextConfig;
