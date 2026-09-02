# scripts/

Only reusable tooling lives here. One-time content seeders and migrations
that already ran were removed at final handover (2 Sep 2026) — recover any
of them from git history if ever needed.

- `predeploy-check.mjs` — REQUIRED before every deploy (see the playbook §7).
- `sync-tmdb.mjs` — the catalogue freshen/hero sync (`npm run sync`). Note:
  its auto-ADD step is retired by the URL freeze; do not restore it.
- `r2-cleanup.mjs` — R2 incremental-cache maintenance (cost law).
- `sync-classics.mjs`, `check-classics.mjs`, `check-providers.mjs` —
  free-movies shelf and provider data diagnostics.
- `create-admin-user.mjs` — bootstrap an admin account.
- `import-post.mjs`, `import-page.mjs`, `export-posts.mjs` — CMS content
  transfer utilities.
- `fetch-channel-logos.mjs`, `gen-logo-manifest.mjs` — channel logo assets.
- `prune-home-rows.mjs`, `sync-home-rows.mjs` — homepage rows maintenance.
