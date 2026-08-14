import Link from "next/link";
import Image from "next/image";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Icon from "./Icon";
import ChannelCard from "./ChannelCard";
import { poster } from "@/lib/images";
import { channelTitlesForRegion, type Channel } from "@/lib/channels";

/** The upgraded channel card: real brand logo up top (self-hosted from
 *  public/channel-logos/ — see scripts/fetch-channel-logos.mjs), a fanned
 *  row of that platform's CURRENT top-4 movie posters (live TMDB
 *  watch-provider data, so it re-arranges itself as the charts move), and
 *  an explore CTA. Falls back to the simple gradient ChannelCard whenever
 *  the logo file hasn't been downloaded or live data comes back short, so
 *  the rail never shows a half-empty or broken card. */

/** Server-side check that the logo was actually downloaded — public/ files
 *  ship with the build, so this is a one-time fs stat per render, and it's
 *  what guarantees a missing download degrades to the gradient card
 *  instead of a broken <img>. */
function logoPath(channel: Channel): string | null {
  if (!channel.logoFile) return null;
  const abs = join(process.cwd(), "public", "channel-logos", channel.logoFile);
  return existsSync(abs) ? `/channel-logos/${channel.logoFile}` : null;
}

export default async function ChannelCardRich({ channel }: { channel: Channel }) {
  const logo = logoPath(channel);
  // Fixed home region (not per-visitor): keeps the homepage statically
  // cacheable. The poster fan is decoration; the channel PAGE stays
  // per-visitor. Uses the channel's home market.
  const region = channel.region ?? "IN";
  const top = logo ? (await channelTitlesForRegion(channel, "movie", 4, region)).titles : [];
  if (!logo || top.length < 4) return <ChannelCard channel={channel} />;

  return (
    <Link
      className="chanx"
      href={`/channel/${channel.slug}`}
      style={{ borderColor: `color-mix(in srgb, ${channel.color} 35%, var(--line))` }}
    >
      <span className="chanx__glow" style={{ background: `radial-gradient(120% 90% at 20% 0%, color-mix(in srgb, ${channel.color} 30%, transparent) 0%, transparent 60%)` }} />
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny self-hosted brand asset (often SVG); next/image would need dangerouslyAllowSVG */}
      <img
        className="chanx__logo"
        src={logo}
        alt={`${channel.name} logo`}
        loading="lazy"
        style={channel.logoInvert ? { filter: "invert(1) hue-rotate(180deg)" } : undefined}
      />
      <span className="chanx__posters" aria-hidden="true">
        {top.map((m, i) => (
          <span className="chanx__p" key={m.id} style={{ zIndex: 10 - i }}>
            <Image fill alt="" src={poster(m)} sizes="86px" />
          </span>
        ))}
      </span>
      <span className="chanx__meta">
        <span className="chanx__t">Top movies streaming now</span>
        <span className="chanx__cta" style={{ color: channel.color }}>
          Explore {channel.name} <Icon name="arrow" size={13} />
        </span>
      </span>
    </Link>
  );
}
