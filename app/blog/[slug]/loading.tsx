/** Shown while a single blog post's server-side data fetch is in flight. */
export default function Loading() {
  return (
    <div className="page">
      <div className="article">
        <div className="skel skel--bar" style={{ height: 14, width: 90, marginBottom: 14 }} />
        <div className="skel skel--bar" style={{ height: 32, width: "75%", marginBottom: 20 }} />
        <div className="article__img skel" style={{ aspectRatio: "16/8" }} />
        <div className="skel skel--bar" style={{ height: 16, width: "100%", marginBottom: 10 }} />
        <div className="skel skel--bar" style={{ height: 16, width: "95%", marginBottom: 10 }} />
        <div className="skel skel--bar" style={{ height: 16, width: "88%" }} />
      </div>
    </div>
  );
}
