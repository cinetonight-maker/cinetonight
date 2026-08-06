/** Shown while the movie detail page's server-side data fetch (Supabase +
 *  live TMDB) is in flight, instead of a blank screen. */
export default function Loading() {
  return (
    <div className="page">
      <section className="dhero">
        <div className="dposter skel" />
        <div>
          <div className="skel skel--bar" style={{ height: 36, width: "65%", marginBottom: 16 }} />
          <div className="skel skel--bar" style={{ height: 16, width: "45%", marginBottom: 28 }} />
          <div className="skel skel--bar" style={{ height: 40, width: 160, marginBottom: 24 }} />
          <div className="skel skel--bar" style={{ height: 90, width: "100%" }} />
        </div>
      </section>
    </div>
  );
}
