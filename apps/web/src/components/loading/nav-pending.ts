/** What `NavPending` needs to know about one click: the link and how it was clicked. */
export type LinkClick = {
  /** The anchor's resolved `href` (an absolute URL), or null when the click was not on a link. */
  href: string | null;
  target: string | null;
  download: boolean;
  button: number;
  modified: boolean;
};

/**
 * Whether a click starts an in-app route change that the loading overlay should cover: a plain
 * left click on a same-origin link to another path. New tabs, downloads, modified clicks, other
 * origins, and same-path links (hash or query only) are left alone.
 */
export function startsNavigation(click: LinkClick, location: { origin: string; pathname: string }) {
  if (click.href === null) return false;
  if (click.button !== 0 || click.modified || click.download) return false;
  if (click.target && click.target !== "_self") return false;
  let url: URL;
  try {
    url = new URL(click.href);
  } catch {
    return false;
  }
  return url.origin === location.origin && url.pathname !== location.pathname;
}
