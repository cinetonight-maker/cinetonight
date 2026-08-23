"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import MarkdownEditor from "./MarkdownEditor";
import { api, ImagePicker, effectiveBlogStatus, cacheNote, type Revalidated } from "./shared";
import { seoChecklist, checklistSummary } from "@/lib/blogSeo";
import { offerRedirect } from "./offerRedirect";
import { markdownToText, readingTime } from "@/lib/markdown";
import type { LinkTarget } from "@/lib/linkGraph";

/* ============================================================================
 * /admin/blog — the writing screen.
 *
 * What changed from the old tab, and why:
 *  · Body is Markdown in a real editor, not a "one paragraph per blank line"
 *    textarea, so headings/lists/links/images/tables are all reachable.
 *  · Autosave every 20s while typing — into `draft_body`, NEVER into the live
 *    `body`. Publishing is always an explicit click.
 *  · Delete goes to Trash and can be undone; permanent delete is separate.
 *  · Version history: every published change is snapshotted and restorable.
 *  · Save errors are shown next to the Save button (the old screen hid them,
 *    which is what made Save look broken).
 * ========================================================================= */

type BlogRow = {
  id: string; slug: string; title: string; cat: string; excerpt: string;
  body: string | string[] | null;
  image_url: string | null; image_alt?: string | null; tags?: string[] | null;
  date_label: string; read_label: string;
  status: "draft" | "published" | "scheduled";
  meta_title: string; meta_description: string; publish_at: string | null;
  focus_keyword?: string | null; secondary_keywords?: string[] | null;
  canonical_url?: string | null; og_image?: string | null; noindex?: boolean | null;
  draft_body?: string | null; draft_saved_at?: string | null;
  deleted_at?: string | null; updated_at?: string | null;
};
type CategoryRow = { id: string; name: string };
type Revision = { id: string; title: string; excerpt: string; status: string; note: string; author: string | null; created_at: string };

type Draft = {
  slug: string; title: string; cat: string; excerpt: string; body: string;
  image_url: string | null; image_alt: string; tags: string;
  date_label: string; read_label: string;
  status: BlogRow["status"]; meta_title: string; meta_description: string; publish_at: string | null;
  focus_keyword: string; secondary_keywords: string; canonical_url: string; og_image: string; noindex: boolean;
};

const todayLabel = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const EMPTY: Draft = {
  slug: "", title: "", cat: "Guides", excerpt: "", body: "",
  image_url: null, image_alt: "", tags: "",
  date_label: todayLabel(), read_label: "5 min", status: "draft",
  meta_title: "", meta_description: "", publish_at: null,
  focus_keyword: "", secondary_keywords: "", canonical_url: "", og_image: "", noindex: false,
};

const asMarkdown = (v: string | string[] | null | undefined) =>
  Array.isArray(v) ? v.join("\n\n") : (v ?? "");

/** ISO timestamp → value for <input type="datetime-local"> (local time). */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

type Filter = "all" | "draft" | "scheduled" | "published" | "trash";

