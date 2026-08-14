import Link from "next/link";
import { getSiteSettings } from "@/lib/data";

/** Compact follow bar shown under blog posts — catches readers at the
 *  exact moment they've just gotten value from us. Server component;
 *  renders nothing if no social links exist. */
const LOGOS: [string, string][] = [
  ["instagram", "instagram"], ["youtube", "youtube"], ["tiktok", "tiktok"],
  ["facebook", "facebook"], ["telegram", "telegram"], ["twitter", "x"],
];

export default async function FollowStrip() {
  const { social } = await getSiteSettings();
  const links = LOGOS.filter(([key]) => social[key]);
  if (!links.length) return null;
  return (
    <div className="fstrip">
      <div className="fstrip__txt">
        <b>Enjoyed this?</b> Get tonight&apos;s pick every day on your favorite app.
      </div>
      <div className="fstrip__icons">
        {links.map(([key, logo]) => (
          /* eslint-disable-next-line @next/next/no-img-element -- tiny self-hosted brand SVG */
          <a key={key} href={social[key]} target="_blank" rel="noopener noreferrer" aria-label={key}>
            <img src={`/social-logos/${logo}.svg`} alt={`${key} logo`} loading="lazy" />
          </a>
        ))}
        <Link className="fstrip__all" href="/follow">All socials</Link>
      </div>
    </div>
  );
}
