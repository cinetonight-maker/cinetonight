# CineTonight Admin Dashboard — What Changed, and How to Test It

**Date:** 21 August 2026
**Status:** LOCAL ONLY. Nothing has been deployed. `enableCacheInterception`
is still `false`. Existing Phase 1 R2/OpenNext cache architecture is preserved;
a filtered CMS-only D1 tag invalidation layer was added on 21 Aug 2026 so that
Publish/Update refreshes the live page immediately — see
docs/CMS-REVALIDATION.md and docs/CMS-CACHE-LAYER-AUDIT.md.

This is the review-and-test guide for Stages 1–4 of the CMS update plus the
visual pass. Work through it in order — later sections assume the earlier ones
are done.

---

## Part 0 — Before you start (5 minutes)

### 0.1 Run the two database updates

Supabase → **SQL Editor** → paste each file → **Run**. Both only add columns
and one table. Neither changes a single existing value, and both are safe to
run twice.

| File | What it switches on |
| --- | --- |
| `supabase/blog_cms.sql` | Trash, version history, autosave recovery, tags, image alt text for **blog posts** |
| `supabase/pages_cms.sql` | Trash, autosave recovery, meta title/description for **pages** |

**Everything works without these.** The code checks for the missing columns and
quietly skips those features rather than throwing an error. But Trash will
refuse to run until you do it — deliberately, so nothing gets hard-deleted by
accident.

### 0.2 Start the site

```
npm run dev
```

Then open `http://localhost:3000/admin` and sign in.

### 0.3 What "correct" looks like

Every number and every list on these screens is read from your database. If
something is genuinely unknown it shows **—**, not a plausible-looking figure.
So if a number looks wrong, it is wrong, and I want to know about it.

---

## Part 1 — The shell (sidebar, top bar, search)

### 1.1 Sidebar

- [ ] Sections are grouped: **Content · Catalogue · Discovery · Media · Site · System**
- [ ] The page you are on is a **solid purple pill**, not just tinted
- [ ] Greyed rows with a **SOON** tag are the screens not built yet — they should not be clickable
- [ ] **Collapse** at the bottom shrinks the sidebar to icons only
- [ ] Reload the page — it should still be collapsed (the choice is remembered per device)
- [ ] Expand it again

### 1.2 Top bar

- [ ] Purple icon square on the left, then the page name and a one-line description
- [ ] Your account chip on the right shows **your email name**, not "Admin"
- [ ] The small arrow next to it signs you out
- [ ] The purple **View Site** button opens cinetonight.com in a new tab

### 1.3 Search — this is new and worth testing properly

- [ ] Click the search box (or press **Ctrl + K** from anywhere in the dashboard)
- [ ] Type part of a section name, e.g. `blog` → the Blog Posts section appears
- [ ] Type part of a **post title** → the post appears, labelled "Blog post"
- [ ] Type part of a **movie title** → it appears, labelled "Movie"
- [ ] Click a result → it takes you to the screen where you can edit that thing
- [ ] Press **Escape** → the results close

### 1.4 The bell

- [ ] If you have comments waiting or posts missing an image, a purple badge appears
- [ ] If everything is clean, **there is no bell at all** — that is correct, not a bug
- [ ] Clicking it goes to the screen that needs attention

### 1.5 On a phone

Open the same address on your phone (or narrow the browser window right down).

- [ ] A hamburger button appears top-left and opens the sidebar as a drawer
- [ ] Tapping a section closes the drawer and navigates
- [ ] Tapping the dark area outside the drawer closes it
- [ ] **Nothing scrolls sideways** on any screen

---

## Part 2 — Overview (the landing screen)

### 2.1 The seven cards along the top

- [ ] Titles in catalogue, Published posts, Pages, Drafts, Free movies, Media files, Site health
- [ ] Each has a coloured icon and a real number
- [ ] The green "+n this week" lines should match reality — they are counted from
      when things were created
- [ ] **Pages says "last 8 weeks" with no sparkline.** That is deliberate: the
      pages table has no created date, so there is no history to draw. I chose
      to show nothing rather than invent a line.
- [ ] **Site health** says *Healthy* when both the database and TMDB answer

### 2.2 Recent activity

- [ ] Shows the last things **you** changed — posts, pages, catalogue titles, free movies
- [ ] Each row says what happened, where, and how long ago
- [ ] Clicking a row goes to that section
- [ ] **Test it:** edit any blog post, save, come back here — it should be at the top

### 2.3 Content at a glance

- [ ] The donut adds up published + drafts + scheduled + pages
- [ ] The legend percentages match the counts
- [ ] **Top categories** lists your real categories with real post counts
- [ ] **Most used tags** will say "No tags yet" until you start tagging posts — correct for now

### 2.4 Upcoming schedule

