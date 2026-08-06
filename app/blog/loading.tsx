/** Shown while the blog index's server-side data fetch is in flight. */
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
