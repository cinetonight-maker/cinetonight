# 13 — Workflow and working rules

How the owner expects Claude to work on this project. Established over the
25-26 August session and from the project's own documentation.

## The process, stated by the owner

```
Evidence → Diagnosis → Approved change → Implementation
        → Build → Predeploy check → Deploy → Measure
```

**No speculative SEO changes.** Do not change something because a competitor
does it differently.

## Core rules

**Inspect before changing.** Read the actual code. This codebase carries dense
comments explaining *why* things are the way they are, and most surprising
choices turn out to be deliberate fixes for real incidents.

**Never assume something is broken without evidence.** Three separate times in
one session a "bug" turned out to be a stale cache, a wrong test fixture, or a
misread of which sort was active. Check the live URL with a cache-busting query
string before declaring a page broken.

**Do not overwrite working systems.** Prefer surgical edits over rewrites.
`scripts/fix-page-h1.mjs` is the model: it strips one leading H1 and touches
nothing else, so it is safe on content nobody has reviewed.

**Preserve existing functionality.** Especially the cost fixes. Every
force-dynamic route, every cap and every TTL exists because of a measured
incident.

**Verify Cloudflare cost impact.** Before adding any fetch to a cached route,
ask what TTL it carries — Next takes the shortest TTL in a segment, so one
careless fetch can triple regeneration frequency across 24,000 pages.

**Protect Google SEO.** Do not touch robots.txt, sitemap, canonicals or the
movie template without a clear reason and approval.

**Check internal linking.** Never invent a URL or a movie ID.

**Separate production from local.** Assume nothing about what is live. Commit
dates lag deploy dates here.

**Test before deployment.** `npm test` covers pure `lib/` functions only — a
broken import in a component is invisible to it. **`tsc` is the only thing that
catches that class of error.** Run both.

**Ask only when genuinely necessary,** and keep questions short. The owner has
asked repeatedly for **simple, short answers**. Long explanations are unwelcome
unless the topic genuinely needs them.

## Communication preferences, stated explicitly

- "always tell me in simple wording and in short"
- "if the thing needs long, just tell me that" — flag it, then ask
- "don't waste tokens on unnecessary things" — he objected to being given both
  a `.docx` and a `.pdf` when one would do. **Ask which format before producing
  deliverables.**
- He does not want documentation for its own sake. He asked to "just remember"
  rather than maintain a state doc.

## Own mistakes plainly

Several were made and corrected in one session: an audit that reported stale
cache as broken pages; a "months old" claim that was eleven days; a server-only
import that would have failed the build; an import inserted into the middle of
a multi-line import block; a test fixture that was too short to test what it
claimed. **Each was flagged directly rather than quietly fixed.** Continue that.

## Environment realities

- The device bridge **cannot delete files**. `rm` fails with "Operation not
  permitted". Ask the owner to delete, or move the file aside.
- `git status` leaves a stranded `.git/index.lock` because git cannot remove it.
  **Prefer `git --no-optional-locks status`, `git log`, `git show`, `git grep`.**
- Supabase and cinetonight.com are **not reachable** from the assistant's
  sandbox. Scripts that touch them must be run by the owner.
- `npx tsc --noEmit` must be run by the owner (Windows-only TypeScript binary).
- WebFetch respects robots.txt, so `/search` and `/api/*` cannot be fetched.

## Content rules

`docs/CONTENT-RULES.md` is authoritative. Summary in `06_CONTENT_AND_EDITORIAL_STRATEGY.md`.

## Honesty rules that matter here

Do not manufacture confidence. When the owner proposed always pinning Amazon
Prime to the top of every title regardless of real availability, the correct
response was to refuse and explain the commercial and SEO cost — and the
codebase turned out to have rejected the same idea earlier for the same reasons.
**Push back with reasons when a request would damage the project.**
