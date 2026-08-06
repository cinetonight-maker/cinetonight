export default function Loading() {
  return (
    <div className="page">
      <div className="page__head"><h1>My List</h1><p>Your saved movies and shows.</p></div>
      <div className="pagerow">
        <div className="pagemain grid2">
          {Array.from({ length: 10 }).map((_, i) => <div key={i} className="skel" />)}
        </div>
      </div>
    </div>
  );
}
