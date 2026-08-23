/** Loading skeleton for the BLOG INDEX ONLY (/blog).
 *
 *  Phase 4B-1: this was at app/blog/loading.tsx, one level up, where it also
 *  wrapped /blog/[slug] — and a Suspense boundary flushes the response with a
 *  200 before the page under it can call notFound(). That is what kept
 *  /blog/<invented-slug> returning 200 instead of 404 even after the root
 *  boundary was moved. The (index) route group scopes it to /blog alone; the
 *  URL is unchanged. */
export default function Loading() {
  return (
    <div className="page">
      <div className="page__head"><h1>The Blog</h1><p>Guides, spotlights and streaming news.</p></div>
      <div className="blog-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="blogc">
            <div className="blogc__img skel" style={{ aspectRatio: "16/9" }} />
            <div className="blogc__b">
              <div className="skel skel--bar" style={{ height: 12, width: "30%", marginBottom: 10 }} />
              <div className="skel skel--bar" style={{ height: 18, width: "80%", marginBottom: 10 }} />
              <div className="skel skel--bar" style={{ height: 14, width: "60%" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