- [ ] Lists posts you have scheduled, soonest first, with their thumbnail
- [ ] Shows the exact date and time plus "in 2 d"
- [ ] If nothing is scheduled it says so plainly

### 2.5 Quick actions and System

- [ ] All eight quick action tiles go to the right screen
- [ ] **Database** says Connected
- [ ] **TMDB API** says Responding with a real millisecond figure
- [ ] **Last catalogue sync** shows when you last ran a sync
- [ ] **Build** shows a version string (may be blank locally — that is fine, it comes from Cloudflare)

---

## Part 3 — Blog Posts (`/admin/blog`) — the big one

### 3.1 The list

- [ ] Filter chips: **All · Published · Scheduled · Drafts · Trash** with counts
- [ ] The search box filters by title, address or category
- [ ] Each row shows its true status — a scheduled post whose time has passed
      says "live", because that is what the site is actually doing

### 3.2 Writing — the editor

Click **New post**, then test each toolbar button:

- [ ] **H2 / H3 / H4** — turns the current line into a heading
- [ ] **B / I** — wraps the selected words (Ctrl+B and Ctrl+I also work)
- [ ] **• List / 1. List / ❝** — turns selected lines into a list or a quote
- [ ] **Link** — inserts `[link text](https://)`
- [ ] **Internal link** — opens a search over your whole site; type a movie name,
      click it, and the link is inserted where your cursor was
- [ ] **Image** — upload or pick from the library; it drops into the article
- [ ] **Table** — inserts a small table you can edit
- [ ] **YouTube** — inserts `@youtube(VIDEO_ID)`; replace VIDEO_ID with a real one

Then:

- [ ] **Preview tab** — shows the article formatted, exactly as readers will see it
- [ ] The footer counts words, reading time, sections, and links to other CineTonight pages
- [ ] Write fewer than two internal links → the counter turns **yellow** and says "aim for at least 2"
- [ ] Type a `#` heading → a yellow warning appears (the post title is already the H1)
- [ ] Mention a movie by name in the text → a strip appears underneath:
      **"You mention these — link them?"** — click one and it inserts the link

### 3.3 Saving, publishing, scheduling

- [ ] **Save** as a draft → message says it is a draft and not on the site
- [ ] **Publish now** → message says saved and published
- [ ] Set status to **Scheduled**, pick a date/time → message tells you when it goes live
- [ ] Try to publish with an empty article → it refuses and tells you why
- [ ] Type a category that is not in your list → it refuses and tells you where to add it
- [ ] **The error always appears right above the Save button.** This was the old
      bug where Save looked dead: the message was being hidden.

### 3.4 Preview vs the live site — read this bit

- [ ] Save a change to a published post
- [ ] Click **Preview** → the change is there **immediately**
- [ ] Click **View on site** → the change may take a few minutes to appear

That difference is expected and correct. The public page is cached for speed
(that is what keeps the site fast and cheap). Preview reads the database
directly with no caching, so it is the honest answer to *"did my save work?"*
You decided to leave the caching alone, so this is the arrangement.

### 3.5 Autosave — and proof it cannot publish anything

- [ ] Open a **published** post, change the text, wait ~20 seconds
- [ ] The header shows "Saving draft…" then "Draft autosaved"
- [ ] **Now check the live post — it is unchanged.** Autosave writes to a separate
      draft field; the live page reads a different one. It is physically unable
      to alter a published article.
- [ ] Close the editor **without saving** → you get a warning about unsaved changes
- [ ] Reopen the same post → it offers **"Load the draft"** or **"Discard it"**
- [ ] Load it → your text comes back
- [ ] Discard it on a second try → the offer goes away

### 3.6 Trash

- [ ] Click ✕ on a post → confirmation says it comes off the site and can be put back
- [ ] Check the **Trash** chip → the post is there
- [ ] Check the live site → the post is gone **straight away**
- [ ] **Put back** → it returns as a draft (publish it again when ready)
- [ ] **Delete forever** → asks a second time, then really deletes

### 3.7 Version history

- [ ] Edit a **published** post and save
- [ ] Click **History** in the editor header
- [ ] A version from before your change is listed
- [ ] **Restore** it → your text reverts
- [ ] Open History again → the version you just replaced is *also* saved,
      so the restore is itself undoable

### 3.8 SEO

- [ ] Meta title and description have live character counts
- [ ] The **Google preview** underneath updates as you type
- [ ] Leave them blank → the preview falls back to the title and excerpt, which
      is exactly what the live page does

---

## Part 4 — Pages (`/admin/pages`)

Same editor, same Trash, same autosave. Test the parts that are page-specific:

- [ ] Pages and Trash chips at the top
- [ ] Each published page shows how many links point at it, or "nothing links here"
- [ ] Meta title / description with the Google preview (these pages had **no**
      description at all before, so Google was inventing its own snippet)
- [ ] **Preview** shows the true current version; **View on site** may lag a few minutes

