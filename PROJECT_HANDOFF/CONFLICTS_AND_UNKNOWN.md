# Conflicts and unknowns

**Read this before acting on anything in the pack.** Nothing here is resolved by
guessing. Each item says what is believed and what must be verified.

---

## A. Requested content with no basis in the project

The handoff brief asked for these. They appear **nowhere** in the 25-26 August
session or in any project file. They may come from a different Claude
conversation, or from planning done elsewhere. **They are not recorded project
knowledge and must not be presented as such.**

| Requested | Reality |
| --- | --- |
| **Semrush usage** | Never discussed. "Semrush" appears only as `SemrushBot` in the robots.txt blocklist. The tool actually mentioned was **Ahrefs**, and only as "connected, don't make decisions from it yet" |
| **Low KD opportunities / keyword research approach** | No method ever established |
| **Topic clusters, pillar pages, topical authority** | Zero mentions anywhere |
| **"Best Movies Like Inception"** | Zero matches in files or session |
| **"Best Movies Under 90 Minutes" as a discovery/SEO page** | Never discussed as a page. **But "Under 90 Minutes" exists as a live Quick Pick filter** in `lib/quickPicks.ts` and `lib/discoveryConfig.ts`. Do not confuse the shipped filter with a planned SEO page. |
| **V2 goals, architecture, UX, roadmap** | Nothing. The only V2 reference is the owner's 31 Aug sentence about going "toward the v2 of our product" |
| **Personalization** | Never discussed |
| **"August 15-17 issue"** | No discrete event under that name. Commits exist on 16-18 Aug for R2 cost work, and GSC reported robots.txt fetch failures around 16 Aug |
| **"August 27 deployment"** | No such deploy. The last deploy is **22 August**. No commits or documents exist for 27 Aug |
| **"August 29 activity spike"** | No data of any kind |
| **R2 Class A/B counts, storage, Workers CPU, TMDB subrequests, cache hit rate** | Never measured. No dashboard was opened. The only figures that exist are historical, from code comments |

**Action for the new account:** ask the owner whether these came from another
conversation. If he wants them as strategy, they are **new decisions**, not
recovered ones.

---

## B. Genuine conflicts in the record

### B1 — Movie page revalidate: 72h or 6h?
`app/movie/[id]/page.tsx` declares `revalidate = 259200` (72h). The 26 August
build output shows **6h** on the four prerendered curated titles.
**Believed:** both are true. Next takes the **shortest** TTL among a segment's
fetches, and `trendingLiveTmdb` (6h) sits in the curated branch. Live-TMDB
pages take a different branch and should be 72h.
**Verify:** the effective TTL on a `tmdb-m-*` page. It was never observed.

### B2 — The audit PDF contradicts the later findings
`docs/seo-audit-cinetonight-com-2026-08-26.pdf` reports broken H1s, an 85-word
privacy policy, missing headings and a stale blog index as **defects**. They
were later proven to be **stale cache artefacts**; the code was correct.
**Believed:** the audit's Tier 1 is substantially wrong. Its GEO and AEO
findings still stand. **The PDF was never regenerated.** Read it alongside
section 7 of `docs/PROJECT-STATE-2026-08-26.md`.

### B3 — Is commit `3827a4c` deployed?
Committed 23 Aug, after the 22 Aug deploy. Its **content** changes are live
(they live in Supabase). Whether its **code** (FAQ schema on blog articles) is
live is **UNKNOWN**. **Verify:** check for FAQPage JSON-LD on a live blog post.

### B4 — India-first positioning vs. observed traffic
The site is positioned India-first; `lib/region.ts` defaults to `IN`. But the
measured top performers were Western and international arthouse titles, and the
owner later said the audience is "not just india... whole world... a little bit
focus on india", then chose **US** for the SSR region.
**Unverified:** the GSC Countries tab was never checked. That single click
decides whether US was right.

### B5 — Connected folder path
Session config lists `D:\Cowork\Stream\moviex-site`, which **does not exist**.
The real path is `D:\Cowork\Cine Tonight\cinetonight-site`. The owner confirmed
he renamed it.

### B6 — `docs/SEO-PHASE-4B-1.md` recommends a route-group move
It proposes `app/movie/(detail)/[id]/…` to fix the soft 404. That was written as
"what I would do" and **never tested**. The **deletion** approach was used
instead, matching what worked on blog and person pages. The doc still recommends
the untested route. **Do not follow it without testing.**

### B7 — Two meanings of "author"
`blog_revisions.author` = the admin email who saved a revision.
`blog_posts.author` (added 26 Aug) = the post's writer.
Caught before the SQL ran. The reasoning is in `supabase/blog_author.sql`.
**Do not merge these.**

### B8 — `temp/Blog_CMS_Guidelines_and_Post.docx` is obsolete
It instructs "use one H1 only" and its sample body opens with `# Title`. That is
the exact duplicate-heading bug. **`docs/CONTENT-RULES.md` supersedes it.**
If it is handed to a writer or an assistant, the bug returns.

---

## C. Open questions never answered

1. **Will anyone maintain the OTT release-date posts weekly?** Asked twice.
   Blocks the "New OTT Releases in India" hub, and house style forbids
   promising freshness nobody will deliver.
2. What should happen to the expired weekend post?
3. What are the authors' real social profile URLs, for `sameAs`?
4. What does V2 mean?

---

## D. Things to verify before trusting this pack

- Cloudflare security rules — captured 26 Aug, five days stale
- Whether the pending batch has since been deployed
- Whether the launch-day stale pages have cleared
- R2 usage — containment is inferred from the fixes, never confirmed
- Current GSC performance — the last figures are from 25-26 August
