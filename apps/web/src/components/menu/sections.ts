/**
 * Menu navigation (ART_GUIDE.md -> UI). The bottom bar keeps the original's six slots in order;
 * BFR's Squad, Items, and Other take the places of the original's Town, Shop, and Social.
 */

export type NavSection = {
  href: string;
  label: string;
  /** Icon in `public/assets/ui/nav-<icon>.webp`. */
  icon: "home" | "unit" | "squad" | "items" | "summon" | "other";
};

export const NAV_SECTIONS: readonly NavSection[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/units", label: "Unit", icon: "unit" },
  { href: "/squad", label: "Squad", icon: "squad" },
  { href: "/items", label: "Items", icon: "items" },
  { href: "/summon", label: "Summon", icon: "summon" },
  { href: "/other", label: "Other", icon: "other" },
];

export type UtilityTab = {
  href: string;
  label: string;
  /** Icon in `public/assets/ui/util-<icon>.webp`. */
  icon: "book" | "castle" | "scroll" | "chest";
};

/** The strip under the squad showcase: two tabs on the left, two on the right. */
export const UTILITY_TABS: readonly UtilityTab[] = [
  { href: "/other", label: "Menu", icon: "book" },
  { href: "/gallery", label: "Gallery", icon: "castle" },
  { href: "/news", label: "Info", icon: "scroll" },
  { href: "/gifts", label: "Gifts", icon: "chest" },
];

export type GameMode = {
  href: string;
  title: string;
  /** Emblem in `public/assets/ui/mode-<emblem>.webp`. */
  emblem: "trials" | "quest" | "dungeons";
};

/** Home carousel, left to right; it opens on Quest in the middle, as the original does. */
export const GAME_MODES: readonly GameMode[] = [
  { href: "/trials", title: "Trials", emblem: "trials" },
  { href: "/quests", title: "Quest", emblem: "quest" },
  { href: "/dungeons", title: "Dungeons", emblem: "dungeons" },
];

export const START_MODE_INDEX = 1;

/** The nav section that owns `pathname`: Home only for `/`, otherwise the longest prefix match. */
export function activeSection(pathname: string): NavSection | undefined {
  if (pathname === "/") return NAV_SECTIONS[0];
  return NAV_SECTIONS.filter(
    (s) => s.href !== "/" && (pathname === s.href || pathname.startsWith(`${s.href}/`)),
  ).sort((a, b) => b.href.length - a.href.length)[0];
}
