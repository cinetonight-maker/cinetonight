# CineTonight content rules

**Written 23 August 2026.** Hand this to anyone, human or AI, who edits or
writes content for this site. Every rule below exists because breaking it
caused a real problem, most of them within the last two days.

---

## The five that will bite you

### 1. NEVER put an H1 in the post body

`app/blog/[slug]/page.tsx` already renders the post title as the page's `<h1>`.
A `# Title` line in the markdown produces a **second** H1, and because both come
from the same title, the heading appears **visibly twice** on the live page.

**Articles start at `## `.** The publish checklist now enforces this. It used to
demand the opposite, which is how four live posts ended up showing their title
twice.

### 2. A database write does NOT update the live page

`node scripts/import-post.mjs <slug>` writes to Supabase. It does **not** clear
the page cache.

**After every import, open the post in `/admin` and press Publish.** Change
nothing else. That is the only action that fires the cache purge. Skip it and
the live page keeps the old copy for up to 30 minutes.

### 3. `meta_title` has 46 characters, not 60

The site appends `" — CineTonight"` to every title, which is 14 characters.

- `meta_title` at 46 characters → 60 total, the limit
- `meta_title` at 60 characters → 74 total, truncated in Google

The `title` field is the H1 and can be longer. Only `meta_title` is constrained.

### 4. Never write an internal link you have not verified

Check every `/path` against the live sitemap before using it:

```
curl -s https://cinetonight.com/sitemap.xml
```

**Do not guess movie URLs.** The curated catalogue is small and most films are
not on this site. A guessed TMDB id is either a 404 or, worse, a link to the
wrong film.

Known-good destinations: `/`, `/movies`, `/tv-shows`, `/web-series`,
`/trending`, `/latest`, `/genres`, `/discover`, `/free-movies`, `/blog`,
`/channel/*` (15 of them), `/movies?genre=` for Action, Adventure, Drama,
Mystery and Sci-Fi only, and any `/blog/<slug>` that exists.

`/my-list` is a real page but is deliberately not in the sitemap.

**Homepage anchors that work:** `/#tonights-pick` and `/#choose-your-mood`. Both
are server-rendered. No other heading on the site has an id, so no other
fragment link will work.

### 5. Raw HTML does not render

`lib/markdown.ts` escapes every `<` before parsing, by design. An `<a id="x">`
anchor or any other HTML tag prints as **visible text** on the page.

Markdown tables **do** work and are styled. Use those.

---

## House style

- **No em dashes or en dashes.** Use commas, colons or full stops. This is a
  standing preference and it is checked.
- **Straight apostrophes**, not curly.
- **British-leaning spelling** is used throughout, but consistency matters more
  than which variant.
- **Label your certainty.** Confirmed means the studio or platform announced it.
  Reported means trade press. Anything else is inference and says so. This is
  the site's editorial position, not a stylistic flourish, and it is what makes
  the release-date pages trustworthy.
- **No unkept promises.** Do not write "we update this page weekly" unless
  someone actually will.

---

## The publish checklist

Shown in the blog editor. 18 checks. Aim for 18/0/0.

The three added on 23 August, each because something got through:

| Check | Why it exists |
| --- | --- |
| **Article sections** | Six posts had *no* headings except an FAQ, and passed the old structure check |
| **Meta description ends cleanly** | Three descriptions were sliced mid-word at 158 characters |
| **No competing post** | Two posts ended up with an identical title, splitting the same keyword |

A warning is not always wrong. "Focus keyword in the URL" warns on any live post
whose slug predates its keyword, and the correct response is usually to ignore
it. Renaming a live URL is worse.

---

## Editing workflow

```
node scripts/export-posts.mjs          # dumps every post to content/posts/
# edit the markdown
node scripts/import-post.mjs <slug>    # writes it back
# then press Publish in /admin
```

`export-posts.mjs` is read-only and refuses to overwrite un-imported edits
without `--force`. `import-post.mjs` will not rename a slug, deliberately.

`content/posts/` is committed to git, so every content change has a diff.

---

## Redirects

- Created **disabled**. You must switch them on afterwards in `/admin` →
  Redirects. This is deliberate: a rule that went live instantly could take a
  real page off the site.
- Created as **307 temporary**. Verify the destination, then use **Make
  permanent** to promote to 308. Also deliberate: permanent redirects are cached
  by browsers and are hard to undo.
- A redirect only fires for a URL that would otherwise 404. Adding one while a
  real page still lives at that address does nothing, which makes it safe to add
  the rule before unpublishing the post.
- **Do not rename a live slug** without adding the redirect first.

---

## Deploy

```
npx opennextjs-cloudflare build
node scripts/predeploy-check.mjs      # must print 4/4
npx opennextjs-cloudflare deploy
```

**Never skip the build.** `predeploy-check.mjs` exists because a stale build
shipped once and the failure was invisible.

`enableCacheInterception` must stay `false` in `open-next.config.ts`. It is the
fix for a production request loop. Do not re-enable it.

**Deploy warnings that are safe to ignore**, and appear every time: the
Durable Object "class not exported" warning (it is exported, wrangler cannot
follow the re-export), the Windows/WSL advisory, and the `middleware` to `proxy`
deprecation notice.

---

## Things that are silently broken if disturbed

- **The `revalidations` table in D1.** If the D1 database is ever recreated, run
  `d1/tag-cache-init.sql` again or publishing silently stops working with no
  error anywhere. See `docs/D1-TAG-CACHE-BUG.md`.
- **`loading.tsx` on a route that calls `redirectOrNotFound`.** Adding one turns
  a real 404 or redirect back into a 200. See `docs/SEO-PHASE-4B-1.md`.
- **Per-path database queries.** Never query Supabase with a request path in the
  query. Every unique fetch URL is a new cache object, and the path space is
  unbounded.
