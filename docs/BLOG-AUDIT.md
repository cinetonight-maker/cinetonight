# Blog audit — all 11 posts

**23 August 2026.** Every live post fetched and inspected: headings, titles,
metas, word counts, internal links, FAQ blocks, schema, image hosts, and the
time-sensitive claims inside each one.

**Verdict: two posts are genuinely good, three are competent, and six are thin
or structurally broken.** Nothing here is fatal. Most of it is a day's work.

One correction up front: the audit tooling served a cached copy of
`/blog/cant-decide-what-to-watch-tonight`. Figures for that post below are the
current version, verified directly against production.

---

## The 11 posts at a glance

| # | Post | Words | Body H2s | In-body links | Verdict |
| --- | --- | --- | --- | --- | --- |
| 1 | cant-decide-what-to-watch-tonight | 1,990 | 10 | 16 | **Good** |
| 2 | what-to-watch-this-weekend-august-21-23-2026 | 2,850 | 16 | 2 | Expired today |
| 3 | dune-3-release-date-cast-plot-trailer | 2,100 | 10 | 0 | **Good** |
| 4 | best-date-night-movies | 2,100 | 21 | 0 | **Good**, poorly linked |
| 5 | what-to-watch-before-avengers-doomsday | 850 | **0** | 0 | Broken structure |
| 6 | avengers-doomsday-release-date-india | 520 | **0** | 0 | Thin + broken |
| 7 | spider-man-brand-new-day-ott-release-date | 550 | **0** | 0 | Thin + broken |
| 8 | michael-ott-release-date-jiohotstar | 272 | **0** | 0 | **Fails own checklist** |
| 9 | jana-nayagan-ott-release-date | 307 | **0** | 0 | **Fails own checklist** |
| 10 | cocktail-2-ott-release-date | 223 | **0** | 0 | **Fails own checklist** |
| 11 | what-should-i-watch-tonight-how-to-decide-in-5-minutes | 650 | 3 | 0 | **Duplicate of #1** |

"Body H2s" excludes the FAQ heading, "Read next" and "Comments". Six posts have
**zero** headings in the article itself.

---

## Critical

### C1 — Two posts carry the identical title — ✅ RESOLVED 23 Aug 2026

**Done.** The 14 Aug post was unpublished and
`/blog/what-should-i-watch-tonight-how-to-decide-in-5-minutes` now returns a
**308** to `/blog/cant-decide-what-to-watch-tonight`. Verified against
production.

This was also the Redirect Manager's first real use. It behaved exactly as
designed: created disabled, promoted to permanent only after the destination
was checked. Both safety gates did their job.

*Follow-up still open:* `/blog/best-date-night-movies` links to the old address
in its body. It works through the redirect, but should point straight at the
surviving article. Folded into the internal-linking pass below.

The original finding, kept for the record:



| | |
| --- | --- |
| `/blog/cant-decide-what-to-watch-tonight` | "What Should I Watch Tonight? How to Decide in 5 Minutes" |
| `/blog/what-should-i-watch-tonight-how-to-decide-in-5-minutes` | "What Should I Watch Tonight? How to Decide in 5 Minutes" |

Same title, same topic, same intent, both live. **This is my fault** — post #11
already existed when I rewrote post #1 today, and I did not check the full post
list first.

Google will pick one and suppress the other, and it may not pick the one you
want. Post #11 is 650 words with three headings; post #1 is 1,990 words with a
full FAQ and 16 internal links. **#1 is the keeper.**

**Fix:** retire #11 and redirect it to #1. This is the migration the Redirect
Manager was built for, and unlike the slug change we skipped, here a redirect is
genuinely correct — the alternative is two pages fighting each other forever.

*Note the irony: #11's slug is the exact-match URL for the phrase, which is why
I proposed that slug this morning. The post at that URL is the weaker one.*

### C2 — Six posts have no headings in the body at all

Posts #5 through #10 each contain exactly one H2 — "Frequently asked questions"
— and nothing else. No section headings anywhere in the article itself.

Post #5 is titled **"The 10 Essentials"** and has no heading for any of the ten.
Post #6 promises **"Cast, Trailer and Everything We Know"** and has no Cast
heading and no Trailer heading.

