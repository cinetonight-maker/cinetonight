import Link from "next/link";
import Icon from "./Icon";
import type { Channel } from "@/lib/channels";

/** Wide brand card for one streaming channel — same slot/size as the old
 *  Editor's Picks BigCards (the .bigcard rail), but instead of a movie it
 *  sells a platform: click through to /channel/<slug> for that platform's
 *  latest movies & shows. Pure CSS branding (tinted gradient + monogram),
 *  no logo images — platform logos are trademarked assets with usage
 *  rules, while a monogram + brand color is instantly recognizable and
 *  safe to ship. */
export default function ChannelCard({ channel }: { channel: Channel }) {
  return (
    <Link
      className="chanc"
      href={`/channel/${channel.slug}`}
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${channel.color} 26%, #101018) 0%, #12121b 62%, color-mix(in srgb, ${channel.color} 12%, #101018) 100%)`,
        borderColor: `color-mix(in srgb, ${channel.color} 35%, var(--line))`,
      }}
    >
      <span
        className="chanc__logo"
        style={{
          background: `color-mix(in srgb, ${channel.color} 24%, #15151f)`,
          color: channel.color,
          border: `1px solid color-mix(in srgb, ${channel.color} 55%, transparent)`,
        }}
      >
        {channel.name[0]}
      </span>
      <span className="chanc__name">{channel.name}</span>
      <span className="chanc__desc">{channel.desc}</span>
      <span className="chanc__cta" style={{ color: channel.color }}>
        Explore titles <Icon name="arrow" size={13} />
      </span>
    </Link>
  );
}
