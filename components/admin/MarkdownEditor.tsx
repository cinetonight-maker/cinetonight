"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { renderMarkdown, wordCount, readingTime, outlineOf } from "@/lib/markdown";
import { linkSuggestions, extractLinks, type LinkTarget } from "@/lib/linkGraph";
import { ImagePicker } from "./shared";

/* ============================================================================
 * The article editor.
 *
 * Deliberately a plain <textarea> with a formatting toolbar, not a rich-text
 * (contenteditable) editor. Three reasons that matter for this site:
 *
 *  1. What is stored is exactly what was typed. A rich-text editor stores
 *     generated HTML, which drifts, breaks on paste from Word, and makes the
 *     "escape everything, then parse Markdown" security model impossible.
 *  2. It cannot break the page. The renderer only ever produces tags that
 *     `marked` built, so no editor bug can put a script on the live site.
 *  3. It stays fast on a phone and never fights the browser's own undo.
 *
 * The toolbar inserts Markdown around the selection using execCommand-free
 * value surgery, and every insert goes through document.execCommand("insertText")
 * when available so the browser's native undo stack (Ctrl+Z) keeps working.
 * ========================================================================= */

const HEADING_HINT =
  "The post title is already the page's H1 — never add another H1. Use ## for section headings and ### underneath them.";

const KIND_LABEL: Record<LinkTarget["kind"], string> = {
  post: "Blog post", page: "Page", movie: "Movie", series: "Series", free: "Free movie", section: "Section",
};

