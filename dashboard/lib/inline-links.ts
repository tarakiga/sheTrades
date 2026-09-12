/**
 * Turns a one-line piece of managed copy with markdown-style links -
 * `Developed by [Decy4](https://decy4.com/) and [Virtu](https://virtumultimedia.com/).`
 * - into segments a page can render as text and anchors.
 *
 * The point is that an editor can rephrase a credit line, add a firm or drop
 * one from the console without a deploy, in one string, in a notation they
 * already know. The page never receives HTML: it gets segments and builds its
 * own elements, so nothing an editor types can become markup.
 *
 * Only http(s) destinations become links. Anything else is left exactly as it
 * was typed, so a mistake is visible on the page rather than silently dropped,
 * and a pasted `javascript:` URL is inert.
 */

export type InlineSegment = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };

const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;

export function parseInlineLinks(input: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let last = 0;
  for (const match of input.matchAll(LINK)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ kind: "text", text: input.slice(last, index) });
    segments.push({ kind: "link", text: match[1]!, href: match[2]! });
    last = index + match[0].length;
  }
  if (last < input.length) segments.push({ kind: "text", text: input.slice(last) });
  return segments;
}
