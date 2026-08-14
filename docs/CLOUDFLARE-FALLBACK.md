# Cloudflare Workers fallback (tested 14 Aug 2026)

A full OpenNext Cloudflare build of this app was tested and WORKS, ready as
an escape hatch if Vercel pauses the project. Facts established:

- @opennextjs/cloudflare supports Next.js 16. Build succeeds.
- BUT Next 16's proxy.ts is Node-runtime-only and the adapter only supports
  edge middleware. Workaround that works today: rename proxy.ts to
  middleware.ts and rename the exported function `proxy` to `middleware`
  (legacy name still accepted by Next 16, deprecated). Watch for adapter
  Node-middleware support before Next removes the legacy name.
- Measured worker bundle: ~6.4 MB gzipped. That EXCEEDS the Workers Free
  plan 3 MiB limit -> requires Workers Paid ($5/month, 10 MiB limit,
  30M CPU-ms included). Free plan also has a 10 ms CPU cap per request,
  too tight for our SSR pages.
- Migration steps: rename proxy->middleware as above; wrangler.jsonc and
  open-next.config.ts are already in the repo; change lib/region.ts to read
  the `cf-ipcountry` header instead of `x-vercel-ip-country`; move the two
  vercel.json crons to Cloudflare Cron Triggers hitting the same API routes
  with the CRON_SECRET; set the six env vars as Worker secrets; deploy via
  `npx opennextjs-cloudflare deploy`, then point the (already-Cloudflare)
  DNS at the worker.