export default function BlogManager() {
  const [posts, setPosts] = useState<BlogRow[]>([]);
  const [trash, setTrash] = useState<BlogRow[]>([]);
  const [cats, setCats] = useState<CategoryRow[]>([]);
  const [links, setLinks] = useState<LinkTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [listErr, setListErr] = useState<string | null>(null);

  const [editing, setEditing] = useState<string | null>(null); // post id, or "new"
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saved, setSaved] = useState<Draft | null>(null);       // last saved state, for the dirty check
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [newCat, setNewCat] = useState("");
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [autoState, setAutoState] = useState<"idle" | "saving" | "saved" | "off">("idle");
  const [recovered, setRecovered] = useState<{ at: string; body: string } | null>(null);

  /* ------------------------------ loading ------------------------------- */
  const load = useCallback(async () => {
    setLoading(true);
    const [postsRes, trashRes, catsRes, linksRes] = await Promise.all([
      api<{ posts?: BlogRow[]; error?: string }>("/api/admin/blog"),
      api<{ posts?: BlogRow[] }>("/api/admin/blog?trash=1"),
      api<{ categories?: CategoryRow[] }>("/api/admin/categories"),
      // Everything linkable on the site — posts, pages, movies, free movies
      // and the main sections. Built once here and handed to the editor.
      api<{ targets?: LinkTarget[] }>("/api/admin/links?targets=1"),
    ]);
    if (postsRes.ok) { setPosts(postsRes.data.posts ?? []); setListErr(null); }
    else setListErr(postsRes.data.error ?? "Could not load posts.");
    if (trashRes.ok) setTrash(trashRes.data.posts ?? []);
    if (catsRes.ok) setCats(catsRes.data.categories ?? []);
    if (linksRes.ok) setLinks(linksRes.data.targets ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  /* ------------------------------ editing ------------------------------- */
  const startNew = () => {
    setErr(null); setNote(null); setRecovered(null); setRevisions(null); setShowHistory(false);
    setDraft(EMPTY); setSaved(EMPTY); setEditing("new"); setAutoState("idle");
  };

  const startEdit = (p: BlogRow) => {
    const d: Draft = {
      slug: p.slug, title: p.title, cat: p.cat, excerpt: p.excerpt ?? "",
      body: asMarkdown(p.body),
      image_url: p.image_url, image_alt: p.image_alt ?? "",
      tags: (p.tags ?? []).join(", "),
      date_label: p.date_label, read_label: p.read_label, status: p.status,
      meta_title: p.meta_title ?? "", meta_description: p.meta_description ?? "", publish_at: p.publish_at ?? null,
      focus_keyword: p.focus_keyword ?? "",
      secondary_keywords: (p.secondary_keywords ?? []).join(", "),
      canonical_url: p.canonical_url ?? "", og_image: p.og_image ?? "", noindex: p.noindex === true,
    };
    setErr(null); setNote(null); setRevisions(null); setShowHistory(false);
    setDraft(d); setSaved(d); setEditing(p.id); setAutoState("idle");

    // An autosaved draft that is newer than the live body means the last
    // session ended without saving. Offer it — never apply it silently.
    if (p.draft_body && p.draft_body !== asMarkdown(p.body)) {
      setRecovered({ at: p.draft_saved_at ?? "", body: p.draft_body });
    } else setRecovered(null);
  };

  const dirty = useMemo(
    () => !!saved && JSON.stringify(saved) !== JSON.stringify(draft),
    [saved, draft],
  );

  /** Titles of the other live posts. Recomputed only when the post list or the
   *  post being edited changes, not on every keystroke. */
  const siblingTitles = useMemo(
    () => posts.filter((p) => p.id !== editing).map((p) => p.title),
    [posts, editing],
  );

  /** The publish checklist — every house rule a machine can check, recomputed
   *  as you type. Pure and synchronous (lib/blogSeo.ts): no network, no cost. */
  const checks = useMemo(() => seoChecklist({
    title: draft.title,
    slug: draft.slug || slugify(draft.title),
    body: draft.body,
    excerpt: draft.excerpt,
    metaTitle: draft.meta_title,
    metaDescription: draft.meta_description,
    focusKeyword: draft.focus_keyword,
    secondaryKeywords: draft.secondary_keywords.split(",").map((k) => k.trim()).filter(Boolean),
    imageUrl: draft.image_url,
    imageAlt: draft.image_alt,
    canonicalUrl: draft.canonical_url,
    ogImage: draft.og_image,
    cat: draft.cat,
    noindex: draft.noindex,
    // Every OTHER post's title, so the checklist can warn about a duplicate
    // while it is still a draft. Excludes the post being edited, which would
    // otherwise always match itself.
    siblingTitles: siblingTitles,
  }), [draft, siblingTitles]);

  /* ---- autosave: draft_body only. Cannot touch a published article. ----- */
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    if (!editing || editing === "new" || autoState === "off" || !dirty) return;
    const t = setTimeout(async () => {
      setAutoState("saving");
      const res = await api<{ ok?: boolean; unsupported?: boolean }>("/api/admin/blog", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: editing, mode: "autosave", body: draftRef.current.body }),
      });
      if (res.data?.unsupported) setAutoState("off");
      else setAutoState(res.ok ? "saved" : "idle");
    }, 20000);
    return () => clearTimeout(t);
  }, [draft.body, editing, dirty, autoState]);

  /* ---- leaving with unsaved changes ------------------------------------- */
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const closeEditor = () => {
    if (dirty && !confirm("You have unsaved changes. Close anyway?")) return;
    setEditing(null); setErr(null); setNote(null); setRecovered(null);
  };

  /* ------------------------------ saving -------------------------------- */
  const validate = (d: Draft, publishing: boolean): string | null => {
    if (!d.title.trim()) return "Give the post a title first.";
    if (cats.length && !cats.some((c) => c.name === d.cat)) {
      return `“${d.cat}” is not one of your categories. Add it in Categories below, or pick an existing one.`;
    }
    if (d.status === "scheduled" && !d.publish_at) return "Pick the date and time this post should go live.";
    if (publishing && !markdownToText(d.body).trim()) return "The article is empty — write something before publishing.";
    return null;
  };

  const save = async (opts: { status?: BlogRow["status"] } = {}) => {
    const next: Draft = { ...draft, ...(opts.status ? { status: opts.status } : {}) };
    const publishing = next.status !== "draft";
    const problem = validate(next, publishing);
    if (problem) { setErr(problem); setNote(null); return; }

    // Captured before the write: the only moment anyone knows the old address.
    const previousSlug = editing !== "new" ? saved?.slug : undefined;

    setBusy(true); setErr(null); setNote(null);
    const payload = {
      title: next.title, slug: next.slug || slugify(next.title), cat: next.cat, excerpt: next.excerpt,
      body: next.body, imageUrl: next.image_url, imageAlt: next.image_alt,
      tags: next.tags.split(",").map((t) => t.trim()).filter(Boolean),
      date: next.date_label,
      // Reading time is derived from the article, so it can never be wrong.
      read: readingTime(next.body),
      status: next.status, metaTitle: next.meta_title, metaDescription: next.meta_description,
      publishAt: next.publish_at,
      focusKeyword: next.focus_keyword,
      secondaryKeywords: next.secondary_keywords.split(",").map((k) => k.trim()).filter(Boolean),
      canonicalUrl: next.canonical_url,
      ogImage: next.og_image,
      noindex: next.noindex,
    };
    const res = editing === "new"
      ? await api<{ post?: BlogRow; error?: string; revalidated?: Revalidated }>("/api/admin/blog", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
      : await api<{ post?: BlogRow; error?: string; revalidated?: Revalidated }>("/api/admin/blog", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: editing, ...payload }) });
    setBusy(false);

    if (!res.ok) { setErr(res.data.error ?? "Could not save the post."); return; }

    const savedRow = res.data.post;
    // A changed slug means every existing link to this post is now broken.
    // Offer the redirect here, while the old address is still known.
    if (previousSlug && savedRow?.slug && previousSlug !== savedRow.slug) {
      const outcome = await offerRedirect(`/blog/${previousSlug}`, `/blog/${savedRow.slug}`, next.title);
      if (outcome) setNote(outcome);
    }
    const savedDraft: Draft = { ...next, read_label: payload.read, slug: savedRow?.slug ?? payload.slug };
    setDraft(savedDraft); setSaved(savedDraft);
    if (savedRow?.id) setEditing(savedRow.id);
    setRecovered(null); setAutoState("idle");
    // The write is already confirmed. Cache clearing is reported SEPARATELY
    // and can never turn a successful publish into a failure.
    const cache = cacheNote(res.data.revalidated ?? null);
    setNote(
      next.status === "published" ? `Saved and published.${cache}`
      : next.status === "scheduled" ? `Saved. It goes live on ${new Date(next.publish_at!).toLocaleString()}.`
      : "Saved as a draft — it is not on the site.",
    );
    load();
  };

  /* ------------------------------ trash --------------------------------- */
  const toTrash = async (p: BlogRow) => {
    if (!confirm(`Move “${p.title}” to Trash? It comes off the site straight away, and you can put it back.`)) return;
    const res = await api<{ error?: string }>(`/api/admin/blog?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
    if (!res.ok) { setListErr(res.data.error ?? "Could not move that post to Trash."); return; }
    if (editing === p.id) setEditing(null);
    load();
  };
  const restore = async (p: BlogRow) => {
    const res = await api<{ error?: string }>("/api/admin/blog", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: p.id, action: "restore" }),
    });
    if (!res.ok) setListErr(res.data.error ?? "Could not restore that post.");
    else setListErr(null);
    load();
  };
  const destroy = async (p: BlogRow) => {
    if (!confirm(`Delete “${p.title}” permanently? This cannot be undone.`)) return;
    await api(`/api/admin/blog?id=${encodeURIComponent(p.id)}&permanent=1`, { method: "DELETE" });
    load();
  };

  /* ---------------------------- revisions ------------------------------- */
  const openHistory = async () => {
    setShowHistory((v) => !v);
    if (revisions || !editing || editing === "new") return;
    const res = await api<{ revisions?: Revision[] }>(`/api/admin/blog/revisions?postId=${encodeURIComponent(editing)}`);
    setRevisions(res.data.revisions ?? []);
  };
  const restoreRevision = async (r: Revision) => {
    if (!editing || editing === "new") return;
    if (!confirm(`Restore the version from ${new Date(r.created_at).toLocaleString()}? The current text is saved to history first, so this is reversible.`)) return;
    const res = await api<{ post?: BlogRow; error?: string }>("/api/admin/blog/revisions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ postId: editing, revisionId: r.id }),
    });
    if (!res.ok) { setErr(res.data.error ?? "Could not restore that version."); return; }
    if (res.data.post) startEdit(res.data.post);
    setRevisions(null); setShowHistory(false); setNote("Restored. Nothing was lost — the previous text is in history.");
    load();
  };

  /* --------------------------- categories ------------------------------- */
  const addCat = async () => {
    const name = newCat.trim();
    if (!name) return;
    const res = await api("/api/admin/categories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    if (res.ok) { setNewCat(""); load(); }
  };
  const removeCat = async (c: CategoryRow) => {
    if (!confirm(`Delete category “${c.name}”? Existing posts keep their label.`)) return;
    await api(`/api/admin/categories?id=${encodeURIComponent(c.id)}`, { method: "DELETE" });
    load();
  };

  /* ------------------------------ derived ------------------------------- */
  const visible = useMemo(() => {
    const source = filter === "trash" ? trash : posts;
    const needle = q.trim().toLowerCase();
    return source.filter((p) => {
      if (filter !== "all" && filter !== "trash" && p.status !== filter) return false;
      if (!needle) return true;
      return p.title.toLowerCase().includes(needle) || p.slug.toLowerCase().includes(needle) || (p.cat ?? "").toLowerCase().includes(needle);
    });
  }, [posts, trash, filter, q]);

  const counts = useMemo(() => ({
    all: posts.length,
    draft: posts.filter((p) => p.status === "draft").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    published: posts.filter((p) => p.status === "published").length,
    trash: trash.length,
  }), [posts, trash]);

  const FILTERS: [Filter, string][] = [
    ["all", "All"], ["published", "Published"], ["scheduled", "Scheduled"], ["draft", "Drafts"], ["trash", "Trash"],
  ];

  /* ------------------------------- render -------------------------------- */
  return (
    <div className="ad__body ad__body--one">
      {listErr && <div className="ad__err">{listErr}</div>}

      {editing !== null && (
        <section className="ad__panel">
          <div className="ad__panelhead">
            <h2>{editing === "new" ? "New post" : "Edit post"}</h2>
            <div className="ad__headright">
              {autoState === "saving" && <span className="ad__meta">Saving draft…</span>}
              {autoState === "saved" && <span className="ad__meta">Draft autosaved</span>}
              {dirty && autoState !== "saving" && <span className="ad__meta ad__meta--warn">Unsaved changes</span>}
              {editing !== "new" && <button className="ad__mini" onClick={openHistory}>{showHistory ? "Hide history" : "History"}</button>}
              <button className="ad__mini" onClick={closeEditor}>Close</button>
            </div>
          </div>

          {recovered && (
            <div className="ad__notice">
              <div>
                A newer autosaved draft exists{recovered.at ? ` from ${new Date(recovered.at).toLocaleString()}` : ""}.
                It has not been published — you can load it or throw it away.
              </div>
              <div className="ad__actions">
                <button className="ad__mini" onClick={() => { setDraft((d) => ({ ...d, body: recovered.body })); setRecovered(null); }}>Load the draft</button>
                <button className="ad__mini" onClick={async () => {
                  await api("/api/admin/blog", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: editing, action: "discardDraft" }) });
                  setRecovered(null);
                }}>Discard it</button>
              </div>
            </div>
          )}

          {showHistory && (
            <div className="ad__card">
              <h3 className="ad__h3">Version history</h3>
              {!revisions && <div className="empty">Loading…</div>}
              {revisions && !revisions.length && <div className="ad__empty">No saved versions yet. One is kept every time you update a published post.</div>}
              {revisions?.map((r) => (
                <div className="ad__row" key={r.id}>
                  <span className="ad__cat">{r.note}</span>
                  <span className="ad__name">{r.title}</span>
                  <span className="ad__meta">{new Date(r.created_at).toLocaleString()}</span>
                  <button className="ad__mini" onClick={() => restoreRevision(r)}>Restore</button>
                </div>
              ))}
            </div>
          )}

          <div className="ad__card ad__card--edit">
            <label className="ad__field"><span>Featured image — 1200 × 675 (16:9) looks right everywhere</span></label>
            <ImagePicker url={draft.image_url} label="Upload image" onChange={(url) => setDraft({ ...draft, image_url: url || null })} />
            <label className="ad__field" style={{ marginTop: 10 }}>
              <span>Image description (alt text) — what the picture shows, in plain words</span>
              <input value={draft.image_alt} placeholder="Reacher season 4 poster with Alan Ritchson"
                onChange={(e) => setDraft({ ...draft, image_alt: e.target.value })} />
            </label>

            <div className="ad__grid2" style={{ marginTop: 14 }}>
              <label className="ad__field"><span>Title</span>
                <input value={draft.title} placeholder="Post title"
                  onChange={(e) => {
                    const title = e.target.value;
                    // Auto-fill the URL from the title, but only while it has
                    // not been published — changing a live URL breaks links.
                    setDraft((d) => ({ ...d, title, slug: editing === "new" && (!d.slug || d.slug === slugify(d.title)) ? slugify(title) : d.slug }));
                  }} /></label>
              <label className="ad__field"><span>URL (cinetonight.com/blog/…)</span>
                <input value={draft.slug} placeholder="auto from the title"
                  onChange={(e) => setDraft({ ...draft, slug: e.target.value })} /></label>
              <label className="ad__field"><span>Category</span>
                <input list="ct-blog-cats" value={draft.cat} placeholder="Guides"
                  onChange={(e) => setDraft({ ...draft, cat: e.target.value })} />
                <datalist id="ct-blog-cats">{cats.map((c) => <option key={c.id} value={c.name} />)}</datalist></label>
              <label className="ad__field"><span>Date shown on the post</span>
                <input value={draft.date_label} onChange={(e) => setDraft({ ...draft, date_label: e.target.value })} /></label>
            </div>

            <label className="ad__field"><span>Excerpt — the summary on cards and in Google</span>
              <textarea rows={2} value={draft.excerpt} onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })} /></label>

            <label className="ad__field"><span>Article</span></label>
            <MarkdownEditor
              value={draft.body}
              title={draft.title}
              // The post being edited is filtered out so it can never suggest
              // linking to itself.
              links={links.filter((l) => l.path !== `/blog/${draft.slug}`)}
              onChange={(body) => setDraft((d) => ({ ...d, body }))}
            />

            <label className="ad__field" style={{ marginTop: 14 }}>
              <span>Tags (comma separated) — used to suggest related posts</span>
              <input value={draft.tags} placeholder="reacher, amazon prime, action"
                onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
            </label>

            <div className="ad__grid2">
              <label className="ad__field">
                <span>Meta title ({draft.meta_title.length} of 60)</span>
                <input maxLength={70} value={draft.meta_title} placeholder="Defaults to the post title"
                  onChange={(e) => setDraft({ ...draft, meta_title: e.target.value })} />
              </label>
              <label className="ad__field">
                <span>Meta description ({draft.meta_description.length} of 160)</span>
                <input maxLength={170} value={draft.meta_description} placeholder="Defaults to the excerpt"
                  onChange={(e) => setDraft({ ...draft, meta_description: e.target.value })} />
              </label>
            </div>

            {/* Google preview — plain text, no network call, no tracking. */}
            <div className="ad__serp">
              <div className="ad__serpurl">cinetonight.com › blog › {draft.slug || slugify(draft.title) || "your-post"}</div>
              <div className="ad__serpt">{(draft.meta_title || draft.title || "Post title").slice(0, 60)}</div>
              <div className="ad__serpd">{(draft.meta_description || draft.excerpt || markdownToText(draft.body)).slice(0, 160) || "Your description appears here."}</div>
            </div>

            <div className="ad__grid2">
              <label className="ad__field">
                <span>Focus keyword — the one phrase this article should rank for</span>
                <input value={draft.focus_keyword} placeholder="can't decide what to watch tonight"
                  onChange={(e) => setDraft({ ...draft, focus_keyword: e.target.value })} />
              </label>
              <label className="ad__field">
                <span>Secondary keywords (comma separated) — supporting phrases</span>
                <input value={draft.secondary_keywords} placeholder="movies to watch tonight, movies based on mood"
                  onChange={(e) => setDraft({ ...draft, secondary_keywords: e.target.value })} />
              </label>
            </div>

            {/* THE PUBLISH CHECKLIST. Every house rule a machine can check,
                checked here rather than left to memory. Warnings never block
                a save — a checklist that refuses to publish is one people
                learn to route around. */}
            <div className="ad__notice" style={{ marginTop: 4 }}>
              <b>Publish checklist — {checklistSummary(checks)}</b>
              <div className="ad__list" style={{ marginTop: 8 }}>
                {checks.map((c) => (
                  <div className="ad__row" key={c.id} style={{ alignItems: "flex-start" }}>
                    <span className={`ad__cat${c.status === "fail" ? " ad__cat--bad" : ""}`}>
                      {c.status === "ok" ? "ok" : c.status === "warn" ? "check" : "fix"}
                    </span>
                    <span className="ad__name" style={{ flex: 1 }}>
                      {c.label}
                      {c.hint && <em style={{ display: "block", opacity: 0.75, fontStyle: "normal", fontSize: 12, marginTop: 2 }}>{c.hint}</em>}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <details className="ad__panel" style={{ marginTop: 4, padding: 12 }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Advanced SEO — you rarely need these</summary>
              <div className="ad__grid2" style={{ marginTop: 12 }}>
                <label className="ad__field">
                  <span>Social share image — falls back to the featured image</span>
                  <input value={draft.og_image} placeholder="https://…  (1200 × 630 works best)"
                    onChange={(e) => setDraft({ ...draft, og_image: e.target.value })} />
                </label>
                <label className="ad__field">
                  <span>Canonical URL — leave blank unless this is a copy of an article published elsewhere</span>
                  <input value={draft.canonical_url} placeholder="Blank = this article is the original"
                    onChange={(e) => setDraft({ ...draft, canonical_url: e.target.value })} />
                </label>
              </div>
              <label className="ad__field" style={{ maxWidth: 360 }}>
                <span>Search engines</span>
                <select value={draft.noindex ? "no" : "yes"}
                  onChange={(e) => {
                    const hide = e.target.value === "no";
                    if (hide && !confirm("Hide this article from Google?\n\nIt stays readable to anyone with the link, but it will not appear in search results at all.")) return;
                    setDraft({ ...draft, noindex: hide });
                  }}>
                  <option value="yes">Allow — the article can appear in search results</option>
                  <option value="no">Hide — noindex, keep it out of search results</option>
                </select>
              </label>
              <p className="ad__hintline">
                A canonical pointing at another address tells Google the real version lives there, so this article
                usually stops ranking on its own. Both of these need <code>supabase/blog_seo.sql</code> to have been
                run; until then the values are simply not saved and everything else works as normal.
              </p>
            </details>

            <div className="ad__grid2">
              <label className="ad__field">
                <span>Status</span>
                <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as BlogRow["status"] })}>
                  <option value="draft">Draft — only you can see it</option>
                  <option value="published">Published — live now</option>
                  <option value="scheduled">Scheduled — goes live by itself</option>
                </select>
              </label>
              {draft.status === "scheduled" && (
                <label className="ad__field">
                  <span>Goes live at (your local time)</span>
                  <input type="datetime-local" value={toLocalInput(draft.publish_at)}
                    onChange={(e) => setDraft({ ...draft, publish_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </label>
              )}
            </div>

            {err && <div className="ad__err" style={{ marginTop: 10 }}>{err}</div>}
            {note && !err && <div className="ad__ok" style={{ marginTop: 10 }}>{note}</div>}

            <div className="ad__actions">
              <button className="ad__btn ad__btn--primary" disabled={busy} onClick={() => save()}>
                <Icon name="check" size={14} /> {busy ? "Saving…" : draft.status === "published" ? "Save & publish" : "Save"}
              </button>
              {draft.status !== "published" && (
                <button className="ad__btn" disabled={busy} onClick={() => save({ status: "published" })}>Publish now</button>
              )}
              {draft.status === "published" && (
                <button className="ad__btn" disabled={busy} onClick={() => save({ status: "draft" })}>Unpublish</button>
              )}
              {editing !== "new" && draft.slug && (
                <>
                  {/* Preview reads straight from the database, so it is never
                      stale — this is the honest answer to "did my save work?" */}
                  <a className="ad__btn" href={`/admin/preview/blog/${draft.slug}`} target="_blank" rel="noreferrer">Preview</a>
                  <a className="ad__btn" href={`/blog/${draft.slug}`} target="_blank" rel="noreferrer">View on site</a>
                </>
              )}
              <button className="ad__btn" onClick={closeEditor}>Cancel</button>
            </div>
            <p className="ad__hintline">
              Your save is stored the instant the button confirms it. The public page is cached for speed, so it can
              take a few minutes to catch up — use <b>Preview</b> to see the true, current version straight away.
            </p>
          </div>
        </section>
      )}

      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Blog posts <span className="ad__count">{counts.all}</span></h2>
          <button className="ad__btn" onClick={startNew}><Icon name="plus" size={14} /> New post</button>
        </div>

        <div className="ad__filters">
          {FILTERS.map(([f, label]) => (
            <button key={f} type="button" className={`ad__chip${filter === f ? " on" : ""}`} onClick={() => setFilter(f)}>
              {label} <em>{counts[f]}</em>
            </button>
          ))}
          <input className="ad__search" value={q} placeholder="Search posts…" onChange={(e) => setQ(e.target.value)} />
        </div>

        {loading ? <div className="empty">Loading…</div> : (
          <div className="ad__list">
            {visible.map((p) => (
              <div className="ad__row" key={p.id}>
                {p.image_url && <img className="ad__thumb" alt="" src={p.image_url} style={{ width: 46, height: 32 }} />}
                <span className="ad__cat">{filter === "trash" ? "in trash" : effectiveBlogStatus(p)}</span>
                <span className="ad__name">{p.title}</span>
                <span className="ad__meta">{p.date_label} · {p.read_label}</span>
                {filter === "trash" ? (
                  <>
                    <button className="ad__mini" onClick={() => restore(p)}>Put back</button>
                    <button className="ad__mini ad__mini--x" onClick={() => destroy(p)}>Delete forever</button>
                  </>
                ) : (
                  <>
                    <button className="ad__mini" onClick={() => startEdit(p)}>Edit</button>
                    <button className="ad__mini ad__mini--x" onClick={() => toTrash(p)}>✕</button>
                  </>
                )}
              </div>
            ))}
            {!visible.length && (
              <div className="ad__empty">
                {filter === "trash" ? "Trash is empty." : q ? "Nothing matches that search." : "No posts here yet."}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="ad__panel">
        <div className="ad__panelhead"><h2>Categories <span className="ad__count">{cats.length}</span></h2></div>
        <div className="ad__list">
          {cats.map((c) => (
            <div className="ad__row" key={c.id}>
              <span className="ad__name">{c.name}</span>
              <span className="ad__meta">{posts.filter((p) => p.cat === c.name).length} posts</span>
              <button className="ad__mini ad__mini--x" onClick={() => removeCat(c)}>✕</button>
            </div>
          ))}
          {!cats.length && <div className="ad__empty">No categories yet — add one below.</div>}
        </div>
        <div className="ad__actions" style={{ marginTop: 10 }}>
          <input value={newCat} placeholder="New category name" style={{ flex: 1 }}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addCat(); }} />
          <button className="ad__btn" onClick={addCat}><Icon name="plus" size={14} /> Add</button>
        </div>
      </section>
    </div>
  );
}
