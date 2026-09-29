import type { Element } from "@bfr/data";
import { DOCS_PATH } from "../site.ts";

/**
 * One sidebar entry. `slug` is set only once the page is written: it is the page's path under
 * `/product/docs` ("" for the intro) and its MDX file is `src/content/docs/<slug or index>.mdx`.
 * Entries without a slug show in the sidebar as "coming at launch" and are not links.
 */
export type DocsNavItem = {
  title: string;
  slug?: string;
  /** Element orbs drawn before the title (the mock's element wheel entry). */
  orbs?: readonly Element[];
};

export type DocsNavGroup = { label: string; items: readonly DocsNavItem[] };

/** A written docs page, with the group it sits under. */
export type DocsPage = { title: string; slug: string; group: string };

/**
 * The docs sidebar (RESOLVED-63), the one nav config the sidebar, routes, breadcrumbs, and
 * previous/next links all read. To publish a page, add its MDX file and set `slug` here.
 * Item names follow docs/design/product-site/docs.mock.html; content is gated on launch approval
 * (M7-04C–F), so only the intro has a slug.
 */
export const DOCS_NAV: readonly DocsNavGroup[] = [
  {
    label: "Getting started",
    items: [
      { title: "Introduction", slug: "" },
      { title: "Your first battle" },
      { title: "Accounts and saves" },
    ],
  },
  {
    label: "Elements",
    items: [{ title: "The element wheel", orbs: ["fire", "water", "earth"] }],
  },
  {
    label: "Battle",
    items: [
      { title: "Turns and tapping" },
      { title: "Sparks" },
      { title: "Brave and Heart Crystals" },
      { title: "Bursts: BB, SBB, UBB" },
      { title: "Overdrive" },
      { title: "Leader skills" },
    ],
  },
  {
    label: "Damage",
    items: [{ title: "The damage formula" }, { title: "Critical hits" }],
  },
  {
    label: "Effects",
    items: [{ title: "Buffs and debuffs" }, { title: "Status ailments" }],
  },
  { label: "Enemies and bosses", items: [{ title: "Enemies and bosses" }] },
  { label: "Progression", items: [{ title: "Progression" }] },
  { label: "Content", items: [{ title: "Quests, trials, dungeons" }] },
  { label: "Economy", items: [{ title: "Gems and summoning" }] },
];

/** Every written page in sidebar order. */
export function docsPages(nav: readonly DocsNavGroup[] = DOCS_NAV): DocsPage[] {
  return nav.flatMap((group) =>
    group.items.flatMap((item) =>
      item.slug === undefined ? [] : [{ title: item.title, slug: item.slug, group: group.label }],
    ),
  );
}

/** The URL of a written page. */
export function docsHref(slug: string): string {
  return slug === "" ? DOCS_PATH : `${DOCS_PATH}/${slug}`;
}

/** The MDX file (`src/content/docs/<stem>.mdx`) that holds a page. */
export function docsStem(slug: string): string {
  return slug === "" ? "index" : slug;
}

/** The written pages before and after `slug` in sidebar order, for the previous/next links. */
export function adjacentPages(
  slug: string,
  nav: readonly DocsNavGroup[] = DOCS_NAV,
): { previous?: DocsPage; next?: DocsPage } {
  const pages = docsPages(nav);
  const at = pages.findIndex((page) => page.slug === slug);
  if (at === -1) {
    return {};
  }
  return { previous: pages[at - 1], next: pages[at + 1] };
}