### 4.1 The address warning — please test this one

- [ ] Open a **published** page and change its address (slug)
- [ ] A yellow warning appears as you type
- [ ] Click Save → a confirmation explains that every existing link to the old
      address will break
- [ ] **Cancel it** unless you actually mean it
- [ ] Try setting the address to `blog` or `movies` → refused, with the reason
      (a page there could never appear, because a real section owns that address)
- [ ] Try an address another page already uses → refused

---

## Part 5 — Internal Links (`/admin/links`) — new screen

This reads every article and page you have and checks the links inside them.

- [ ] Six cards at the top: pages checked, internal links, broken links,
      orphans, dead ends, external links
- [ ] **Broken links** — links pointing at pages that do not exist. Each shows
      the post it is in and a **Fix** button. Expect it to find real problems.
- [ ] **Nothing links to these** — live pages no other page points at. Google
      finds these last, so they rank slower.
- [ ] **Dead ends** — live pages with fewer than two links out. A reader who
      finishes one has nowhere to go.
- [ ] **Not checked** — links to actor pages, channels and TMDB-only titles.
      Those are built on demand so there is no list to check them against.
      They are shown, not guessed at.
- [ ] **Most linked-to pages** — where your own links point most often
- [ ] **Re-check** button re-runs it

**A good end-to-end test:** trash a post that another post links to, then come
back here — the link should now be listed as broken.

---

## Part 6 — The public site (what readers see)

- [ ] Open any blog post
- [ ] Headings, bold, lists, links and images all render properly (the old
      renderer could only do plain paragraphs and two heading levels)
- [ ] A **"Read next"** block appears under the article with three related posts
- [ ] Links to other sites open in a new tab; links to your own pages do not
- [ ] Open About / FAQ / Privacy — they still look right
- [ ] On a phone, a wide table inside an article scrolls **inside itself** —
      the whole page must never slide sideways

---

## Part 7 — Things that are deliberately not there

So you do not spend time hunting for them:

| Not there | Why |
| --- | --- |
| A Word-style rich-text editor | It stores generated HTML, which breaks on pastes from Word and makes the security model impossible. The toolbar gives the same buttons without that cost. |
| Instant publishing to the live site | Needs a caching change you asked me not to make. Preview covers it. |
| Fake charts and sample activity | Your brief said real data only. Where history cannot be computed, the card shows nothing rather than a decorative line. |
| Automatic link injection into your writing | A tool that edits your text without asking is how content gets quietly mangled. Suggestions you click are the right trade. |
| External (outbound) link checking | That means calling other people's servers on a schedule — a different job with a different cost. |

---

## Part 8 — Still to build

These show as greyed **SOON** rows in the sidebar. They work in code today but
cannot be changed from the dashboard yet.

| Stage | Screen | What it will let you do |
| --- | --- | --- |
| 5 | Homepage Manager | Control the front page without code |
| 6 | Discovery Manager | The 8 moods, 6 quick picks, Explore tabs, Tonight's Pick |
| 7 | Catalogue+ | Better title editing, bulk actions, search |
| 8 | Media Manager+ | Find and reuse images, see what is unused |
| 9 | Overview + Scheduling | One calendar of everything queued to go live |
| 10 | System Health | Full running-state screen |
| 11 | Safe Settings & Navigation | SEO defaults and menus with guardrails |
| 12 | Full regression audit | End-to-end check before any deploy |

Screens still running on the old dashboard (they work, just without Trash,
preview or history): Homepage, Movies & Series, Free Movies, Media Library,
Navigation, Sync Center, Comments, Settings.

---

## Part 9 — Checks I ran before handing this over

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` (type checking) | clean |
| `npm test` | **65 / 65 pass** (36 of them new) |
| `npx next build` | succeeds |
| `enableCacheInterception` | still `false` |
| Admin JavaScript in public page bundles | **none** — verified against the build manifest after every change |
| Cloudflare / R2 / OpenNext / middleware config | untouched |
| Layout at desktop, laptop and phone widths | checked by screenshot |

### The security fix worth knowing about

Your static pages (About, Privacy, FAQ) were putting their content onto the
live site as **raw HTML with no filtering at all**. The audit flagged it as a
genuine hole if the admin login were ever compromised.

Everything now goes through one renderer that escapes every `<` **before**
parsing, so the only HTML that can reach a page is HTML the Markdown parser
itself built. A `<script>` pasted into a post is displayed as text, not run.
Link and image addresses are checked against an allow-list. Thirteen tests
cover exactly those attacks.

---

## How to report anything you find

Tell me the screen, what you did, what you expected, and what happened. If it
is a number that looks wrong, say what you think it should be — the figures all
come from one place, so a wrong number is usually one fixable query.

*Nothing in this update has been deployed. When you are happy, Stage 12 is a
full regression audit before we go anywhere near production.*
