export default function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  const full = Math.round(rating);
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} className={i < full ? "ic" : "ic star-e"} viewBox="0 0 24 24" width={size} height={size}
          fill={i < full ? "currentColor" : "none"} stroke="currentColor" strokeWidth={i < full ? 0 : 1.5} aria-hidden="true">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </>
  );
}