This costs you three ways: readers cannot scan, Google cannot see the article's
structure, and you forfeit any chance of a jump-link or featured snippet.

**This also exposes a gap in your publish checklist.** `headingIssues()` passes
if *any* H2 exists, and "Frequently asked questions" satisfies it. Six posts
scored green on a check they should have failed.

### C3 — Three posts fail your own minimum length

| Post | Words | Your checklist says |
| --- | --- | --- |
| cocktail-2-ott-release-date | 223 | **fail** (under 300) |
| michael-ott-release-date-jiohotstar | 272 | **fail** (under 300) |
| jana-nayagan-ott-release-date | 307 | warn (under 600) |

Worse, they are the same template with the film's name swapped. One FAQ answer
is **word-for-word identical** across two of them:

> "No. Any active [Platform] plan includes it, from mobile to premium."

Three near-identical thin pages is a pattern Google treats as low-value
programmatic content, and it can drag on the whole site, not just those URLs.

### C4 — A broken internal link — ❌ WITHDRAWN, this was wrong

**There is no broken link. I reported one that does not exist.**

Checked directly against the post's source: `/blog/best-date-night-movies` contains
**zero** in-body links, and the slug
`/blog/what-to-watch-before-avengers-doomsday-the-10-essentials` appears in no
post body anywhere on the site.

**Where the mistake came from:** the audit read the *rendered page*, which shows
auto-generated "Read next" cards produced by `relatedPosts()` in the template.
Those cards are built from real post records, so they cannot point at a
non-existent URL. A card was read as an article link and its URL inferred from
the label rather than from the markup.

**The lesson, and it is the same one as the D1 bug:** a finding read off a
rendered surface is not the same as a finding read off the source. Anything
reported as a defect gets checked against the source before it goes in a list of
things to fix.

The date-night post's real problem is unchanged and listed below as I4: it has
no contextual internal links at all.

The original, incorrect finding, kept for the record:



`/blog/best-date-night-movies` links to:

```
/blog/what-to-watch-before-avengers-doomsday-the-10-essentials
```

The article actually lives at `/blog/what-to-watch-before-avengers-doomsday`.
That longer slug is not among the 11 posts on your blog index, so the link
returns a 404.

Confirm with:

```
curl -s -o NUL -w "%{http_code}\n" https://cinetonight.com/blog/what-to-watch-before-avengers-doomsday-the-10-essentials
```

**Fix:** correct the link in the post. Optionally add a redirect too, in case
the wrong URL was shared anywhere.

---

## Important

### I1 — Meta descriptions are being cut off mid-word

Three posts end their meta description mid-word at exactly 158 characters:

- "...where to check streaming **availabi**"
- "...trailer breakdown and latest **update**"
- "...or October window expected. **De**"

All three fail at the same length, which means something is hard-slicing the
text rather than an author writing to a limit. In a search result this reads as
a broken site.

**Fix:** find the slice and make it cut on a word boundary with an ellipsis, or
write these three descriptions to fit. Your checklist warns above 160 but does
not catch a mid-word cut.

### I2 — Title tags are mostly too long

Seven of eleven exceed 60 characters, so Google truncates them. The cause is
systematic: every title appends **" — CineTonight"**, which spends 14 characters
of your 60 on a brand name that already appears in the URL.

| Post | Chars |
| --- | --- |
| what-to-watch-this-weekend | 69 |
| what-to-watch-before-avengers-doomsday | 67 |
| michael-ott-release-date | 67 |
| avengers-doomsday-release-date-india | 65 |
| jana-nayagan-ott-release-date | 65 |
| best-date-night-movies | 64 |
| spider-man-brand-new-day-ott | 63 |

**Fix:** shorten the suffix to " | CineTonight", or drop it on titles already at
the limit. Google often rewrites the brand suffix anyway.

### I3 — Time-decay is unmanaged

| Post | Problem | When it breaks |
| --- | --- | --- |
| what-to-watch-this-weekend | Dated slug, title and body | **Today** |
| cocktail-2 | Hard-coded "tonight is the night" | Already wrong |
| jana-nayagan | "date not announced", month is August | Within days |
| michael | "streams August 29" written as future | 29 Aug |
| spider-man | Predicts a "late Sept to Oct" window | On the real date |
| avengers-doomsday-india | "advance tickets have opened" | December |

