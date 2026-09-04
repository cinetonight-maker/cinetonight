"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import MarkdownEditor from "./MarkdownEditor";
import { api, cacheNote, type Revalidated } from "./shared";
import { offerRedirect } from "./offerRedirect";
import { markdownToText } from "@/lib/markdown";
import { metaDescription } from "@/lib/metaDesc";
import type { LinkTarget } from "@/lib/linkGraph";

/* ============================================================================
 * /admin/pages — the static pages (About, FAQ, Privacy, Contact…).
 *
 * These are the pages Google and readers use to decide whether the site is
 * trustworthy, and they had the weakest editor on the whole dashboard: one
 * plain box, no preview, no description for search results, and delete meant
 * gone. They now use the same editor, preview and Trash as blog posts.
 *
 * The one page-specific danger is the ADDRESS. Renaming a published page's
 * slug breaks every existing link to it, on the site and anywhere else it was
 * shared. The screen warns before that happens rather than after.
 * ========================================================================= */

type PageRow = {
  id: string; slug: string; title: string; content: string;
  status: "draft" | "published";
  meta_title?: string | null; meta_description?: string | null;
  draft_content?: string | null; draft_saved_at?: string | null;
  deleted_at?: string | null; updated_at?: string | null;
};

type PageRevision = { id: string; title: string; status: string; note: string; author: string | null; created_at: string };

type Draft = {
  slug: string; title: string; content: string;
  status: "draft" | "published"; meta_title: string; meta_description: string;
};

const EMPTY: Draft = { slug: "", title: "", content: "", status: "draft", meta_title: "", meta_description: "" };

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

