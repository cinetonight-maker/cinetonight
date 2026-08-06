/** Shown while the person page's server-side data fetch is in flight. */
export default function Loading() {
  return (
    <div className="page">
      <div className="person">
        <div className="person__ph skel" />
        <div>
          <div className="skel skel--bar" style={{ height: 28, width: "50%", marginBottom: 14 }} />
          <div className="skel skel--bar" style={{ height: 16, width: "30%", marginBottom: 20 }} />
          <div className="skel skel--bar" style={{ height: 60, width: "100%" }} />
        </div>
      </div>
    </div>
  );
}
