// Verifies every entry in content/classics.json actually resolves to a
// playable source, so you never publish a broken (or wrong) embed:
//   - archive entries → hits archive.org's metadata API and confirms the
//     item exists and contains at least one video file
//   - youtube entries → hits YouTube's public oEmbed endpoint (no API key)
//
// Run it on YOUR machine (it needs internet):  node scripts/check-classics.mjs
//
// Workflow for adding a film:
//   1. Find it on archive.org, confirm it's genuinely public domain (check
//      the item's description/reviews — archive.org also hosts mislabeled
//      pirated uploads, so curate by hand, always).
//   2. Copy the identifier from the URL: archive.org/details/<identifier>
//   3. Add an entry to content/classics.json with status "draft"
//   4. Run this script — if it reports OK, flip status to "published"

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const classics = JSON.parse(await readFile(resolve(process.cwd(), "content/classics.json"), "utf8"));

const VIDEO_EXT = /\.(mp4|mkv|avi|ogv|mpg|mpeg|m4v|webm)$/i;

async function checkArchive(id) {
  const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`);
  if (!res.ok) return { ok: false, why: `metadata API returned ${res.status}` };
  const data = await res.json();
  if (!data?.metadata) return { ok: false, why: "item does not exist" };
  const hasVideo = (data.files ?? []).some((f) => VIDEO_EXT.test(f.name ?? ""));
  if (!hasVideo) return { ok: false, why: "item exists but contains no video files" };
  return { ok: true, why: `"${data.metadata.title ?? id}"` };
}

async function checkYoutube(id) {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
  const res = await fetch(url);
  if (!res.ok) return { ok: false, why: `oEmbed returned ${res.status} (video missing/private?)` };
  const data = await res.json();
  return { ok: true, why: `"${data.title}"` };
}

let failures = 0;
for (const c of classics) {
  let result;
  try {
    result = c.source.type === "archive" ? await checkArchive(c.source.id) : await checkYoutube(c.source.id);
  } catch (e) {
    result = { ok: false, why: e.message };
  }
  const mark = result.ok ? "✓" : "✗";
  const status = (c.status ?? "draft").toUpperCase().padEnd(9);
  console.log(`${mark} ${status} ${c.slug.padEnd(36)} ${c.source.type}:${c.source.id}  → ${result.why}`);
  if (!result.ok) {
    failures++;
    if (c.status === "published") console.log(`  ⚠ PUBLISHED entry is broken — fix source.id or set status:"draft" now.`);
  }
}

console.log(failures === 0
  ? "\nAll sources verified. Safe to publish anything still in draft (after you've confirmed it's public domain)."
  : `\n${failures} entr${failures === 1 ? "y" : "ies"} failed — fix source.id (search archive.org/details/... for the right identifier) before publishing.`);
process.exit(failures && classics.some((c) => c.status === "published") ? 0 : failures ? 1 : 0);
