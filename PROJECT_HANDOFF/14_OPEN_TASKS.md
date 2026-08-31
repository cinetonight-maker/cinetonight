# 14 — Open tasks

**As of 31 August 2026.**

---

## URGENT

**1. Deploy the pending batch.**
Status: built, verified, held since 26 Aug. Next action: commit, then
`tsc` → build → `predeploy-check.mjs` (4/4) → deploy → run the four
verification checks in `12_CURRENT_DEPLOYMENT_STATE.md`.
Dependencies: none. **Eight improvements are sitting idle, including the fix
that puts real streaming data on ~24,000 pages.**

**2. Set `CACHE_PURGE_ZONE_ID` and `CACHE_PURGE_API_TOKEN` as Worker secrets.**
Status: not done. Next action: create a scoped Cloudflare API token, add both
as Worker secrets. Dependencies: none. **Without these, every publish silently
fails to clear the edge — the cause of the twelve-day stale pages.**

## HIGH PRIORITY

**3. Purge the launch-day cache entries.**
`/trending`, `/latest`, `/genres`, `/web-series`, `/free-movies`, `/follow`,
`/blog`. `/trending` is still serving Google a canonical pointing at a dead
vercel.app host. Depends on: task 1 may clear it via new cache keys — verify
first, then purge what remains.

**4. Do not commit the stray test files.**
`blog-live.html`, `hallam-live.html`, `sitemap-live.xml`. Delete or gitignore.
Depends on: task 1.

## NORMAL

**5. Set per-post authors** in `/admin` for any post Syed Ahmad did not write.
All currently default to him. Depends on: task 1.

**6. Add `sameAs` profile links** for both authors in `lib/authors.ts`.
Blocked on the owner supplying real profile URLs. Deliberately left empty —
a fabricated `sameAs` is worse than none.

## LATER

**7. Align Rule 3's UA list with robots.txt.** Agreed as a backlog item.
See `11_CURRENT_SECURITY_CONFIGURATION.md`.

**8. Revisit AI bot policy before 15 September 2026,** when Cloudflare retires
the legacy "Block AI bots" offering.

## SEO

**9. Add in-body links from articles to individual movie pages.** The highest
value content item, and the one the stated strategy depends on. Posts #3-#10
have zero. Estimated 60-100k tokens across several sessions, because every URL
must be verified. **Suggested approach: build a script that resolves film
titles to verified CineTonight URLs via the TMDB API, then pilot on one post.**

**10. Build off-site brand presence.** Directory listings where competitors
already appear, film communities. This is owner work, not code.

**11. Check the GSC Countries tab.** Never done. It decides whether the
server-rendered availability region should be US or IN.

## CONTENT

**12. Decide the expired weekend post's fate** —
`what-to-watch-this-weekend-august-21-23-2026`. Refresh, redirect or leave.

**13. Thicken or merge the two thin OTT posts** — michael and jana-nayagan.

**14. Decide whether anyone will maintain OTT posts weekly.** Blocks the "New
OTT Releases in India" hub. **Asked twice, never answered.**

**15. Channel pages are thin** — ~350 words plus a grid, 15 pages, high-intent
queries. Opportunity, needs writing.

## CLOUDFLARE

**16. Verify actual R2 usage.** Containment is inferred from the fixes, never
confirmed against a usage graph.

## DEVELOPMENT

**17. `/movies` does not read `sort` from the URL.** Sorted views are not
shareable or crawlable. Minor.

**18. Standardise feature-image hosting** — currently split Supabase/TMDB.

**19. `middleware.ts` → `proxy.ts` codemod.** Next 16 deprecation. Queued for a
quiet moment with a full test run — it touches the file every request passes
through.

## V2

**20. Define V2.** Nothing exists. See `08_V2_MASTER_PLAN.md`. Start with what
problem V2 solves that V1 does not.
