/**
 * The Summon screen's original pieces (M8-11, RESOLVED-98; ART_GUIDE -> UI -> Summon): the
 * banner page and its confirm window, at the positions in art/original/layouts/summon.json and
 * summon_confirm.json. Client-safe (no content imports). Piece names are checked against
 * ORIGINAL_ASSETS in tests.
 */
import type { OriginalAsset } from "../original/original-assets.ts";

export const SUMMON_PATH = "/summon";
/** The confirm window is the `?step=confirm` view of `/summon`, so Back returns to the banner. */
export const SUMMON_CONFIRM_PATH = "/summon?step=confirm";

export function isConfirmStep(step: string | string[] | undefined): boolean {
  return step === "confirm";
}

/** A banner's original art: the 640x632 banner page and the door behind its confirm window. */
export type SummonBannerArt = { banner: OriginalAsset; door: OriginalAsset };

/**
 * BFR's launch banner wears the original's Rare Summon (`content/gacha/gacha_rare_bg_img`, the
 * gold-door summon every player had) rather than a dated featured banner.
 */
export const SUMMON_BANNER_ART: Readonly<Record<string, SummonBannerArt>> = {
  "launch-summon": {
    banner: "gacha/gacha_rare_bg_img.png",
    door: "gacha/gacha_rare_door.png",
  },
};

/** Button pairs without their state suffix (`1` normal, `2` pressed); captions are baked in. */
export const SUMMON_BUTTONS = {
  /** The gold Rare Summon button: one pull on the banner page and in the confirm window. */
  single: "gacha/gacha_rare_summons_btn",
  /** The silver Multi Summon button: the 10+1 pull. */
  multi: "gacha/gacha_multi_summons_btn",
} as const;

/** The free 10-pull ticket's thumb (`content/summon_ticket_v2/`). */
export const SUMMON_TICKET_ART: OriginalAsset = "summon_ticket_v2/anniversary_ticket_thum.png";

/** The gold flourishes the original lays over the system window's corners. */
export const SUMMON_WINDOW_DECO: readonly [OriginalAsset, OriginalAsset] = [
  "system/sys_win_deco_1.png",
  "system/sys_win_deco_2.png",
];

/** Previous / next banner arrows, shown only while more than one banner is open. */
export const SUMMON_PAGE_ARROWS: readonly [OriginalAsset, OriginalAsset] = [
  "common/page_feed_arrow_l.png",
  "common/page_feed_arrow_r.png",
];

/** How many single summons the gems pay for (the confirm window's "You can summon N time(s)"). */
export function summonsAffordable(gems: number | null, cost: number): number {
  return gems === null || cost <= 0 ? 0 : Math.floor(gems / cost);
}

/** Every original piece the Summon screen draws (for the asset-existence test). */
export const SUMMON_SCREEN_ASSETS: readonly string[] = [
  ...Object.values(SUMMON_BANNER_ART).flatMap((art) => [art.banner, art.door]),
  ...[1, 2].flatMap((state) => Object.values(SUMMON_BUTTONS).map((b) => `${b}${state}.png`)),
  SUMMON_TICKET_ART,
  ...SUMMON_WINDOW_DECO,
  ...SUMMON_PAGE_ARROWS,
];
