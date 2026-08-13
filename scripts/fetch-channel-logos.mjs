// Downloads every channel's official logo (Wikimedia Commons brand assets)
// into public/channel-logos/, so the site serves them from its OWN origin —
// no hotlinking, nothing external left to break at runtime.
//
//   node scripts/fetch-channel-logos.mjs           (skips files already downloaded)
//   node scripts/fetch-channel-logos.mjs --force   (re-downloads everything)
//
// Resolution order per logo:
//   1. any hardcoded direct upload.wikimedia.org URLs (fast path)
//   2. the Commons API (action=query&prop=imageinfo) for each candidate
//      FILE NAME — this follows renames/redirects and returns the file's
//      true current URL, which is what fixes names that 404 on the
//      computed hash path.
// Cards whose logo file is missing render the gradient fallback, so a
// failed download never breaks the page. Commit downloaded files with git.

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const OUT_DIR = resolve(process.cwd(), "public/channel-logos");
const FORCE = process.argv.includes("--force");
// Wikimedia asks for a descriptive User-Agent with contact info; generic
// UAs get blocked on the wiki/API domains.
const UA = "CineTonight-site-build/1.0 (movie discovery site; logo asset fetch; contact: site admin)";

const LOGOS = [
  { file: "netflix.svg", urls: ["https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg"], names: ["Netflix 2015 logo.svg"] },
  { file: "apple-tv.svg", urls: ["https://upload.wikimedia.org/wikipedia/commons/2/28/Apple_TV_Plus_Logo.svg"], names: ["Apple TV Plus Logo.svg"] },
  { file: "zee5.png", urls: ["https://upload.wikimedia.org/wikipedia/commons/b/b5/ZEE5_2025.png"], names: ["ZEE5 2025.png"] },
  { file: "viki.svg", urls: ["https://upload.wikimedia.org/wikipedia/commons/e/e4/Rakuten_Viki_2022.svg"], names: ["Rakuten Viki 2022.svg"] },
  // prime-video / jiohotstar / sony-liv / crunchyroll / google-play /
  // youtube / mx-player / aha / sun-nxt / hoichoi / shemaroo-me /
  // lionsgate-play are
  // HAND-DRAWN SVG wordmarks committed directly in public/channel-logos/
  // (Commons' website/API is unreachable from some networks, so file-name
  // resolution can't be relied on — self-drawn art removed the dependency).
  // sun-nxt / hoichoi / eros-now have no logo yet → gradient fallback.
];

async function download(url) {
  const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length >= 200 ? buf : null; // tiny responses are error pages
}

/** Ask the Commons API for a file's true current URL (follows renames). */
async function resolveViaApi(name) {
  const api = new URL("https://commons.wikimedia.org/w/api.php");
  api.searchParams.set("action", "query");
  api.searchParams.set("titles", `File:${name}`);
  api.searchParams.set("prop", "imageinfo");
  api.searchParams.set("iiprop", "url");
  api.searchParams.set("redirects", "1");
  api.searchParams.set("format", "json");
  try {
    const res = await fetch(api, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data?.query?.pages ?? {};
    for (const page of Object.values(pages)) {
      const url = page?.imageinfo?.[0]?.url;
      if (url) return url;
    }
  } catch { /* API unreachable — caller falls through */ }
  return null;
}

await mkdir(OUT_DIR, { recursive: true });

let ok = 0, skipped = 0, failed = 0;
for (const { file, urls, names } of LOGOS) {
  const dest = resolve(OUT_DIR, file);
  if (!FORCE && existsSync(dest)) { console.log(`• ${file.padEnd(18)} already downloaded (use --force to refresh)`); skipped++; continue; }

  let buf = null, source = null;
  for (const url of urls) {
    buf = await download(url).catch(() => null);
    if (buf) { source = url.split("/").pop(); break; }
  }
  if (!buf) {
    for (const name of names ?? []) {
      const real = await resolveViaApi(name);
      if (!real) continue;
      buf = await download(real).catch(() => null);
      if (buf) { source = `${name} → ${real.split("/").pop()}`; break; }
    }
  }

  if (buf) {
    await writeFile(dest, buf);
    console.log(`✓ ${file.padEnd(18)} ${Math.round(buf.length / 102.4) / 10} KB  ← ${source}`);
    ok++;
  } else {
    console.log(`✗ ${file.padEnd(18)} all sources failed — card will use the gradient fallback`);
    failed++;
  }
}

console.log(`\n${ok} downloaded, ${skipped} already present, ${failed} failed. Commit public/channel-logos/ with your next push.`);
