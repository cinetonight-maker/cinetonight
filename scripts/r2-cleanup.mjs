/**
 * R2 incremental-cache cleanup — removes dead-build cache generations.
 *
 * WHAT IT DOES
 *   Lists every object in the cache bucket, groups keys by the build id
 *   embedded in the key path (`incremental-cache/<BUILD_ID>/<sha>.<ext>`),
 *   and — only with --apply — deletes the groups that do NOT belong to the
 *   currently deployed build. The current build's id is read from
 *   `.open-next/assets/BUILD_ID`, i.e. the exact artifact the last deploy
 *   uploaded. Keys that don't match the incremental-cache pattern are NEVER
 *   deleted (they are listed under "other" for visibility only).
 *
 * SAFETY
 *   - Default mode is DRY-RUN: it prints the per-build table and exits.
 *     Nothing is deleted without the --apply flag.
 *   - --apply aborts unless the current build's keys are actually present
 *     in the bucket (protects against reading a stale/wrong BUILD_ID).
 *   - Deleting a live key is self-healing anyway (the site regenerates it
 *     on next visit), but the guards above mean we never get there.
 *   - R2 DeleteObjects calls are free; ListObjectsV2 calls are Class A but
 *     a full sweep of ~3.2M objects is ~3.2k calls — negligible.
 *
 * SETUP (one time)
 *   1. npm i -D @aws-sdk/client-s3
 *   2. Create an R2 API token: Cloudflare dash -> R2 -> Manage R2 API Tokens
 *      -> Create API Token -> permission "Object Read & Write", scoped to
 *      the cinetonight-cache bucket only.
 *   3. Create a file named `.r2-cleanup.env` in the project root (it is
 *      gitignored) with:
 *        R2_ACCOUNT_ID=<your account id — `npx wrangler whoami` prints it>
 *        R2_ACCESS_KEY_ID=<from the token screen>
 *        R2_SECRET_ACCESS_KEY=<from the token screen>
 *
 * RUN
 *   node scripts/r2-cleanup.mjs           # dry-run: table only, no deletes
 *   node scripts/r2-cleanup.mjs --apply   # delete dead-build groups
 */

import { readFileSync, existsSync } from "node:fs";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const BUCKET = process.env.R2_BUCKET || "cinetonight-cache";
const PREFIX = "incremental-cache/";
const APPLY = process.argv.includes("--apply");

// ---- config -----------------------------------------------------------------
function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const env = { ...loadEnvFile(".r2-cleanup.env"), ...process.env };
for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) {
  if (!env[k]) {
    console.error(`Missing ${k}. Put it in .r2-cleanup.env (see header of this script).`);
    process.exit(1);
  }
}

// ---- current build id -------------------------------------------------------
const buildIdPath = ".open-next/assets/BUILD_ID";
if (!existsSync(buildIdPath)) {
  console.error(`Cannot read ${buildIdPath} — run this from the project root, after a build.`);
  process.exit(1);
}
const CURRENT = readFileSync(buildIdPath, "utf8").trim();
if (!/^[A-Za-z0-9_-]{10,}$/.test(CURRENT)) {
  console.error(`BUILD_ID looks wrong: "${CURRENT}" — aborting.`);
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

const fmtGB = (b) => (b / 1024 ** 3).toFixed(2) + " GB";
const fmtN = (n) => n.toLocaleString("en-US");

// ---- pass 1: full listing, grouped by build id ------------------------------
console.log(`Bucket: ${BUCKET}`);
console.log(`Current build (KEPT): ${CURRENT}`);
console.log(`Mode: ${APPLY ? "APPLY — dead builds will be deleted" : "DRY-RUN — nothing will be deleted"}\n`);
console.log("Listing bucket (a few minutes for millions of objects)...");

const groups = new Map(); // buildId -> {count, bytes}
let other = { count: 0, bytes: 0 };
let listed = 0;
let token = undefined;
const t0 = Date.now();

// In apply mode we delete as we go (streaming) to avoid holding 3M keys in RAM.
let deleteQueue = [];
let deleted = 0;
let deleteErrors = 0;
async function flushDeletes(force = false) {
  while (deleteQueue.length >= 1000 || (force && deleteQueue.length > 0)) {
    const batch = deleteQueue.splice(0, 1000);
    try {
      const res = await s3.send(new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }));
      deleted += batch.length - (res.Errors?.length || 0);
      deleteErrors += res.Errors?.length || 0;
    } catch (e) {
      deleteErrors += batch.length;
      console.error("Delete batch failed:", e.name || e.message);
    }
  }
}

