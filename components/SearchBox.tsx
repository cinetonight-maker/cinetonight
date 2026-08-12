"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import { poster } from "@/lib/images";
import type { Movie } from "@/lib/types";

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;
const MAX_SUGGESTIONS = 6;

/** Search box with live, as-you-type suggestions — reuses the existing
 *  /api/search route (already rate-limited generously with search-as-you-
 *  type explicitly in mind), just shows the top few results inline instead
 *  of only ever surfacing them after a full page navigation. Used by both
 *  the header's search form and the /search page's own box, so behavior
 *  (debounce, keyboard nav, click-through) stays identical in both places
 *  instead of being implemented twice. */
export default function SearchBox({
  variant = "header",
  placeholder = "Search movies, web series…",
  initialValue = "",
  autoFocus = false,
  onNavigate,
}: {
  variant?: "header" | "page";
  placeholder?: string;
  initialValue?: string;
  autoFocus?: boolean;
  /** Called after any navigation this box triggers — e.g. so the header can close its mobile drawer. */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [term, setTerm] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Movie[]>([]);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  // Keep in sync if the page navigates with a different ?q= under us (e.g.
  // back/forward, or a link elsewhere setting the query directly).
  useEffect(() => { setTerm(initialValue); }, [initialValue]);

  useEffect(() => {
    const q = term.trim();
    if (q.length < MIN_CHARS) { setResults([]); setLoading(false); setActive(-1); return; }
    const mine = ++reqId.current;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("search failed"))))
        .then((d) => {
          if (mine !== reqId.current) return;
          setResults((d.results ?? []).slice(0, MAX_SUGGESTIONS));
          setLoading(false);
          setActive(-1);
        })
        .catch(() => { if (mine === reqId.current) { setResults([]); setLoading(false); } });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function goToResults(q: string) {
    setOpen(false);
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
    onNavigate?.();
  }
  function goToTitle(m: Movie) {
    setOpen(false);
    setTerm(m.title);
    router.push(`/movie/${m.id}`);
    onNavigate?.();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (active >= 0 && results[active]) goToTitle(results[active]);
    else goToResults(term.trim());
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { setOpen(false); setActive(-1); return; }
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((p) => (p + 1) % results.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((p) => (p <= 0 ? results.length - 1 : p - 1)); }
  }

  const q = term.trim();
  const showDrop = open && q.length >= MIN_CHARS;
  const isPage = variant === "page";

  return (
    <div className={`searchbox searchbox--${variant}`} ref={boxRef}>
      <form className={isPage ? "pagesearch" : "search"} onSubmit={onSubmit} role="search">
        {isPage && <Icon name="search" size={16} />}
        <input
          placeholder={placeholder}
          value={term}
          onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          aria-label="Search movies and shows"
          autoFocus={autoFocus}
          autoComplete="off"
          role="combobox"
          aria-expanded={showDrop}
          aria-autocomplete="list"
          aria-controls="searchbox-listbox"
        />
        {isPage && q && (
          <button
            type="button"
            className="pagesearch__clear"
            aria-label="Clear search"
            onClick={() => { setTerm(""); setResults([]); goToResults(""); }}
          >
            <Icon name="x" size={14} />
          </button>
        )}
        <button className={isPage ? "pagesearch__go" : "sb"} type="submit" aria-label="Search">
          <Icon name="search" size={14} />
        </button>
      </form>

      {showDrop && (
        <div className="searchbox__drop" role="listbox" id="searchbox-listbox">
          {loading ? (
            <div className="searchbox__msg">Searching…</div>
          ) : results.length ? (
            <>
              {results.map((m, i) => (
                <button
                  type="button"
                  key={m.id}
                  role="option"
                  aria-selected={i === active}
                  className={`searchbox__item${i === active ? " active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => goToTitle(m)}
                >
                  <span className="searchbox__th"><Image fill alt="" src={poster(m)} sizes="36px" /></span>
                  <span className="searchbox__meta">
                    <span className="searchbox__t">{m.title}</span>
                    <span className="searchbox__y">{[m.year || null, m.kind === "series" ? "Series" : "Movie"].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="searchbox__r"><Icon name="star" size={10} /> {m.rating.toFixed(1)}</span>
                </button>
              ))}
              <button type="button" className="searchbox__all" onClick={() => goToResults(q)}>
                See all results for “{q}” <Icon name="arrow" size={12} />
              </button>
            </>
          ) : (
            <div className="searchbox__msg">No matches for “{q}”.</div>
          )}
        </div>
      )}
    </div>
  );
}
