"use client";

import Icon from "../Icon";
import { track } from "@/lib/analytics";

/** The hero's two primary buttons.
 *
 *  Kept as their own tiny client component so the rest of the hero - headline,
 *  supporting copy, search and the crawlable links - stays a server component
 *  and ships as plain HTML.
 *
 *  They talk to the recommendation engine by dispatching a window event rather
 *  than sharing React state across the page. That is the same pattern the
 *  trailer player already uses here, and it avoids wrapping the whole homepage
 *  in a context provider just to connect two buttons. Both also carry a real
 *  href, so they work as ordinary anchors if JavaScript never arrives. */
export default function HeroActions() {
  const fire = (name: string, event: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (typeof window === "undefined") return;
    e.preventDefault();
    track(event, {});
    window.dispatchEvent(new CustomEvent(name));
  };

  return (
    <div className="hhero__cta">
      <a
        className="hhero__btn hhero__btn--primary"
        href="#tonights-pick"
        onClick={fire("cinetonight:surprise", "pick_for_me")}
      >
        <Icon name="sparkle" size={16} /> Pick something for me
      </a>
      <a
        className="hhero__btn"
        href="#choose-your-mood"
        onClick={fire("cinetonight:moods", "choose_mood")}
      >
        <Icon name="grid" size={16} /> Choose my mood
      </a>
    </div>
  );
}