// Safety in apply mode: confirm the current build actually has keys before
// deleting anything. First sweep the current build's own prefix.
if (APPLY) {
  const probe = await s3.send(new ListObjectsV2Command({
    Bucket: BUCKET, Prefix: `${PREFIX}${CURRENT}/`, MaxKeys: 5,
  }));
  if (!probe.Contents?.length) {
    console.error(`ABORT: no keys found under ${PREFIX}${CURRENT}/ — the BUILD_ID on disk does not match what is deployed. Nothing was deleted.`);
    process.exit(1);
  }
  console.log(`Safety check passed: current build's cache entries exist in the bucket.\n`);
}

do {
  const page = await s3.send(new ListObjectsV2Command({
    Bucket: BUCKET, ContinuationToken: token, MaxKeys: 1000,
  }));
  for (const obj of page.Contents || []) {
    listed++;
    const key = obj.Key;
    const size = obj.Size || 0;
    const m = key.startsWith(PREFIX) ? key.slice(PREFIX.length).split("/") : null;
    if (m && m.length >= 2 && m[0].length >= 10) {
      const id = m[0];
      const g = groups.get(id) || { count: 0, bytes: 0 };
      g.count++; g.bytes += size;
      groups.set(id, g);
      if (APPLY && id !== CURRENT) deleteQueue.push(key);
    } else {
      other.count++; other.bytes += size; // never deleted
    }
  }
  if (APPLY) await flushDeletes();
  if (listed % 100000 < 1000 && listed > 0) {
    const rate = listed / ((Date.now() - t0) / 1000);
    console.log(`  ...${fmtN(listed)} listed${APPLY ? `, ${fmtN(deleted)} deleted` : ""} (${Math.round(rate)}/s)`);
  }
  token = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (token);
if (APPLY) await flushDeletes(true);

// ---- report -----------------------------------------------------------------
console.log(`\nDone. ${fmtN(listed)} objects scanned in ${Math.round((Date.now() - t0) / 1000)}s.\n`);
const rows = [...groups.entries()].sort((a, b) => b[1].count - a[1].count);
console.log("Build id                          Objects        Size      Status");
console.log("-".repeat(72));
for (const [id, g] of rows) {
  const status = id === CURRENT ? "CURRENT — kept" : (APPLY ? "deleted" : "DEAD — would delete");
  console.log(`${id.padEnd(30)} ${fmtN(g.count).padStart(12)} ${fmtGB(g.bytes).padStart(11)}   ${status}`);
}
if (other.count) {
  console.log(`${"(other keys — never touched)".padEnd(30)} ${fmtN(other.count).padStart(12)} ${fmtGB(other.bytes).padStart(11)}   kept`);
}
if (APPLY) {
  console.log(`\nDeleted: ${fmtN(deleted)} objects. Errors: ${fmtN(deleteErrors)}.`);
  if (deleteErrors) console.log("Some batches failed — simply run the script with --apply again; it only ever targets dead builds.");
  console.log("Run `npx wrangler r2 bucket info cinetonight-cache` to confirm the new object count.");
} else {
  const dead = rows.filter(([id]) => id !== CURRENT).reduce((a, [, g]) => ({ count: a.count + g.count, bytes: a.bytes + g.bytes }), { count: 0, bytes: 0 });
  console.log(`\nDRY-RUN summary: ${fmtN(dead.count)} objects (${fmtGB(dead.bytes)}) belong to dead builds and would be deleted.`);
  console.log(`The current build keeps ${fmtN(groups.get(CURRENT)?.count || 0)} objects. Nothing was deleted.`);
  console.log(`To actually delete: node scripts/r2-cleanup.mjs --apply`);
}
