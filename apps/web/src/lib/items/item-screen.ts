/**
 * The Items screens rebuilt from the original's pieces (M8-10, RESOLVED-98; ART_GUIDE -> UI ->
 * Items): the Item menu at `/items` (the footer's Town opens it until a Town screen exists) and
 * the All Items grid at `/items/list`. Piece names are checked against ORIGINAL_ASSETS in tests.
 */
import { type ItemContent, ItemContentSchema } from "@bfr/data";
import bitterleaf from "@bfr/data/content/items/bitterleaf.json";
import brightTonic from "@bfr/data/content/items/bright-tonic.json";
import crownShard from "@bfr/data/content/items/crown-shard.json";
import dewTonic from "@bfr/data/content/items/dew-tonic.json";
import grandTonic from "@bfr/data/content/items/grand-tonic.json";
import rekindleAsh from "@bfr/data/content/items/rekindle-ash.json";
import valorDraught from "@bfr/data/content/items/valor-draught.json";
import zenithCore from "@bfr/data/content/items/zenith-core.json";
import { itemIcon } from "../../components/menu/item-icon.ts";
import type { UiAsset } from "../../components/menu/ui-assets.ts";
import type { OriginalAsset } from "../original/original-assets.ts";

export const ITEM_MENU_PATH = "/items";
export const ITEM_LIST_PATH = "/items/list";
export const ITEM_MANAGE_PATH = "/items/manage";

/** Manage Items for a squad slot (0-9): each squad remembers its own battle-item loadout. */
export function itemManageHref(slot: number): string {
  return slot === 0 ? ITEM_MANAGE_PATH : `${ITEM_MANAGE_PATH}?slot=${slot}`;
}

/** The town backdrop behind both Items screens, drawn from screen y 64 (dimmed in CSS). */
export const ITEM_BACKDROP: OriginalAsset = "mytown_top/mytown_base.jpg";

/** The blue `main_l_btn` (260x156) under every Item menu label. */
export const ITEM_MENU_BASE = "common/button/main_l_btn";

export type ItemMenuButton = {
  label: string;
  /** The `content/item_top/` label overlay without its state suffix (`1` normal, `2` pressed). */
  art: string;
  /** Where the button goes; null while BFR has no such screen ("Coming soon"). */
  href: string | null;
};

/**
 * The Item menu's 2x2 grid, left to right, top to bottom (screen x 40 / 340, y 370 + 168 per
 * row; art/original/layouts/items.json). The recording shows View, Manage, and Sell; Synthesis
 * takes the fourth slot from `layout_item_top.csv`. Manage Items opens the loadout screen
 * (M8-10_1); BFR has no item selling or crafting.
 */
export const ITEM_MENU_BUTTONS: readonly ItemMenuButton[] = [
  { label: "View Items", art: "item_top/item_box_btn", href: ITEM_LIST_PATH },
  { label: "Manage Items", art: "item_top/item_edit_btn", href: ITEM_MANAGE_PATH },
  { label: "Sell Items", art: "item_top/item_sell_btn", href: null },
  { label: "Synthesis", art: "item_top/item_mix_btn", href: null },
];

/** A thumb's backing and its rarity-coloured frame: green for battle items, orange materials. */
export const ITEM_THUMB_BASE: OriginalAsset = "common/item_frame_bg.png";
export const ITEM_THUMB_FRAME: Record<"battle" | "material", OriginalAsset> = {
  battle: "common/item_frame_1.png",
  material: "common/item_frame_2.png",
};

/** Every original piece the Items screens draw (for the asset-existence test). */
export const ITEM_SCREEN_ASSETS: readonly string[] = [
  ITEM_BACKDROP,
  ...[1, 2].flatMap((state) => [
    `${ITEM_MENU_BASE}${state}.png`,
    ...ITEM_MENU_BUTTONS.map((button) => `${button.art}${state}.png`),
  ]),
  ITEM_THUMB_BASE,
  ...Object.values(ITEM_THUMB_FRAME),
];

/**
 * Manage Items' pieces (M8-10_1; layouts/items_manage.json, from `layout_item_edit_top.csv`):
 * the five-slot frame over its dark backing, the Equip caption, and the `sub_m_btn` label
 * overlays. `href: null` buttons render disabled: BFR has no Village of the Venturer or crafting.
 */
export const ITEM_MANAGE_FRAME = {
  backing: "item_edit/item_frame_edit_bg.png",
  frame: "item_edit/item_frame_edit.png",
  caption: "item_edit/item_frame_edit_label.png",
} as const satisfies Record<string, OriginalAsset>;

export const ITEM_MANAGE_BASE = "common/button/sub_m_btn";

export type ItemManageButton = {
  label: string;
  art: string;
  /** Fill Up / Reset act on the loadout; null is a disabled destination ("Coming soon"). */
  action: "fill" | "reset" | null;
};

/** Fill Up, Reset, Village of the Venturer, Synthesis: screen (70 / 366, 727) and (70 / 369, 857). */
export const ITEM_MANAGE_BUTTONS: readonly ItemManageButton[] = [
  { label: "Fill Up", art: "item_edit/full_tank_btn_label", action: "fill" },
  { label: "Reset", art: "item_edit/reset_btn_label", action: "reset" },
  { label: "Village of the Venturer", art: "item_edit/mytown_btn_label", action: null },
  { label: "Synthesis", art: "mytown_item_mix/mix_btn_label", action: null },
];

/** The slot picker's English Select caption over `sub_s_btn`. */
export const ITEM_PICK_SELECT = "common/button/label/sub_s_btn_decide_label";

/** Every original piece Manage Items draws (for the asset-existence test). */
export const ITEM_MANAGE_ASSETS: readonly string[] = [
  ITEM_BACKDROP,
  ...Object.values(ITEM_MANAGE_FRAME),
  "common/page_feed_arrow_l.png",
  "common/page_feed_arrow_r.png",
  ...[1, 2].flatMap((state) => [
    `${ITEM_MANAGE_BASE}${state}.png`,
    ...ITEM_MANAGE_BUTTONS.map((button) => `${button.art}${state}.png`),
    `${ITEM_PICK_SELECT}${state}.png`,
    `common/button/sub_s_btn${state}.png`,
    `common/button/sub_s_r_btn${state}.png`,
    `common/button/sub_ss_btn${state}.png`,
  ]),
  ITEM_THUMB_BASE,
  ITEM_THUMB_FRAME.battle,
];

/** All item content, battle items first (the original's Type order), then materials. */
export const ALL_ITEMS: readonly ItemContent[] = [
  bitterleaf,
  brightTonic,
  dewTonic,
  grandTonic,
  rekindleAsh,
  valorDraught,
  crownShard,
  zenithCore,
].map((json) => ItemContentSchema.parse(json));

export type ItemStockRow = { item_id: string; count: number };

export type ItemEntry = {
  id: string;
  name: string;
  description: string;
  kind: "battle" | "material";
  count: number;
  icon: UiAsset | null;
};

/** The player's owned items (count above zero) in the list's order; unknown IDs are dropped. */
export function itemEntries(stock: readonly ItemStockRow[]): ItemEntry[] {
  const entries: ItemEntry[] = [];
  for (const item of ALL_ITEMS) {
    const count = Number(stock.find((row) => row.item_id === item.id)?.count ?? 0);
    if (count < 1) continue;
    entries.push({
      id: item.id,
      name: item.name,
      description: item.description ?? "",
      kind: item.kind === "material" ? "material" : "battle",
      count,
      icon: itemIcon(item.id),
    });
  }
  return entries;
}
