/** Shown while the movie detail page's server-side data fetch (Supabase +
 *  live TMDB) is in flight, instead of a blank screen. Mirrors the real
 *  layout: inline trailer banner, then the compact detail bar. */
export default function Loading() {
  return (
    <div className="page">
      <div className="itrailer skel" style={{ border: "none" }} />
      <section className="dbar">
        <div className="dbar__poster skel" />
        <div style={{ flex: 1 }}>
          <div className="skel skel--bar" style={{ height: 26, width: "45%", marginBottom: 12 }} />
          <div className="skel skel--bar" style={{ height: 14, width: "30%", marginBottom: 10 }} />
          <div className="skel skel--bar" style={{ height: 14, width: "38%" }} />
        </div>
      </section>
      <div className="skel skel--bar" style={{ height: 180, borderRadius: 16 }} />
    </div>
  );
}
