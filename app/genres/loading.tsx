export default function Loading() {
  return (
    <div className="page">
      <div className="page__head"><h1>Genres</h1><p>Browse by mood and category.</p></div>
      <div className="gtiles">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="gtile skel" style={{ aspectRatio: "16/9" }} />
        ))}
      </div>
    </div>
  );
}
