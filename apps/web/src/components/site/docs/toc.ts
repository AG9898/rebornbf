/** One "On this page" entry, taken from an h2 or h3 in a docs page. */
export type TocEntry = { depth: 2 | 3; text: string; id: string };

/** The anchor id for a heading's text; the MDX heading components and the TOC both use it. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Markdown heading source to plain text: links, emphasis, and inline code marks removed. */
function headingText(source: string): string {
  return source
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();
}

/**
 * The h2 and h3 headings of an MDX page source, in order, skipping fenced code blocks. Docs
 * headings are plain markdown (`## Title`), so reading the source at build time gives the same
 * text the heading components render.
 */
export function extractToc(source: string): TocEntry[] {
  const entries: TocEntry[] = [];
  let fenced = false;
  for (const line of source.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    const match = fenced ? null : /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (match?.[1] && match[2]) {
      const text = headingText(match[2]);
      entries.push({ depth: match[1].length === 2 ? 2 : 3, text, id: slugify(text) });
    }
  }
  return entries;
}
