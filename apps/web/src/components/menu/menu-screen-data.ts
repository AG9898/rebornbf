/**
 * The original's Menu screen at /other (M8-02, RESOLVED-98; ART_GUIDE → UI → Menu screen).
 * Positions are measured in art/original/layouts/menu.json on the 640x1136 screen.
 */
import { TUTORIAL_REPLAY_PATH } from "../../lib/onboarding/routing.ts";

/** One round menu button: a `main_s_btn` base with a `content/menu/` label overlay. */
export type MenuTile = {
  label: string;
  /** Label art without its state suffix: `<art>1.png` normal, `<art>2.png` pressed. */
  art: string;
  /** A BFR route, or null when BFR has no such screen (rendered disabled, "Coming soon"). */
  href: string | null;
};

/** The 3x3 grid in reading order (rows at screen y 361 / 538 / 709, columns x 28 + 201·i). */
export const MENU_TILES: readonly MenuTile[] = [
  { label: "Player Info", art: "menu/menu_player_btn", href: "/account" },
  { label: "Links & Info", art: "menu/newest_capture_btn_label", href: null },
  { label: "Website", art: "menu/menu_official_btn", href: "/product" },
  { label: "Unit Guide", art: "menu/menu_unit_dict_btn", href: null },
  { label: "Item Guide", art: "menu/menu_item_dict_btn", href: null },
  { label: "Settings", art: "menu/menu_setup_btn_label", href: "/settings" },
  { label: "Help", art: "menu/menu_help_btn", href: "/product/docs" },
  { label: "Credits", art: "menu/menu_credit_btn", href: null },
  { label: "Record", art: "menu/menu_archive_btn", href: null },
];

/**
 * The red News button in the title bar (`sub_s_r_btn` with the `notice_btn_label` overlay). It
 * opens Info with `?from=menu`, so the window's Close returns to the Menu (M8-13).
 */
export const MENU_NEWS = {
  base: "common/button/sub_s_r_btn",
  art: "menu/notice_btn_label",
  href: "/news?from=menu",
} as const;

/** BFR-only links kept under the grid on kit `sub_m_btn` buttons. */
export const MENU_EXTRAS: readonly { label: string; href: string }[] = [
  { label: "Demo battle", href: "/battle" },
  { label: "Replay tutorial", href: TUTORIAL_REPLAY_PATH },
];