export default function MarkdownEditor({
  value,
  onChange,
  title = "",
  links = [],
  minHeight = 420,
}: {
  value: string;
  onChange: (next: string) => void;
  /** The post's title — used to spot pages worth linking to. */
  title?: string;
  /** Everything on the site that can be linked to (from /api/admin/links). */
  links?: LinkTarget[];
  minHeight?: number;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");

  /* ---- insertion helpers -------------------------------------------------
     Writing through execCommand keeps the browser's undo history intact, so
     Ctrl+Z still works after a toolbar click. Where that is unavailable we
     fall back to setting the value directly. */
  const replaceSelection = useCallback((make: (selected: string) => string, caretBack: number | ((selected: string) => number) = 0) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = el.value.slice(start, end);
    const text = make(selected);

    el.focus();
    el.setSelectionRange(start, end);
    let inserted = false;
    try { inserted = document.execCommand("insertText", false, text); } catch { inserted = false; }
    if (!inserted) {
      const next = el.value.slice(0, start) + text + el.value.slice(end);
      el.value = next;
    }
    onChange(el.value);
    const back = typeof caretBack === "function" ? caretBack(selected) : caretBack;
    const caret = start + text.length - back;
    requestAnimationFrame(() => { el.setSelectionRange(caret, caret); el.focus(); });
  }, [onChange]);

  /** Prefix each selected line — used by headings, quote and lists. */
  const prefixLines = useCallback((prefix: string | ((i: number) => string)) => {
    replaceSelection((sel) => {
      const lines = (sel || "").split("\n");
      const body = lines
        .map((l, i) => {
          const clean = l.replace(/^(#{1,6}\s+|>\s+|[-*]\s+|\d+\.\s+)/, "");
          return (typeof prefix === "string" ? prefix : prefix(i)) + clean;
        })
        .join("\n");
      return sel ? body : body + "";
    });
  }, [replaceSelection]);

  /** Wrap the selection in `mark`. With text selected the caret lands after
   *  the closing mark; with nothing selected it lands inside the placeholder
   *  so you can just start typing. */
  const wrap = useCallback((mark: string, placeholder: string) => {
    replaceSelection(
      (sel) => `${mark}${sel || placeholder}${mark}`,
      (sel) => (sel ? 0 : mark.length),
    );
  }, [replaceSelection]);

  const text = value ?? "";
  const words = useMemo(() => wordCount(text), [text]);
  const outline = useMemo(() => outlineOf(text), [text]);
  const html = useMemo(() => (tab === "preview" ? renderMarkdown(text) : ""), [tab, text]);

  const h1s = outline.filter((h) => h.level === 1).length;
  const h2s = outline.filter((h) => h.level === 2).length;

  /* How many links point at other CineTonight pages. Two is the working
     minimum — the same rule the Internal Links screen reports on — so the
     writer sees the problem while writing instead of finding it later. */
  const internalOut = useMemo(() => {
    const own = new Set<string>();
    for (const l of extractLinks(text)) if (l.href.startsWith("/")) own.add(l.href);
    return own.size;
  }, [text]);

  /* Pages this article already mentions by name but does not link to. */
  const suggestions = useMemo(
    () => (links.length ? linkSuggestions(text, title, links, 5) : []),
    [text, title, links],
  );

  const matches = useMemo(() => {
    const q = linkQuery.trim().toLowerCase();
    const pool = q ? links.filter((l) => l.label.toLowerCase().includes(q) || l.path.toLowerCase().includes(q)) : links;
    return pool.slice(0, 40);
  }, [links, linkQuery]);

  const insertLink = (t: LinkTarget) => {
    replaceSelection((s) => `[${s || t.label}](${t.path})`);
    setLinkOpen(false); setLinkQuery("");
  };

  return (
    <div className="mde">
      <div className="mde__bar">
        <div className="mde__grp">
          <button type="button" className="mde__b" title="Section heading (H2)" onClick={() => prefixLines("## ")}>H2</button>
          <button type="button" className="mde__b" title="Sub-heading (H3)" onClick={() => prefixLines("### ")}>H3</button>
          <button type="button" className="mde__b" title="Small heading (H4)" onClick={() => prefixLines("#### ")}>H4</button>
        </div>
        <div className="mde__grp">
          <button type="button" className="mde__b" title="Bold (Ctrl+B)" onClick={() => wrap("**", "bold text")}><b>B</b></button>
          <button type="button" className="mde__b" title="Italic (Ctrl+I)" onClick={() => wrap("*", "italic text")}><i>I</i></button>
        </div>
        <div className="mde__grp">
          <button type="button" className="mde__b" title="Bullet list" onClick={() => prefixLines("- ")}>• List</button>
          <button type="button" className="mde__b" title="Numbered list" onClick={() => prefixLines((i) => `${i + 1}. `)}>1. List</button>
          <button type="button" className="mde__b" title="Quote" onClick={() => prefixLines("> ")}>❝</button>
        </div>
        <div className="mde__grp">
          <button type="button" className="mde__b" title="Link" onClick={() => replaceSelection((s) => `[${s || "link text"}](https://)`, 1)}>
            <Icon name="arrow" size={13} /> Link
          </button>
          {links.length > 0 && (
            <button type="button" className="mde__b" title="Link to one of your own pages" onClick={() => setLinkOpen((v) => !v)}>
              Internal link
            </button>
          )}
          <button type="button" className="mde__b" title="Insert an image" onClick={() => setImageOpen((v) => !v)}>
            <Icon name="plus" size={13} /> Image
          </button>
          <button type="button" className="mde__b" title="Table" onClick={() => replaceSelection(() =>
            "\n| Column | Column |\n| --- | --- |\n| Value | Value |\n")}>Table</button>
          <button type="button" className="mde__b" title="YouTube video (loads only when a reader clicks it)"
            onClick={() => replaceSelection(() => "\n@youtube(VIDEO_ID)\n", 1)}>YouTube</button>
        </div>
        <div className="mde__grp mde__grp--right">
          <button type="button" className={`mde__b${tab === "write" ? " on" : ""}`} onClick={() => setTab("write")}>Write</button>
          <button type="button" className={`mde__b${tab === "preview" ? " on" : ""}`} onClick={() => setTab("preview")}>Preview</button>
        </div>
      </div>

      {linkOpen && links.length > 0 && (
        <div className="mde__pop">
          <div className="mde__popt">Link to a page on CineTonight</div>
          <input
            className="mde__search"
            autoFocus
            value={linkQuery}
            placeholder="Search posts, pages, movies, free movies…"
            onChange={(e) => setLinkQuery(e.target.value)}
          />
          <div className="mde__links">
            {matches.map((l) => (
              <button key={l.path} type="button" className="mde__link" onClick={() => insertLink(l)}>
                <span>{l.label}</span><em>{KIND_LABEL[l.kind]} · {l.path}</em>
              </button>
            ))}
            {!matches.length && <div className="ad__empty">Nothing matches “{linkQuery}”.</div>}
          </div>
          {links.length > matches.length && !linkQuery && (
            <p className="mde__note">Showing the first {matches.length} of {links.length} — type to search the rest.</p>
          )}
        </div>
      )}

      {imageOpen && (
        <div className="mde__pop">
          <div className="mde__popt">Insert an image — it is added where your cursor is</div>
          <ImagePicker
            url={null}
            label="Upload image"
            onChange={(url) => {
              if (!url) return;
              replaceSelection(() => `\n![Describe this image](${url})\n`);
              setImageOpen(false);
            }}
          />
          <p className="mde__note">Replace “Describe this image” with real alt text — it is what Google reads and what a screen reader says.</p>
        </div>
      )}

      {tab === "write" ? (
        <textarea
          ref={ref}
          className="mde__ta"
          style={{ minHeight }}
          value={text}
          spellCheck
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            const k = e.key.toLowerCase();
            if (k === "b") { e.preventDefault(); wrap("**", "bold text"); }
            else if (k === "i") { e.preventDefault(); wrap("*", "italic text"); }
          }}
          placeholder={"Write the article here.\n\n## A section heading\nA paragraph under it.\n\n- a bullet\n- another bullet"}
        />
      ) : (
        /* eslint-disable-next-line react/no-danger -- produced by renderMarkdown, the same sanitizing renderer the public page uses */
        <div className="mde__prev article__body" dangerouslySetInnerHTML={{ __html: html }} />
      )}

      {/* Pages this article already talks about but does not link to. One
          click adds the link — this is the work the Internal Links screen
          would otherwise ask you to come back and do later. */}
      {suggestions.length > 0 && tab === "write" && (
        <div className="mde__sugg">
          <span className="mde__suggl">You mention these — link them?</span>
          {suggestions.map((s) => (
            <button key={s.target.path} type="button" className="mde__suggb" title={`Insert a link to ${s.target.path}`}
              onClick={() => insertLink(s.target)}>
              + {s.target.label}
            </button>
          ))}
        </div>
      )}

      <div className="mde__foot">
        <span>{words.toLocaleString()} words</span>
        <span>{readingTime(text)} read</span>
        <span>{h2s} section{h2s === 1 ? "" : "s"}</span>
        <span className={internalOut < 2 ? "mde__warn" : undefined}>
          {internalOut} link{internalOut === 1 ? "" : "s"} to other CineTonight pages{internalOut < 2 ? " — aim for at least 2" : ""}
        </span>
        {h1s > 0 && <span className="mde__warn">Remove the # heading — {HEADING_HINT}</span>}
        {h1s === 0 && h2s === 0 && words > 120 && <span className="mde__warn">No ## sections yet — add 3–6 so Google can outline the article.</span>}
      </div>
    </div>
  );
}
