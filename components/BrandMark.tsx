/** CineTonight symbol — a rounded play button with a four-point sparkle at
 *  its top-left: "something special to watch tonight". Vector rebuild of
 *  the approved AI concept, in the site's exact palette, so it renders
 *  crisp at any size. Master copy also lives at public/logo.svg. */
export default function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      {/* back triangle — darker, offset for depth */}
      <path d="M52 36 L52 64 L76 50 Z" fill="#7e22ce" stroke="#7e22ce" strokeWidth="16" strokeLinejoin="round" />
      {/* front play triangle — brand purple, rounded via round join */}
      <path d="M40 34 L40 66 L68 50 Z" fill="var(--purple2, #a855f7)" stroke="var(--purple2, #a855f7)" strokeWidth="16" strokeLinejoin="round" />
      {/* four-point sparkle overlapping the top-left corner */}
      <path d="M36 8 Q38.6 21.4 52 24 Q38.6 26.6 36 40 Q33.4 26.6 20 24 Q33.4 21.4 36 8 Z" fill="#f4f2fa" />
    </svg>
  );
}
