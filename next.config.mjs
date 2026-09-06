/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Local dev only: the dev server's own JS chunks (_next/static/*) get a
  // 403 for any origin Next doesn't recognise - a built-in anti DNS-
  // rebinding guard. On a Windows+WSL2 setup, plain localhost often can't
  // reach the dev server from the browser, so it has to be opened via
  // WSL's gateway/network IP instead (e.g. 172.29.48.1) - allowlisting it
  // here is what lets the page hydrate fully from that address instead of
  // silently running with its JS chunks blocked. Never consulted by
  // `next build`/`next start`, so this has zero effect in production.
  allowedDevOrigins: ["172.29.48.1", "localhost", "127.0.0.1"],
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
      // STAB-13 stage 1: Content-Security-Policy in REPORT-ONLY mode — logs
      // violations to the browser console without blocking anything, so the
      // allowlist below can be observed against real traffic before any
      // enforcement. Origins inventoried from the code: TMDB images,
      // Supabase (API + storage), YouTube embeds + thumbs, Internet Archive
      // players, Google Analytics. 'unsafe-inline' stays for Next's inline
      // runtime + JSON-LD; tightening to nonces is the enforcement-stage
      // task, not this one. NOTHING is blocked by this header.
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://image.tmdb.org https://*.supabase.co https://i.ytimg.com https://archive.org https://*.archive.org",
              "media-src 'self' https://archive.org https://*.archive.org",
              "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://archive.org https://*.archive.org",
              "connect-src 'self' https://*.supabase.co https://www.google-analytics.com https://api.themoviedb.org",
              "font-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
            ].join("; "),
          },
        ],
      },
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
        missing: [
          // NEVER apply this CDN header to RSC / prefetch requests. The
          // Next 16 client router prefetches routes and reads caching hints
          // from the response; our "max-age=0, s-maxage=..." header told it
          // every prefetch was instantly stale, so viewport links to static
          // routes re-prefetched in a tight loop - observed live at ~40
          // req/s per visitor on /follow and /free-movies. With this
          // condition the header applies to real HTML document requests
          // only, and RSC responses keep Next's own caching semantics.
          { type: "header", key: "rsc" },
        ],
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800" },
        ],
      },
      {
        source: "/movie/:path*",
        missing: [
          // NEVER apply this CDN header to RSC / prefetch requests. The
          // Next 16 client router prefetches routes and reads caching hints
          // from the response; our "max-age=0, s-maxage=..." header told it
          // every prefetch was instantly stale, so viewport links to static
          // routes re-prefetched in a tight loop - observed live at ~40
          // req/s per visitor on /follow and /free-movies. With this
          // condition the header applies to real HTML document requests
          // only, and RSC responses keep Next's own caching semantics.
          { type: "header", key: "rsc" },
        ],
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=43200, stale-while-revalidate=604800" },
        ],
      },
      {
        source: "/(free-movies|genres|channel|blog|faq|follow)/:path*",
        missing: [
          // NEVER apply this CDN header to RSC / prefetch requests. The
          // Next 16 client router prefetches routes and reads caching hints
          // from the response; our "max-age=0, s-maxage=..." header told it
          // every prefetch was instantly stale, so viewport links to static
          // routes re-prefetched in a tight loop - observed live at ~40
          // req/s per visitor on /follow and /free-movies. With this
          // condition the header applies to real HTML document requests
          // only, and RSC responses keep Next's own caching semantics.
          { type: "header", key: "rsc" },
        ],
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
        ],
      },
      // sitemap.xml and rss.xml are force-dynamic (they read Supabase and
      // TMDB) and are exactly what bots poll hardest. Without an edge cache
      // header every Googlebot/Bingbot poll was a full server render. An
      // hour of edge caching makes the poll storm hit Cloudflare's cache
      // instead of the Worker, and a sitemap that is an hour stale is
      // irrelevant at this site's publishing pace.
      // The browse pages are force-dynamic (they read searchParams), so
      // every hit - and bots hit them constantly - was a full Worker render.
      // Their query space is now clamped (page <= 5, fixed sorts), so the
      // set of distinct URLs is small and safe to edge-cache. This header
      // lets Cloudflare's edge absorb repeat visits; note the edge cache is
      // free, unlike the R2 incremental cache these pages deliberately skip.
      {
        source: "/(movies|tv-shows|web-series|trending|latest)",
        missing: [
          // NEVER apply this CDN header to RSC / prefetch requests. The
          // Next 16 client router prefetches routes and reads caching hints
          // from the response; our "max-age=0, s-maxage=..." header told it
          // every prefetch was instantly stale, so viewport links to static
          // routes re-prefetched in a tight loop - observed live at ~40
          // req/s per visitor on /follow and /free-movies. With this
          // condition the header applies to real HTML document requests
          // only, and RSC responses keep Next's own caching semantics.
          { type: "header", key: "rsc" },
        ],
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
        ],
      },
      // Self-hosted static art (channel logos, placeholder posters, brand
      // icons) never changes without a redeploy - let browsers keep it for a
      // month instead of re-asking on every visit. Not "immutable" because
      // logo files DO get replaced under the same name occasionally.
      {
        source: "/(channel-logos|social-logos)/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=2592000, s-maxage=2592000" },
        ],
      },
      {
        source: "/(placeholder-poster.png|placeholder-wide.png|placeholder-person.png|logo-512.png|logo.svg)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, s-maxage=2592000" },
        ],
      },
      {
        source: "/(sitemap.xml|rss.xml|robots.txt)",
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