export default function PagesManager() {
  const [pages, setPages] = useState<PageRow[]>([]);
  const [trash, setTrash] = useState<PageRow[]>([]);
  const [links, setLinks] = useState<LinkTarget[]>([]);
  const [inbound, setInbound] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [listErr, setListErr] = useState<string | null>(null);

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saved, setSaved] = useState<Draft | null>(null);
  const [originalSlug, setOriginalSlug] = useState("");
  const [wasPublished, setWasPublished] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [autoState, setAutoState] = useState<"idle" | "saving" | "saved" | "off">("idle");
  const [recovered, setRecovered] = useState<{ at: string; content: string } | null>(null);
  const [revisions, setRevisions] = useState<PageRevision[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [live, binned, linkRes] = await Promise.all([
      api<{ pages?: PageRow[]; error?: string }>("/api/admin/pages"),
      api<{ pages?: PageRow[] }>("/api/admin/pages?trash=1"),
      api<{ targets?: LinkTarget[]; report?: { inbound?: Record<string, number> } }>("/api/admin/links"),
    ]);
    if (live.ok) { setPages(live.data.pages ?? []); setListErr(null); }
    else setListErr(live.data.error ?? "Could not load pages.");
    if (binned.ok) setTrash(binned.data.pages ?? []);
    if (linkRes.ok) {
      setLinks(linkRes.data.targets ?? []);
      setInbound(linkRes.data.report?.inbound ?? {});
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const startNew = () => {
    setErr(null); setNote(null); setRecovered(null); setRevisions(null); setShowHistory(false);
    setDraft(EMPTY); setSaved(EMPTY); setOriginalSlug(""); setWasPublished(false);
    setEditing("new"); setAutoState("idle");
  };

  const startEdit = (p: PageRow) => {
    const d: Draft = {
      slug: p.slug, title: p.title, content: p.content ?? "", status: p.status,
      meta_title: p.meta_title ?? "", meta_description: p.meta_description ?? "",
    };
    setErr(null); setNote(null); setRevisions(null); setShowHistory(false);
    setDraft(d); setSaved(d); setOriginalSlug(p.slug); setWasPublished(p.status === "published");
    setEditing(p.id); setAutoState("idle");
    setRecovered(p.draft_content && p.draft_content !== (p.content ?? "")
      ? { at: p.draft_saved_at ?? "", content: p.draft_content }
      : null);
  };

  const dirty = useMemo(() => !!saved && JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);

  /* autosave → draft_content only, never the live page */
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    if (!editing || editing === "new" || autoState === "off" || !dirty) return;
    const t = setTimeout(async () => {
      setAutoState("saving");
      const res = await api<{ ok?: boolean; unsupported?: boolean }>("/api/admin/pages", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: editing, mode: "autosave", content: draftRef.current.content }),
      });
      if (res.data?.unsupported) setAutoState("off");
      else setAutoState(res.ok ? "saved" : "idle");
    }, 20000);
    return () => clearTimeout(t);
  }, [draft.content, editing, dirty, autoState]);

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

  /** Renaming a published page's address breaks every link that points at the
   *  old one. Ask once, clearly, instead of letting it happen silently. */
  const slugChanged = editing !== "new" && wasPublished && slugify(draft.slug) !== originalSlug;

  const save = async (opts: { status?: "draft" | "published" } = {}) => {
    const next: Draft = { ...draft, ...(opts.status ? { status: opts.status } : {}) };
    if (!next.title.trim()) { setErr("Give the page a title first."); return; }
    if (next.status === "published" && !next.content.trim()) {
      setErr("The page is empty - write something before publishing it."); return;
    }
    if (slugChanged && !confirm(
      `You are changing this page's address from /${originalSlug} to /${slugify(next.slug)}.\n\n` +
      `Every existing link to /${originalSlug} will break, including links from your own posts ` +
      `and anywhere it has been shared. Check Internal Links afterwards.\n\nContinue?`,
    )) return;

    setBusy(true); setErr(null); setNote(null);
    const payload = {
      title: next.title, slug: next.slug || slugify(next.title), content: next.content,
      status: next.status, metaTitle: next.meta_title, metaDescription: next.meta_description,
    };
    const res = editing === "new"
      ? await api<{ page?: PageRow; error?: string; revalidated?: Revalidated }>("/api/admin/pages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
      : await api<{ page?: PageRow; error?: string; revalidated?: Revalidated }>("/api/admin/pages", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: editing, ...payload }) });
    setBusy(false);
    if (!res.ok) { setErr(res.data.error ?? "Could not save the page."); return; }

    const row = res.data.page;
    // The address changed, so every existing link to this page is now broken.
    // originalSlug is what it was before this save — the last moment anyone
    // knows the old address.
    if (editing !== "new" && originalSlug && row?.slug && originalSlug !== row.slug) {
      const outcome = await offerRedirect(`/${originalSlug}`, `/${row.slug}`, next.title);
      if (outcome) { setNote(outcome); }
    }
    const savedDraft: Draft = { ...next, slug: row?.slug ?? payload.slug };
    setDraft(savedDraft); setSaved(savedDraft);
    if (row?.id) setEditing(row.id);
    setOriginalSlug(savedDraft.slug); setWasPublished(savedDraft.status === "published");
    setRecovered(null); setAutoState("idle");
    // Same rule as the blog screen: the save is confirmed; cache freshness is
    // reported separately and never presented as a failure.
    const cache = cacheNote(res.data.revalidated ?? null);
    setNote(next.status === "published" ? `Saved and published.${cache}` : "Saved as a draft - it is not on the site.");
    load();
  };

  /* ---------------------------- history ------------------------------- */
  const openHistory = async () => {
    setShowHistory((v) => !v);
    if (revisions || !editing || editing === "new") return;
    const res = await api<{ revisions?: PageRevision[] }>(`/api/admin/pages/revisions?pageId=${encodeURIComponent(editing)}`);
    setRevisions(res.data.revisions ?? []);
  };
  const restoreRevision = async (r: PageRevision) => {
    if (!editing || editing === "new") return;
    if (!confirm(`Restore the version from ${new Date(r.created_at).toLocaleString()}? The current text is saved to history first, so this is reversible.`)) return;
    const res = await api<{ page?: PageRow; error?: string }>("/api/admin/pages/revisions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageId: editing, revisionId: r.id }),
    });
    if (!res.ok) { setErr(res.data.error ?? "Could not restore that version."); return; }
    if (res.data.page) startEdit(res.data.page);
    setRevisions(null); setShowHistory(false);
    setNote("Restored. Nothing was lost - the previous text is in history.");
    load();
  };

  const toTrash = async (p: PageRow) => {
    if (!confirm(`Move “${p.title}” to Trash? It comes off the site straight away, and you can put it back.`)) return;
    const res = await api<{ error?: string }>(`/api/admin/pages?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
    if (!res.ok) { setListErr(res.data.error ?? "Could not move that page to Trash."); return; }
    if (editing === p.id) setEditing(null);
    load();
  };
  const restore = async (p: PageRow) => {
    const res = await api<{ error?: string }>("/api/admin/pages", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: p.id, action: "restore" }),
    });
    if (!res.ok) setListErr(res.data.error ?? "Could not restore that page."); else setListErr(null);
    load();
  };
  const destroy = async (p: PageRow) => {
    if (!confirm(`Delete “${p.title}” permanently? This cannot be undone.`)) return;
    await api(`/api/admin/pages?id=${encodeURIComponent(p.id)}&permanent=1`, { method: "DELETE" });
    load();
  };

  const list = showTrash ? trash : pages;
  const address = `/${draft.slug || slugify(draft.title) || "your-page"}`;

  return (
    <div className="ad__body ad__body--one">
      {listErr && <div className="ad__err">{listErr}</div>}

      {editing !== null && (
        <section className="ad__panel">
          <div className="ad__panelhead">
            <h2>{editing === "new" ? "New page" : "Edit page"}</h2>
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
                It has not been published - you can load it or throw it away.
              </div>
              <div className="ad__actions">
                <button className="ad__mini" onClick={() => { setDraft((d) => ({ ...d, content: recovered.content })); setRecovered(null); }}>Load the draft</button>
                <button className="ad__mini" onClick={async () => {
                  await api("/api/admin/pages", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: editing, action: "discardDraft" }) });
                  setRecovered(null);
                }}>Discard it</button>
              </div>
            </div>
          )}

          {showHistory && (
            <div className="ad__card">
              <h3 className="ad__h3">Version history</h3>
              {!revisions && <div className="empty">Loading…</div>}
              {revisions && !revisions.length && <div className="ad__empty">No saved versions yet. One is kept every time you update a published page.</div>}
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
            <div className="ad__grid2">
              <label className="ad__field"><span>Title</span>
                <input value={draft.title} placeholder="About Us"
                  onChange={(e) => {
                    const title = e.target.value;
                    setDraft((d) => ({ ...d, title, slug: editing === "new" && (!d.slug || d.slug === slugify(d.title)) ? slugify(title) : d.slug }));
                  }} /></label>
              <label className="ad__field"><span>Address on the site</span>
                <input value={draft.slug} placeholder="about-us"
                  onChange={(e) => setDraft({ ...draft, slug: e.target.value })} /></label>
            </div>
            <p className="ad__hintline">This page will live at <code>cinetonight.com{address}</code>.</p>

            {slugChanged && (
              <div className="ad__notice ad__notice--warn">
                <b>Careful.</b> You are changing a published page&rsquo;s address from <code>/{originalSlug}</code> to
                {" "}<code>/{slugify(draft.slug)}</code>. Every link that points at the old address will break - including
                links inside your own posts. Check <b>Internal Links</b> after saving.
              </div>
            )}

            <label className="ad__field" style={{ marginTop: 12 }}><span>Content</span></label>
            <MarkdownEditor
              value={draft.content}
              title={draft.title}
              links={links.filter((l) => l.path !== `/${draft.slug}`)}
              minHeight={360}
              onChange={(content) => setDraft((d) => ({ ...d, content }))}
            />

            <div className="ad__grid2" style={{ marginTop: 14 }}>
              <label className="ad__field">
                <span>Meta title ({draft.meta_title.length} of 60)</span>
                <input maxLength={70} value={draft.meta_title} placeholder="Defaults to the page title"
                  onChange={(e) => setDraft({ ...draft, meta_title: e.target.value })} />
              </label>
              <label className="ad__field">
                <span>Meta description ({draft.meta_description.length} of 160)</span>
                <input maxLength={170} value={draft.meta_description} placeholder="Defaults to the opening of the page"
                  onChange={(e) => setDraft({ ...draft, meta_description: e.target.value })} />
              </label>
            </div>

            <div className="ad__serp">
              <div className="ad__serpurl">cinetonight.com › {(draft.slug || slugify(draft.title) || "your-page")}</div>
              <div className="ad__serpt">{(draft.meta_title || draft.title || "Page title").slice(0, 60)}</div>
              <div className="ad__serpd">{metaDescription(draft.meta_description || markdownToText(draft.content)) || "Your description appears here."}</div>
            </div>

            <label className="ad__field">
              <span>Status</span>
              <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as "draft" | "published" })}>
                <option value="draft">Draft - only you can see it</option>
                <option value="published">Published - live now</option>
              </select>
            </label>

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
                  <a className="ad__btn" href={`/admin/preview/page/${draft.slug}`} target="_blank" rel="noreferrer">Preview</a>
                  {wasPublished && <a className="ad__btn" href={`/${originalSlug}`} target="_blank" rel="noreferrer">View on site</a>}
                </>
              )}
              <button className="ad__btn" onClick={closeEditor}>Cancel</button>
            </div>
            <p className="ad__hintline">
              Your save is stored the instant the button confirms it. The public page is cached for speed, so it can
              take a few minutes to catch up - use <b>Preview</b> to see the true, current version straight away.
            </p>
          </div>
        </section>
      )}

      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Pages <span className="ad__count">{pages.length}</span></h2>
          <button className="ad__btn" onClick={startNew}><Icon name="plus" size={14} /> New page</button>
        </div>
        <div className="ad__filters">
          <button type="button" className={`ad__chip${!showTrash ? " on" : ""}`} onClick={() => setShowTrash(false)}>
            Pages <em>{pages.length}</em>
          </button>
          <button type="button" className={`ad__chip${showTrash ? " on" : ""}`} onClick={() => setShowTrash(true)}>
            Trash <em>{trash.length}</em>
          </button>
        </div>

        {loading ? <div className="empty">Loading…</div> : (
          <div className="ad__list">
            {list.map((p) => {
              const n = inbound[`/${p.slug}`] ?? 0;
              return (
                <div className="ad__row" key={p.id}>
                  <span className="ad__cat">{showTrash ? "in trash" : p.status}</span>
                  <span className="ad__name">{p.title}</span>
                  <span className="ad__meta">
                    /{p.slug}
                    {!showTrash && p.status === "published" && (
                      n > 0 ? ` · ${n} link${n === 1 ? "" : "s"} in` : " · nothing links here"
                    )}
                  </span>
                  {showTrash ? (
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
              );
            })}
            {!list.length && <div className="ad__empty">{showTrash ? "Trash is empty." : "No pages yet."}</div>}
          </div>
        )}
      </section>
    </div>
  );
}
