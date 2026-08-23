#!/usr/bin/env node
/**
 * Pre-deploy safety check — run AFTER `npx opennextjs-cloudflare build`,
 * BEFORE `npx opennextjs-cloudflare deploy`:
 *
 *     node scripts/predeploy-check.mjs
 *
 * Guards against the exact failure classes we have been bitten by:
 *  1. Cache interception accidentally re-enabled in the BUILT worker
 *     (root cause of the Aug 2026 request-loop incident — full RSC payloads
 *     served for segment prefetches, Next 16 clients retry forever).
 *  2. Deploying a stale .open-next (built before the current source edit).
 *  3. Missing build output.
 *
 * Exits non-zero on any failure so it can gate a deploy script.
 */
import { readFileSync, statSync, readdirSync } from 'node:fs';

let failed = false;
const fail = (msg) => { console.error('  ✗ ' + msg); failed = true; };
const ok = (msg) => console.log('  ✓ ' + msg);

console.log('Pre-deploy checks:');

// 1. Built worker must have cache interception DISABLED.
try {
  const handler = readFileSync('.open-next/server-functions/default/handler.mjs', 'utf8');
  if (/enableCacheInterception\s*[:=]\s*(!1|false)/.test(handler)) {
    ok('cache interception is DISABLED in the built worker');
  } else if (/enableCacheInterception/.test(handler)) {
    fail('cache interception appears ENABLED in the built worker — this caused the request-loop incident. Set enableCacheInterception: false in open-next.config.ts and rebuild.');
  } else {
    fail('could not find enableCacheInterception in the built worker — inspect manually before deploying.');
  }
} catch {
  fail('.open-next build output not found — run `npx opennextjs-cloudflare build` first.');
}

// 2. Source config must also say false (belt and suspenders).
try {
  const cfg = readFileSync('open-next.config.ts', 'utf8');
  if (/enableCacheInterception\s*:\s*false/.test(cfg)) ok('open-next.config.ts has enableCacheInterception: false');
  else fail('open-next.config.ts does not set enableCacheInterception: false.');
} catch {
  fail('open-next.config.ts not readable.');
}

// 3. Staleness: the build must be NEWER than the newest source file.
//
// DO NOT go back to timing this off `.open-next/worker.js`. That file is
// COPIED out of node_modules/@opennextjs/cloudflare and keeps the timestamp
// the package was installed with — on Windows it never moves, however many
// times you rebuild. Observed on a real machine: worker.js and
// node_modules/@opennextjs/cloudflare/package.json shared a modified time to
// the millisecond (14 Aug 22:43:30.242Z) while the build had just finished,
// so this check reported STALE BUILD forever and no rebuild could clear it.
//
// The honest signal is the NEWEST file anywhere in .open-next — whatever the
// build actually regenerated this run (server-functions/default/handler.mjs
// and friends). Taking the maximum is immune to any single template file
// carrying an old date.
try {
  let buildTime = 0;
  const newestIn = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) newestIn(p);
      else { const t = statSync(p).mtimeMs; if (t > buildTime) buildTime = t; }
    }
  };
  newestIn('.open-next');
  // `next build` always runs first, so BUILD_ID is a sane floor if .open-next
  // somehow contains nothing but copied templates.
  try { buildTime = Math.max(buildTime, statSync('.next/BUILD_ID').mtimeMs); } catch {}
  if (!buildTime) throw new Error('no build output');

  let newest = { file: '', t: 0 };
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else { const t = statSync(p).mtimeMs; if (t > newest.t) newest = { file: p, t }; }
    }
  };
  for (const d of ['app', 'components', 'lib', 'content']) { try { walk(d); } catch {} }
  if (buildTime >= newest.t) ok('build is newer than every source file (not stale)');
  else fail(`STALE BUILD: ${newest.file} changed after the last build. Run \`npx opennextjs-cloudflare build\` again (remember: \`deploy\` does NOT rebuild).`);
} catch {
  fail('.open-next build output not found — run `npx opennextjs-cloudflare build` first.');
}

// 4. BUILD_ID sanity (assets and server agree).
try {
  const a = readFileSync('.open-next/assets/BUILD_ID', 'utf8').trim();
  const b = readFileSync('.next/BUILD_ID', 'utf8').trim();
  if (a && a === b) ok(`BUILD_ID consistent (${a})`);
  else fail(`BUILD_ID mismatch between .next (${b}) and .open-next assets (${a}) — rebuild.`);
} catch {
  fail('BUILD_ID files unreadable — build first.');
}

console.log(failed ? '\nDO NOT DEPLOY — fix the failures above and rebuild.' : '\nAll checks passed — safe to run `npx opennextjs-cloudflare deploy`.');
process.exit(failed ? 1 : 0);
