"use client";

import { useRef, ReactNode } from "react";
import Icon from "./Icon";

/** Horizontal rail with themed scroll arrows. */
export default function Row({ title, all, children }: { title?: string; all?: ReactNode; children: ReactNode }) {
  const railRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => railRef.current?.scrollBy({ left: dir * 440, behavior: "smooth" });
  return (
    <section className="sec">
      {title && (
        <div className="sec__head">
          <h2>{title}</h2>
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
