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
};
export default nextConfig;
