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
  { href: "/home", label: "Home", icon: "home" },
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
  /** Position in the strip's four slots (two each side of the flourish). */
  slot: 0 | 1 | 2 | 3;
};

/**
 * The strip under the squad showcase. Slot 1 held the retired Gallery tab (RESOLVED-96) and stays
 * empty until the owner names a replacement; the other tabs keep their positions.
 */
export const UTILITY_TABS: readonly UtilityTab[] = [
  { href: "/other", label: "Menu", icon: "book", slot: 0 },
  { href: "/news", label: "Info", icon: "scroll", slot: 2 },
  { href: "/gifts", label: "Gifts", icon: "chest", slot: 3 },
];

export type GameMode = {
  href: string;
  title: string;
  /** Emblem in `public/assets/ui/mode-<emblem>.webp`. */
  emblem: "trials" | "quest" | "dungeons";
};

/** Home carousel, left to right; it opens on Quest in the middle, as the original does. */
export const GAME_MODES: readonly GameMode[] = [
  { href: "/conclave", title: "Conclave", emblem: "trials" },
  { href: "/quests", title: "Quest", emblem: "quest" },
  { href: "/dungeons", title: "Dungeons", emblem: "dungeons" },
];

export const START_MODE_INDEX = 1;

/**
 * The nav section that owns `pathname`: the longest prefix match. Home lives at `/home`; `/` is
 * the title screen (RESOLVED-68), outside the menu frame, so no section owns it.
 */
export function activeSection(pathname: string): NavSection | undefined {
  return NAV_SECTIONS.filter((s) => pathname === s.href || pathname.startsWith(`${s.href}/`)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
}