Several of these also make promises you have not kept: *"This page updates as
soon as it is confirmed"*, *"we keep this page updated"*, *"This page is your
single tracker"*. Jana Nayagan still says "not announced" nine days on.

An unkept freshness promise is worse than no promise. Either commit to updating
them or take the sentence out.

**Also:** Cocktail 2 is dated 16 August but opens with an "Update:" about a 14
August premiere — the update predates the post.

### I4 — Almost no contextual internal linking

Posts #3 through #10 have **zero** in-body links. The only internal links are
the automatic "Read next" cards.

Post #2 is the clearest waste: 2,850 words covering ten specific titles, and
only two of those ten link to a CineTonight page. Eight titles named, eight
chances to send a reader deeper into your site, taken twice.

Post #3 covers Dune 3 in 2,100 words and never links to your own Dune page.

This matters more than usual for you, because your movie pages cannot rank on
their own (see the strategy note below). Internal links from articles are how
those pages get any authority at all.

### I5 — The two Avengers posts overlap

`what-to-watch-before-avengers-doomsday` and `avengers-doomsday-release-date-india`
both cover the December 18 date, the Robert Downey Jr Doctor Doom casting, and
the X-Men question — and both answer the X-Men question in their FAQ.

Not as severe as C1, since the primary intents differ ("what to watch first" vs
"when does it release"). But keep each one in its lane: the release-date post
should own dates and casting; the essentials post should own the watch order.

---

## Patterns worth fixing once

**Every post is bylined "Editorial Desk".** For a site whose whole proposition
is trustworthy recommendations, an anonymous byline is a weak signal. A real
name with a one-line bio is a genuine E-E-A-T improvement and costs nothing.

**The same opening appears in at least three posts** — some variant of "you open
a streaming app, scroll for twenty minutes, watch three trailers, and end up
watching nothing." It was good the first time. Repeated, it reads as a template,
and repetition of a distinctive phrase across a site is one of the easier
patterns to spot.

**The same product pitch closes three posts**, in the same shape each time.

**Image hosting is split** — some posts use Supabase, some hotlink TMDB. Worth
standardising when you move media to R2.

**Post #5 uses the wrong image.** Its file is named
`Avengers-Doomsday-Release-Date-Doctor-Doom-Confirmed-Cast-Everything.webp`,
which describes post #6.

**Blog index ordering is off.** Cocktail 2 (16 Aug) is listed below two posts
from 14 Aug, so the index and the RSS feed disagree about order.

---

## What to do, in order

**Today, roughly an hour:**

1. **Merge the duplicate.** Retire post #11, redirect it to post #1. One
   redirect rule, and it removes a page that is actively competing with your
   best article.
2. **Fix the broken link** in `best-date-night-movies`.
3. **Rewrite the three truncated meta descriptions** so they end in a word.

**This week:**

4. **Add headings to posts #5–#10.** Post #5 needs ten of them and they are
   already implied by the content. This is the single highest ratio of benefit
   to effort in the whole audit.
5. **Merge or thicken the three thin OTT posts.** Two options, and the second is
   better: either expand each past 600 words with genuinely different content,
   or fold them into one maintained page — *"New on OTT in India"* — that is
   updated rather than replaced. That page could actually rank; three
   200-word clones cannot.
6. **Add in-body links.** Every film named in posts #2, #3 and #4 should link to
   its CineTonight page. Roughly thirty links, mechanical work, and it is what
   gives your movie pages any authority at all.

**Ongoing:**

7. **Decide the freshness promises.** Either update those pages or delete the
   sentences claiming you will.
8. **Shorten the title suffix** so titles stop being truncated.
9. **Give posts a real byline.**

---

## Two things this audit changes about how you publish

**The publish checklist has a hole.** It counts an FAQ heading as proof of
structure, so six posts with no article headings passed. Worth adding a check:
at least two H2s that are not the FAQ, not "Read next", and not "Comments".

**Length passed but substance did not.** Three posts scored close to the limit
while being the same page three times. No automated check catches that. It needs
the question asked out loud before publishing: *is there anything in this post
that is not in the other two?*

---

*Audit method: every URL fetched live and inspected for headings, meta,
word count, links, FAQ, schema and image host. No post was judged from its
title.*
