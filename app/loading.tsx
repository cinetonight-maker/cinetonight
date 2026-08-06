/** Root-level loading state — covers the home page (hero + rows, the
 *  heaviest server fetch on the site: catalogue + live TMDB rows) and acts
 *  as the instant fallback for any other route that doesn't define its own
 *  more specific loading.tsx. */
export default function Loading() {
  return (
    <div className="page">
      <div className="hero skel" style={{ aspectRatio: "auto" }} />
      <div className="pagerow">
        <div className="pagemain">
          {Array.from({ length: 2 }).map((_, r) => (
            <div key={r} style={{ marginBottom: 28 }}>
              <div className="skel skel--bar" style={{ height: 20, width: 160, marginBottom: 14 }} />
              <div style={{ display: "flex", gap: 14, overflow: "hidden" }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skel" style={{ flex: "0 0 172px" }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
