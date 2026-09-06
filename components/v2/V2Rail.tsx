"use client";

import { useRef, type ReactNode } from "react";
import Icon from "../Icon";

/** Horizontal rail with the site's own scroll arrows, reusing the existing
 *  .railwrap / .rail / .rnav rules in globals.css - the same carousel the
 *  homepage rows and the cast strip already use.
 *
 *  Why not components/Row: Row wraps its rail in its own <section class="sec">
 *  with a .sec__head heading, and the V2 template supplies its own heading
 *  row (.v2m-h2row) and its own section spacing (.v2m-sec). Reusing Row here
 *  meant either two competing headings or 34px of section margin the rest of
 *  this page does not have. This is the rail only.
 *
 *  Client-side purely for the two arrow buttons; the rail itself is a native
 *  overflow-x scroller, so it works with a wheel, a trackpad, a touch drag
 *  and a keyboard whether or not the JS has loaded. */
export default function V2Rail({ children }: { children: ReactNode }) {
  const rail = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => rail.current?.scrollBy({ left: dir * 440, behavior: "smooth" });
  return (
    <div className="railwrap">
      <button className="rnav rnav--l" type="button" aria-label="Scroll left" onClick={() => scroll(-1)}>
        <Icon name="chevl" size={18} />
      </button>
      <div className="rail" ref={rail}>{children}</div>
      <button className="rnav rnav--r" type="button" aria-label="Scroll right" onClick={() => scroll(1)}>
        <Icon name="chevr" size={18} />
      </button>
    </div>
  );
}
