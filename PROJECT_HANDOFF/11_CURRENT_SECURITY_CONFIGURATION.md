# 11 — Current Cloudflare security configuration

**Captured 26 August 2026 from the Cloudflare dashboard. Nothing was modified
while documenting.** Two changes were made by the owner during that session and
are marked. **Verify before relying on this — five days have passed.**

---

## Custom rules — 4 of 5 slots used at capture, then Rule 4 was deleted

### Rule 1 — "Block bad crawlers" · Action: Block · Active
User Agent contains: `Bytespider`, `PetalBot`, `AhrefsBot`, `SemrushBot`,
`MJ12bot`, `DotBot`, `BLEXBot`, `DataForSeoBot`, `ZoominfoBot`, `MegaIndex`,
`serpstatbot`. Events at capture: **4**.

**Why:** aggressive SEO-tool and scraper crawlers re-crawl thousands of dynamic
pages, burn compute and send zero visitors. Mirrors robots.txt exactly.

### Rule 2 — "Challenge cloud datacenters" · Action: Managed Challenge · Active
AS Num in `16509`, `14618`, `8075`, `396982`, `14061`, `16276`, `24940`,
`45102`, AND `Known Bots does not equal true`, AND User Agent contains
`UptimeRobot` / `cron-job.org`. CSR 0%. Events: **200**.

**Why:** datacentre-originated scraping. **The `Known Bots != true` guard is
what keeps verified crawlers out of it.**

**Watch item:** AS396982 is Google Cloud. Some Google testing tools originate
there. If a GSC Live Test ever errors, suspect this rule before concluding
there is a real crawl problem.

### Rule 3 — "AI bots off person pages and images" · Action: Block · Active
Events at capture: **69,410**.

**CORRECTED 26 August 2026.** Path list is now:
```
starts_with(http.request.uri.path, "/person/")
or starts_with(http.request.uri.path, "/_next/image")
```
**`/movie/tmdb-` was REMOVED.** It had been blocking every major AI crawler from
the entire long tail while robots.txt explicitly allowed them there — the
comment at `app/robots.ts:32` claimed a matching edge rule, and it did not match.

User agents matched (lowercased `contains`): `claude`, `anthropic`, `gptbot`,
`oai-searchbot`, `chatgpt-user`, `perplexity`, `ccbot`, `meta-externalagent`,
`amazonbot`, `bytespider`, `google-extended`, `applebot-extended`, `cohere`,
`diffbot`, `imagesiftbot`, `youbot`, `omgili`, `timpibot`, `friendlycrawler`.

**Why:** keep AI crawlers off the two unbounded URL spaces while welcoming them
on content. Now genuinely matches robots.txt for the AI group.

### Rule 4 — "AI Crawl Control - Block AI bots by User Agent" · **DELETED**
Was: `URI Path does not equal /robots.txt AND User Agent contains ClaudeBot` →
Block. Events: 14. **Deleted 26 August 2026** because it blocked ClaudeBot on
every path, contradicting robots.txt, and Rule 3 already matches `claude` on
the paths that matter.

---

## Bot policies (Cloudflare "Configure AI bot policies")

| Setting | Value |
| --- | --- |
| Search | **Allow (do not block)** |
| Agent | **Allow (do not block)** |
| Training | **Allow (do not block)** |

Cloudflare notes these replace the legacy "Block AI bots" offering on
**15 September 2026** — worth revisiting before that date.

---

## Googlebot treatment

**Not blocked anywhere.**
- Rule 1: no Google token
- Rule 2: guarded by `Known Bots != true`; Googlebot crawls AS15169, not listed
- Rule 3: `google-extended` is a **robots.txt token, not a string Googlebot
  sends**. Googlebot's UA does not contain it.
- Rule 4: deleted; was ClaudeBot only

Confirmed against the event log: every blocked IP was AWS EC2 (54.x, 52.x,
98.x, 3.x, 18.x, 100.x, 44.x, 34.x, 23.x). Googlebot crawls from 66.249.x.
**Zero Googlebot blocks observed.**

Independently confirmed by GSC URL Inspection: crawl allowed, fetch successful.

---

## Security event log retention

**Free plan retains roughly 24 hours.** The robots.txt fetch failures Search
Console reported around **16 and 21 August** are no longer retrievable. That
question cannot now be answered from Cloudflare.

## Backlog item (agreed, not done)

Rule 3's UA list is broader than robots.txt's AI group. `diffbot`, `youbot`,
`omgili`, `timpibot`, `cohere`, `imagesiftbot`, `friendlycrawler` and
`applebot-extended` fall under robots.txt's `*` group, which does **not**
disallow `/person/`. They are blocked at the edge while robots.txt permits them.
Defensible as cost containment, but the two should be aligned deliberately.
`bytespider` in Rule 3 is redundant — Rule 1 already blocks it.

## UNKNOWN

- WAF managed rules configuration
- Rate limiting rules (none observed; `lib/rateLimit.ts` implements it in-app)
- Whether any Cache Rule exists
- Security Level setting
- Whether "I'm Under Attack" has ever been enabled
