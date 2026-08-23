import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown, markdownToText, wordCount, readingTime, outlineOf } from "../lib/markdown.ts";

/* The renderer is the one place article text becomes HTML on a public page,
 * so these tests are the security boundary, not a formatting nicety. */

test("renders headings, lists and links", () => {
  const html = renderMarkdown("## Section\n\n- one\n- two\n\n[TMDB](https://www.themoviedb.org)");
  assert.match(html, /<h2[^>]*>Section<\/h2>/);
  assert.match(html, /<li>one<\/li>/);
  assert.match(html, /href="https:\/\/www\.themoviedb\.org"/);
});

test("external links open in a new tab and do not pass link equity", () => {
  const html = renderMarkdown("[x](https://example.com)");
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener nofollow ugc"/);
});

test("internal links stay in the same tab and keep their link equity", () => {
  const html = renderMarkdown("[Free movies](/free-movies)");
  assert.match(html, /href="\/free-movies"/);
  assert.ok(!html.includes("target=\"_blank\""), "internal link must not open a new tab");
  assert.ok(!html.includes("nofollow"), "internal link must not be nofollowed");
});

test("raw HTML in the source cannot produce HTML in the output", () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n<iframe src="//evil"></iframe>');
  assert.ok(!/<script/i.test(html), "no script tag may survive");
  assert.ok(!/onerror/i.test(html.replace(/&[a-z]+;/g, "")) || !/<img[^>]*onerror/i.test(html), "no event handler attribute");
  assert.ok(!/<iframe/i.test(html), "no iframe may survive");
  assert.match(html, /&lt;script&gt;/, "it is shown as text instead");
});

test("javascript: and data: URLs are stripped from links and images", () => {
  const a = renderMarkdown("[click](javascript:alert(1))");
  assert.ok(!/href="javascript:/i.test(a));
  assert.match(a, /data-blocked="1"/);

  const i = renderMarkdown("![x](data:text/html;base64,PHNjcmlwdD4=)");
  assert.ok(!/src="data:/i.test(i));
});

test("images are lazy-loaded so an article never blocks the page", () => {
  const html = renderMarkdown("![Poster](https://cdn.example.com/a.jpg)");
  assert.match(html, /loading="lazy"/);
  assert.match(html, /decoding="async"/);
});

test("@youtube() becomes a click-to-load thumbnail, never an auto-loading iframe", () => {
  const html = renderMarkdown("@youtube(dQw4w9WgXcQ)");
  assert.ok(!/<iframe/i.test(html), "an iframe would cost every reader ~700KB");
  assert.match(html, /i\.ytimg\.com\/vi\/dQw4w9WgXcQ\/hqdefault\.jpg/);
  assert.match(html, /youtube\.com\/watch\?v=dQw4w9WgXcQ/);
});

test("legacy array bodies render exactly like the joined Markdown", () => {
  const legacy = ["## Heading", "First paragraph.", "Second paragraph."];
  assert.equal(renderMarkdown(legacy), renderMarkdown(legacy.join("\n\n")));
  assert.match(renderMarkdown(legacy), /<h2[^>]*>Heading<\/h2>/);
});

test("empty and missing bodies render nothing rather than crashing", () => {
  assert.equal(renderMarkdown(null), "");
  assert.equal(renderMarkdown(undefined), "");
  assert.equal(renderMarkdown(""), "");
  assert.equal(renderMarkdown([]), "");
});

test("ampersands survive without double-escaping", () => {
  const html = renderMarkdown("Fast & Furious");
  assert.match(html, /Fast &amp; Furious/);
  assert.ok(!html.includes("&amp;amp;"), "must not double-escape");
});

test("plain text strips syntax for excerpts and counts", () => {
  const text = markdownToText("## Title\n\nSome **bold** and a [link](https://x.com).");
  assert.ok(!text.includes("#"));
  assert.ok(!text.includes("**"));
  assert.ok(text.includes("link"), "link TEXT is kept, the URL is not");
  assert.ok(!text.includes("https://x.com"));
});

test("word count and reading time are derived, never guessed", () => {
  const body = Array.from({ length: 440 }, () => "word").join(" ");
  assert.equal(wordCount(body), 440);
  assert.equal(readingTime(body), "2 min");
  assert.equal(readingTime("short"), "1 min", "never shows 0 min");
});

test("outline reports the heading structure the editor warns on", () => {
  const o = outlineOf("# Bad H1\n\n## Good\n\n### Deeper");
  assert.deepEqual(o, [
    { level: 1, text: "Bad H1" },
    { level: 2, text: "Good" },
    { level: 3, text: "Deeper" },
  ]);
});
