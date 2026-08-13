/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [
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
    return [{ source: "/p/:slug", destination: "/:slug", permanent: true }];
  },
  // Baseline security headers — free, no third-party service required.
  // X-Frame-Options: DENY stops other sites from framing MOVIEX for
  // clickjacking; it has no effect on us embedding YouTube trailers
  // (that's us framing them, not the reverse). HSTS only matters once the
  // site is actually served over HTTPS (true on Vercel by default).
  async headers() {
    return [
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
