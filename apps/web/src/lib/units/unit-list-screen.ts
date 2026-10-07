/**
 * The original's Units list and sort screen (M8-04, RESOLVED-98; ART_GUIDE -> UI -> Units list and
 * sort screen): the pieces each screen names and the sort screen's option grid. Positions are in
 * art/original/layouts/unit_list.json and unit_sort.json.
 */
import type { OriginalAsset } from "../original/original-assets.ts";
import type { UnitSortKey } from "./owned-units.ts";
import { hrefWithFilter, type UnitFilter } from "./unit-filter.ts";
import { type UnitPickMode, unitListHref } from "./unit-hub.ts";

export const UNIT_SORT_PATH = "/units/list/sort";

/** The list title bar's red Filter button: a square base and its baked "Filter On" label. */
export const LIST_FILTER_BUTTON = {
  base: "common/button/sub_square2_r_btn",
  art: "common/button/label/sub_square2_r_btn_filter_label",
} as const;

/** Thumbnail overlays: PARTY over a squad member, Lv.MAX across a maxed unit's bottom edge. */
export const LIST_PARTY_ICON: OriginalAsset = "common/party_icon.png";
export const LIST_LV_MAX: OriginalAsset = "common/lv_max.png";

/** One sort-screen option: the label art stem and the BFR sort it applies, or null (no data). */
export type SortOption = {
  label: string;
  /** `common/button/label/sub_option_btn_sort_label/<art>{1,2}.png`: 1 lit, 2 dim. */
  art: string | null;
  sort: UnitSortKey | null;
};

const SORT_LABEL_DIR = "common/button/label/sub_option_btn_sort_label";

/** The label piece for an option in its lit (selected) or dim state. */
export function sortLabelAsset(art: string, lit: boolean): OriginalAsset {
  return `${SORT_LABEL_DIR}/${art}${lit ? 1 : 2}.png` as OriginalAsset;
}

/**
 * The option grid in the original's order, three per row. BFR sorts by element, level, rarity, and
 * name; the original's other keys have no BFR data and stay disabled. Name has no original label,
 * so it takes the empty last slot with its caption in code.
 */
export const SORT_OPTIONS: readonly SortOption[] = [
  { label: "Element", art: "element", sort: "element" },
  { label: "Level", art: "level", sort: "level" },
  { label: "Rarity", art: "rarity", sort: "rarity" },
  { label: "Cost", art: "cost", sort: null },
  { label: "HP", art: "hp", sort: null },
  { label: "Attack", art: "attack", sort: null },
  { label: "Defense", art: "defense", sort: null },
  { label: "Recovery", art: "recovery", sort: null },
  { label: "Acquired", art: "acquired", sort: null },
  { label: "BB Level", art: "bblv", sort: null },
  { label: "Sphere", art: "sphere", sort: null },
  { label: "Raised Stats", art: "raised_stats", sort: null },
  { label: "Favorited", art: "favorited", sort: null },
  { label: "SP", art: "sp", sort: null },
  { label: "Name", art: null, sort: "name" },
];

/** Option bases: selected (`sub_m_option_on_btn`) and not (`sub_m_option_btn3`, lit `1` pressed). */
export const SORT_OPTION_BASE = {
  on: {
    normal: "common/button/sub_m_option_on_btn1.png",
    pressed: "common/button/sub_m_option_on_btn2.png",
  },
  off: {
    normal: "common/button/sub_m_option_btn3.png",
    pressed: "common/button/sub_m_option_btn1.png",
  },
} as const satisfies Record<"on" | "off", Record<"normal" | "pressed", OriginalAsset>>;

/** The sort screen's fixed chrome. */
export const SORT_SCREEN_ASSETS = {
  tabBase: "sort/sort_header_tab_base.png",
  back: ["sort/sort_header_back_btn1.png", "sort/sort_header_back_btn2.png"],
  sortTab: "sort/sort_header_tab1_1.png",
  filterTab: "sort/sort_header_tab2_2.png",
  orderLit: "common/button/sub_s_option_btn1.png",
  orderDim: "common/button/sub_s_option_btn2.png",
  ascending: "common/button/label/sub_option_btn_sort_label/ascending1.png",
  descending: "common/button/label/sub_option_btn_sort_label/descending2.png",
  divider: "raid/raid_unit_header.png",
} as const satisfies Record<string, OriginalAsset | readonly OriginalAsset[]>;

/** The sort screen URL for the list's current sort, pick mode, and filter (M8-04_1). */
export function unitSortHref(
  sort: UnitSortKey,
  pick: UnitPickMode | null,
  filter: UnitFilter = {},
): string {
  const list = hrefWithFilter(unitListHref(sort, pick), filter);
  const query = list.indexOf("?");
  return query === -1 ? UNIT_SORT_PATH : `${UNIT_SORT_PATH}${list.slice(query)}`;
}

/** Every original asset the list and sort screens draw (checked against ORIGINAL_ASSETS in tests). */
export function unitListScreenAssets(): string[] {
  const options = SORT_OPTIONS.flatMap((option) =>
    option.art ? [sortLabelAsset(option.art, true), sortLabelAsset(option.art, false)] : [],
  );
  return [
    `${LIST_FILTER_BUTTON.base}1.png`,
    `${LIST_FILTER_BUTTON.base}2.png`,
    `${LIST_FILTER_BUTTON.art}1.png`,
    `${LIST_FILTER_BUTTON.art}2.png`,
    LIST_PARTY_ICON,
    LIST_LV_MAX,
    ...options,
    ...Object.values(SORT_OPTION_BASE).flatMap((base) => [base.normal, base.pressed]),
    ...Object.values(SORT_SCREEN_ASSETS).flat(),
  ];
}
