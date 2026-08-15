#!/usr/bin/env node
/**
 * Regenerate lib/channelLogoManifest.ts from the actual contents of
 * public/channel-logos/. Run from the project root after adding or
 * removing logo files:
 *   node scripts/gen-logo-manifest.mjs
 */
import { readdirSync, writeFileSync } from "node:fs";

const files = readdirSync("public/channel-logos")
  .filter((f) => /\.(svg|png|webp)$/i.test(f))
  .sort();

const body = `/** Filenames that exist in public/channel-logos/.
 *
 *  This list is code, not a runtime disk check, because the site runs on
 *  hosts with no filesystem at request time (Cloudflare Workers): an
 *  existsSync() there answers false for every file, which silently degraded
 *  every rich channel card to the plain gradient fallback.
 *
 *  After adding or removing files in public/channel-logos/, regenerate with:
 *    node scripts/gen-logo-manifest.mjs
 */
export const CHANNEL_LOGO_FILES = new Set<string>([
${files.map((f) => `  ${JSON.stringify(f)},`).join("\n")}
]);

export function channelLogoUrl(logoFile: string | undefined): string | null {
  return logoFile && CHANNEL_LOGO_FILES.has(logoFile)
    ? \`/channel-logos/\${logoFile}\`
    : null;
}
`;

writeFileSync("lib/channelLogoManifest.ts", body);
console.log(`lib/channelLogoManifest.ts regenerated with ${files.length} files:`);
for (const f of files) console.log("  " + f);
