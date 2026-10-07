/**
 * Menu navigation on the original's home screen and footer (RESOLVED-98; ART_GUIDE → Original
 * Asset Import). Every entry keeps the original's art; `href: null` marks a button whose screen
 * does not exist yet, which renders disabled.
 */
import type { OriginalAsset } from "../../lib/original/original-assets.ts";

export type NavSection = {
  label: string;
  href: string | null;
  /** Footer button art: `footer/footer_btn/btn_<button>_01.png` (normal) and `_02` (pressed). */
  button: "home" | "unit" | "village" | "shop" | "Summon" | "friend";
  /** Other routes the section owns (the Unit hub's screens). */
  owns?: readonly string[];
};

/** The original's footer, left to right. BFR's Items live under Town until a Town screen exists. */
export const NAV_SECTIONS: readonly NavSection[] = [
  { label: "Home", href: "/home", button: "home" },
  { label: "Unit", href: "/units", button: "unit", owns: ["/squad", "/fusion"] },
  { label: "Town", href: "/items", button: "village" },
  { label: "Shop", href: null, button: "shop" },
  { label: "Summon", href: "/summon", button: "Summon" },
  { label: "Social", href: null, button: "friend" },
];

export type SideButton = {
  label: string;
  href: string | null;
  /** Art: `home/home_new_btn_<art>1.png` (normal) and `2` (pressed). */
  art: "menu" | "mission" | "shortcut" | "exchange" | "info" | "box";
};

/** The two button groups under the unit frame: three left, three right. */
export const SIDE_BUTTONS_LEFT: readonly SideButton[] = [
  { label: "Menu", href: "/other", art: "menu" },
  { label: "Missions", href: null, art: "mission" },
  { label: "Shortcuts", href: null, art: "shortcut" },
];

export const SIDE_BUTTONS_RIGHT: readonly SideButton[] = [
  { label: "Exchange", href: null, art: "exchange" },
  { label: "Info", href: "/news", art: "info" },
  { label: "Gifts", href: "/gifts", art: "box" },
];

export type Shortcut = {
  label: string;
  href: string | null;
  /** Normal and pressed art. */
  art: readonly [OriginalAsset, OriginalAsset];
};

/** The Shortcuts button's panel. Trial opens the Conclave, BFR's trials hall. */
export const SHORTCUTS: readonly Shortcut[] = [
  {
    label: "Trial",
    href: "/conclave",
    art: ["home/home_shortcut_trial_btn1.png", "home/home_shortcut_trial_btn2.png"],
  },
  {
    label: "Login Campaign",
    href: null,
    art: ["home/home_shortcut_login_campaign1.png", "home/home_shortcut_login_campaign2.png"],
  },
  {
    label: "Daily Spin",
    href: null,
    art: ["home/home_shortcut_dailyspin_btn1.png", "home/home_shortcut_dailyspin_btn2.png"],
  },
  {
    label: "Frontier",
    href: null,
    art: ["home/home_shortcut_frontier_icon1.png", "home/home_shortcut_frontier_icon2.png"],
  },
  {
    label: "Grand Quest",
    href: null,
    art: ["home/home_shortcut_grandquest_btn1.png", "home/home_shortcut_grandquest_btn2.png"],
  },
];

export type GameMode = {
  title: string;
  href: string | null;
  /** The mode's home window, 450x316. */
  art: OriginalAsset;
};

/** Home carousel windows in the original's order (six page dots); it opens on Quest. */
export const GAME_MODES: readonly GameMode[] = [
  { title: "Vortex Gate", href: "/dungeons", art: "home/home_win_gate.png" },
  { title: "Quest", href: "/quests", art: "home/home_win_quest.png" },
  { title: "Raid Battle", href: null, art: "home/home_win_raid_open.png" },
  { title: "Imperial Capital Randall", href: null, art: "home/home_win_randall.png" },
  { title: "Summoning Arts Lab", href: null, art: "home/home_win_smn_lab.png" },
  { title: "Arena", href: null, art: "home/home_win_arena.png" },
];

export const START_MODE_INDEX = 1;

/**
 * The nav section that owns `pathname`: the longest matching prefix among each section's route
 * and the routes it owns. Home lives at `/home`; `/` is the title screen (RESOLVED-68), outside
 * the menu frame, so no section owns it.
 */
export function activeSection(pathname: string): NavSection | undefined {
  let best: NavSection | undefined;
  let bestLength = 0;
  for (const section of NAV_SECTIONS) {
    for (const route of [section.href, ...(section.owns ?? [])]) {
      if (!route) continue;
      const hit = pathname === route || pathname.startsWith(`${route}/`);
      if (hit && route.length > bestLength) {
        best = section;
        bestLength = route.length;
      }
    }
  }
  return best;
}
