"use client";

import { useRef, ReactNode } from "react";
import Icon from "./Icon";

/** Horizontal rail with themed scroll arrows. `sub` renders a one-line
 *  subheading under the title — every homepage section uses it to say what
 *  the row actually is ("Movies in theatres right now", "Top rated movies
 *  of all time"), which doubles as crawlable, keyword-bearing copy. */
export default function Row({ title, sub, all, children }: { title?: string; sub?: string; all?: ReactNode; children: ReactNode }) {
  const railRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => railRef.current?.scrollBy({ left: dir * 440, behavior: "smooth" });
  return (
    <section className="sec">
      {title && (
        <div className="sec__head">
          <div className="sec__titles">
            <h2>{title}</h2>
            {sub ? <p className="sec__sub">{sub}</p> : null}
          </div>
          {all}
        </div>
      )}
      <div className="railwrap">
        <button className="rnav rnav--l" aria-label="Scroll left" onClick={() => scroll(-1)}><Icon name="chevl" size={18} /></button>
        <div className="rail" ref={railRef}>{children}</div>
        <button className="rnav rnav--r" aria-label="Scroll right" onClick={() => scroll(1)}><Icon name="chevr" size={18} /></button>
      </div>
    </section>
  );
}
