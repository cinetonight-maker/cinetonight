/** Loading skeleton for the HOME PAGE ONLY.
 *
 *  WHY IT LIVES IN A ROUTE GROUP (Phase 4B-1):
 *  this file used to sit at app/loading.tsx, where it acted as the fallback
 *  for every route on the site that had no more specific one. That was the
 *  cause of the site-wide soft 404 — a loading.tsx creates a Suspense
 *  boundary, and the boundary flushes the response WITH ITS 200 STATUS before
 *  the page underneath can call notFound() or redirect(). Measured: with this
 *  file at the root, /channel/not-a-channel and /this-page-does-not-exist
 *  returned 200; moved in here, they return a real 404. The same move is what
 *  makes an in-page permanentRedirect() emit a real 308.
 *
 *  A route group — the (home) folder — changes nothing about the URL. This
 *  page is still "/". It only changes which routes the boundary covers, which
 *  is now exactly one: the home page, which can never 404, and which has the
 *  heaviest server fetch on the site (catalogue + live TMDB rows) and so is
 *  the one place the skeleton genuinely earns its place. */
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
