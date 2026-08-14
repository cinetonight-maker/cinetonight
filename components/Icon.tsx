import type { CSSProperties } from "react";

const ICONS: Record<string,string> = {
 "article": "<path d=\"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z\"/><path d=\"M14 2v5h5M8 13h8M8 17h5\"/>",
 "home": "<path d=\"m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/><path d=\"M9 22V12h6v10\"/>",
 "film": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M7 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4M17 3v18\"/>",
 "monitor": "<path d=\"M12 17v4M8 21h8\"/><rect width=\"20\" height=\"14\" x=\"2\" y=\"3\" rx=\"2\"/>",
 "tv": "<rect width=\"20\" height=\"15\" x=\"2\" y=\"7\" rx=\"2\"/><path d=\"m17 2-5 5-5-5\"/>",
 "grid": "<rect width=\"7\" height=\"7\" x=\"3\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"7\" x=\"14\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"7\" x=\"14\" y=\"14\" rx=\"1\"/><rect width=\"7\" height=\"7\" x=\"3\" y=\"14\" rx=\"1\"/>",
 "trend": "<polyline points=\"22 7 13.5 15.5 8.5 10.5 2 17\"/><polyline points=\"16 7 22 7 22 13\"/>",
 "sparkle": "<path d=\"M9.9 15.5A2 2 0 0 0 8.5 14L2.4 12.5a.5.5 0 0 1 0-1L8.5 10A2 2 0 0 0 9.9 8.5l1.6-6.1a.5.5 0 0 1 1 0L14 8.5A2 2 0 0 0 15.5 10l6.1 1.5a.5.5 0 0 1 0 1L15.5 14a2 2 0 0 0-1.5 1.5l-1.6 6.1a.5.5 0 0 1-1 0z\"/>",
 "bookmark": "<path d=\"m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z\"/>",
 "search": "<circle cx=\"11\" cy=\"11\" r=\"8\"/><path d=\"m21 21-4.3-4.3\"/>",
 "bell": "<path d=\"M10.3 21a2 2 0 0 0 3.4 0\"/><path d=\"M3.3 15.3A1 1 0 0 0 4 17h16a1 1 0 0 0 .7-1.7C19.4 14 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.4 6-2.7 7.3\"/>",
 "user": "<path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/>",
 "crown": "<path d=\"M11.6 3.3a.5.5 0 0 1 .9 0L15.4 8.9a1 1 0 0 0 1.5.3l4.3-3.7a.5.5 0 0 1 .8.5l-2.8 10.3a1 1 0 0 1-1 .7H5.8a1 1 0 0 1-1-.7L2 6a.5.5 0 0 1 .8-.5l4.3 3.7a1 1 0 0 0 1.5-.3z\"/><path d=\"M5 21h14\"/>",
 "check": "<path d=\"M20 6 9 17l-5-5\"/>",
 "play": "<polygon points=\"6 3 20 12 6 21 6 3\" fill=\"currentColor\" stroke=\"none\"/>",
 "info": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 16v-4M12 8h.01\"/>",
 "playc": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><polygon points=\"10 8 16 12 10 16 10 8\" fill=\"currentColor\" stroke=\"none\"/>",
 "star": "<polygon points=\"12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2\" fill=\"currentColor\" stroke=\"none\"/>",
 "chevl": "<path d=\"m15 18-6-6 6-6\"/>",
 "chevr": "<path d=\"m9 18 6-6-6-6\"/>",
 "menu": "<path d=\"M4 12h16M4 6h16M4 18h16\"/>",
 "x": "<path d=\"M18 6 6 18M6 6l12 12\"/>",
 "cam": "<path d=\"m23 7-7 5 7 5z\"/><rect width=\"15\" height=\"14\" x=\"1\" y=\"5\" rx=\"2\"/>",
 "vol": "<polygon points=\"11 5 6 9 2 9 2 15 6 15 11 19 11 5\"/><path d=\"M19.07 4.93a10 10 0 0 1 0 14.14\"/>",
 "cc": "<rect width=\"18\" height=\"14\" x=\"3\" y=\"5\" rx=\"2\"/><path d=\"M7 15a2 2 0 0 1 0-4M15 15a2 2 0 0 1 0-4\"/>",
 "cal": "<path d=\"M8 2v4M16 2v4\"/><rect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\"/><path d=\"M3 10h18\"/>",
 "thumbup": "<path d=\"M7 10v12\"/><path d=\"M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z\"/>",
 "thumbdn": "<path d=\"M17 14V2\"/><path d=\"M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z\"/>",
 "reply": "<polyline points=\"9 17 4 12 9 7\"/><path d=\"M20 18v-2a4 4 0 0 0-4-4H4\"/>",
 "arrow": "<path d=\"M5 12h14M12 5l7 7-7 7\"/>",
 "fb": "<path d=\"M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z\" fill=\"currentColor\" stroke=\"none\"/>",
 "tw": "<path d=\"M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z\" fill=\"currentColor\" stroke=\"none\"/>",
 "ig": "<rect width=\"20\" height=\"20\" x=\"2\" y=\"2\" rx=\"5\"/><circle cx=\"12\" cy=\"12\" r=\"4\"/><circle cx=\"17.5\" cy=\"6.5\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/>",
 "tg": "<path d=\"M22 2 11 13\"/><path d=\"M22 2 15 22l-4-9-9-4z\"/>",
 "tiktok": "<path d=\"M9 12a4 4 0 1 0 4 4V4c.6 1.8 2.4 4 5 4\" fill=\"none\"/>",
 "telegram": "<path d=\"M22 3 2.5 10.5c-1 .4-1 1.5 0 1.8l4.7 1.5 1.8 5.6c.3.9 1.4 1 1.9.3l2.5-3.1 4.9 3.6c.8.6 1.9.2 2.1-.8L23 4.3c.2-1-.5-1.6-1-1.3z\" fill=\"currentColor\" stroke=\"none\"/>",
 "yt": "<path d=\"M2.5 17a24 24 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49 49 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24 24 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49 49 0 0 1-16.2 0A2 2 0 0 1 2.5 17\"/><polygon points=\"10 15 15 12 10 9\" fill=\"currentColor\" stroke=\"none\"/>"
};

export interface IconProps { name: string; size?: number; className?: string; style?: CSSProperties; }
export default function Icon({ name, size = 20, className, style }: IconProps) {
  return (
    <svg
      className={`ic${className ? ` ${className}` : ""}`}
      viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}
      dangerouslySetInnerHTML={{ __html: ICONS[name] || "" }}
    />
  );
}
