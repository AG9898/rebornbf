/**
 * The Units sort screen's Filter tab (M8-04_1, RESOLVED-98; ART_GUIDE -> UI -> Units list and sort
 * screen): the original's option rows, the filters BFR has data for, their URL form, and the list
 * filter itself. Positions are the original's `layout_unit_filter.csv` (content/_dlcbundle/),
 * recorded in art/original/layouts/unit_filter.json.
 */
import type { Element } from "@bfr/data";
import type { UnitType } from "@bfr/engine";
import type { OriginalAsset } from "../original/original-assets.ts";
import { type UnitSortKey, unitContent } from "./owned-units.ts";
import { type UnitPickMode, unitListHref } from "./unit-hub.ts";
import type { CollectionEntry } from "./unit-stacks.ts";

/** The filters BFR has data for; each is one URL parameter holding a comma list of values. */
export type FilterGroup = "element" | "rarity" | "kind" | "level" | "type" | "squad";

export const FILTER_PARAMS: Readonly<Record<FilterGroup, string>> = {
  element: "el",
  rarity: "rar",
  kind: "kind",
  level: "lv",
  type: "type",
  squad: "squad",
};

/** The base under an option: orb (sub_sss, 98x84), star (sub_ssss2, 74x84), or text (sub_ss, 151x84). */
export type FilterBase = "orb" | "star" | "text";

export const FILTER_BASES: Readonly<Record<FilterBase, readonly [OriginalAsset, OriginalAsset]>> = {
  orb: ["common/button/sub_sss_option_btn1.png", "common/button/sub_sss_option_btn2.png"],
  star: ["common/button/sub_ssss2_option_btn1.png", "common/button/sub_ssss2_option_btn2.png"],
  text: ["common/button/sub_ss_option_btn1.png", "common/button/sub_ss_option_btn2.png"],
};

export const FILTER_BASE_SIZE: Readonly<Record<FilterBase, readonly [number, number]>> = {
  orb: [98, 84],
  star: [74, 84],
  text: [151, 84],
};

export type FilterOption = {
  label: string;
  /** The label piece without its `1.png` (lit) / `2.png` (dim) suffix. */
  art: string;
  base: FilterBase;
  /** Left edge in screen px. */
  x: number;
  /** The BFR filter and value it toggles; null for an original filter BFR has no data for. */
  group: FilterGroup | null;
  value: string | null;
  /** A separate 137x54 label piece, centred on its 151x84 base. */
  small?: true;
  /** The dim piece is misprinted in the archive (Has SBB reads "Has UBB"); draw the lit one. */
  litOnly?: true;
};

export type FilterRow = {
  /** Top edge inside the scroll area (the CSV's y less its 100 px origin). */
  y: number;
  options: readonly FilterOption[];
};

const LABEL_DIR = "common/button/label/sub_option_btn_filter_label";
const SMALL_LABEL = (name: string) => `common/button/label/sub_option_btn_sort_${name}_label`;

/** The filter label piece in its lit or dim state. */
export function filterLabelAsset(option: FilterOption, lit: boolean): OriginalAsset {
  return `${option.art}${lit || option.litOnly ? 1 : 2}.png` as OriginalAsset;
}

const TEXT_X = [16, 167, 318, 469] as const;

function textRow(
  y: number,
  options: readonly (readonly [label: string, art: string, group?: FilterGroup, value?: string])[],
): FilterRow {
  return {
    y,
    options: options.map(([label, art, group, value], i) => ({
      label,
      art: art.startsWith("common/") ? art : `${LABEL_DIR}/${art}`,
      base: "text",
      x: TEXT_X[i] ?? 0,
      group: group ?? null,
      value: value ?? null,
      ...(art.startsWith("common/") ? { small: true as const } : {}),
      ...(art === "has_sbb" ? { litOnly: true as const } : {}),
    })),
  };
}

const ELEMENTS: readonly Element[] = ["fire", "water", "earth", "thunder", "light", "dark"];
const ELEMENT_X = [16, 117, 218, 318, 419, 523] as const;
const RARITIES = ["1", "2", "3", "4", "5", "6", "7", "omni"] as const;

/**
 * The Filter tab's rows in the original's order. Live: element, rarity, Normal / Evolution /
 * Enhancing, MAX / Not MAX, the six unit types, and In Squad / Not In Squad. Everything else
 * (Sale, imps, spheres, burst kinds, gender, favourites, DBB, Elgifs, Golems) has no BFR data and
 * renders disabled.
 */
export const FILTER_ROWS: readonly FilterRow[] = [
  {
    y: 0,
    options: ELEMENTS.map((element, i) => ({
      label: element[0]?.toUpperCase() + element.slice(1),
      art: `${LABEL_DIR}/${element}`,
      base: "orb",
      x: ELEMENT_X[i] ?? 0,
      group: "element",
      value: element,
    })),
  },
  {
    y: 84,
    options: RARITIES.map((rarity, i) => ({
      label: rarity === "omni" ? "Omni" : `${rarity}★`,
      art: `${LABEL_DIR}/${rarity === "omni" ? "omni" : `${rarity}star`}`,
      base: "star",
      x: 16 + 76 * i,
      group: "rarity",
      value: rarity,
    })),
  },
  textRow(168, [
    ["Normal", "normal", "kind", "normal"],
    ["Evolution", "evolution", "kind", "evolution"],
    ["Enhancing", "enhancing", "kind", "enhancing"],
    ["Sale", "sale"],
  ]),
  textRow(252, [
    ["MAX", "max", "level", "max"],
    ["Not MAX", "not_max", "level", "notmax"],
  ]),
  textRow(336, [
    ["Imp Fused", "imp_fused"],
    ["Not Imp Fused", "not_imp_fused"],
    ["Parameters MAX", "parameters_max"],
  ]),
  textRow(420, [
    ["Sphere", "sphere"],
    ["No Sphere", "no_sphere"],
    ["1 Sphere", "sphere_1"],
    ["2 Sphere", "sphere_2"],
  ]),
  textRow(504, [
    ["Atk BB", "atk_bb"],
    ["Rec BB", "rec_bb"],
    ["Buff BB", "buff_bb"],
  ]),
  textRow(588, [
    ["Has SBB", "has_sbb"],
    ["Has UBB", "has_ubb"],
    ["Has EX Skill", "has_ex_skill"],
    ["Enhanced", "enhanced"],
  ]),
  textRow(673, [
    ["Male", "male"],
    ["Female", "female"],
    ["Genderless", "genderless"],
  ]),
  textRow(757, [
    ["Anima", "anima", "type", "anima"],
    ["Breaker", "breaker", "type", "breaker"],
    ["Guardian", "guardian", "type", "guardian"],
    ["Oracle", "oracle", "type", "oracle"],
  ]),
  textRow(842, [
    ["Lord", "lord", "type", "lord"],
    ["Rex", SMALL_LABEL("unittype6"), "type", "rex"],
  ]),
  textRow(926, [
    ["Favorite", "favorite"],
    ["Not Favorited", "not_favorited"],
  ]),
  textRow(1010, [
    ["In Squad", "in_squad", "squad", "in"],
    ["Not In Squad", "not_in_squad", "squad", "out"],
  ]),
  textRow(1094, [
    ["DBB Unlocked", SMALL_LABEL("dbb_unlock")],
    ["DBB Locked", SMALL_LABEL("dbb_lock")],
    ["DBB Only", SMALL_LABEL("dbb_only")],
  ]),
  textRow(1195, [
    ["Not Elgifs", "not_elgifs"],
    ["Not Emgifs", "not_emgifs"],
    ["Not Golems", SMALL_LABEL("notgolems")],
    ["Golems Only", SMALL_LABEL("golemsonly")],
  ]),
  textRow(1277, [
    ["Elgif Only", "elgif_only"],
    ["Emgif Only", "emgif_only"],
    ["Elgif Details", "elgif_details"],
    ["Equipped Elgifs", "equipped_elgifs"],
  ]),
];

/** Height of the scrolled rows (the last row's bottom plus the CSV's bottom margin). */
export const FILTER_SCROLL_HEIGHT = 1277 + 84 + 16;

/** Every live value per filter, in the tab's order. */
export const FILTER_VALUES: Readonly<Record<FilterGroup, readonly string[]>> = (() => {
  const values: Record<FilterGroup, string[]> = {
    element: [],
    rarity: [],
    kind: [],
    level: [],
    type: [],
    squad: [],
  };
  for (const row of FILTER_ROWS) {
    for (const option of row.options) {
      if (option.group && option.value) values[option.group].push(option.value);
    }
  }
  return values;
})();

const GROUPS = Object.keys(FILTER_PARAMS) as FilterGroup[];

/**
 * An applied filter: per group, the values a unit may have. A group that is absent does not
 * filter; a group never holds every value or none (both mean "no filter" and are dropped).
 */
export type UnitFilter = Partial<Record<FilterGroup, readonly string[]>>;

/** The applied filter for each group's lit values (`lit` holds `"group:value"` keys). */
export function filterFromSelection(lit: ReadonlySet<string>): UnitFilter {
  const filter: UnitFilter = {};
  for (const group of GROUPS) {
    const all = FILTER_VALUES[group];
    const chosen = all.filter((value) => lit.has(optionKey(group, value)));
    if (chosen.length > 0 && chosen.length < all.length) filter[group] = chosen;
  }
  return filter;
}

/** The lit options for an applied filter: a group it leaves out has every value lit. */
export function selectionFromFilter(filter: UnitFilter): Set<string> {
  const lit = new Set<string>();
  for (const group of GROUPS) {
    for (const value of filter[group] ?? FILTER_VALUES[group]) lit.add(optionKey(group, value));
  }
  return lit;
}

/** Every live option lit (Select All). */
export function allFilterKeys(): Set<string> {
  return selectionFromFilter({});
}

export function optionKey(group: FilterGroup, value: string): string {
  return `${group}:${value}`;
}

export function hasFilter(filter: UnitFilter): boolean {
  return GROUPS.some((group) => (filter[group]?.length ?? 0) > 0);
}

/** A filter from the list or sort screen's search params; unknown values are dropped. */
export function parseUnitFilter(
  params: Readonly<Record<string, string | string[] | undefined>>,
): UnitFilter {
  const lit = new Set<string>();
  for (const group of GROUPS) {
    const raw = params[FILTER_PARAMS[group]];
    const text = Array.isArray(raw) ? raw[0] : raw;
    const values = new Set((text ?? "").split(",").filter((v) => FILTER_VALUES[group].includes(v)));
    for (const value of values.size > 0 ? values : FILTER_VALUES[group]) {
      lit.add(optionKey(group, value));
    }
  }
  return filterFromSelection(lit);
}

function withFilter(href: string, filter: UnitFilter): string {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  for (const group of GROUPS) {
    const values = filter[group];
    if (values && values.length > 0) params.set(FILTER_PARAMS[group], values.join(","));
  }
  const text = params.toString().replaceAll("%2C", ",");
  return text ? `${path}?${text}` : (path ?? href);
}

/** The All Units URL for a sort, pick mode, and filter (defaults left out). */
export function unitListFilterHref(
  sort: UnitSortKey,
  pick: UnitPickMode | null,
  filter: UnitFilter,
): string {
  return withFilter(unitListHref(sort, pick), filter);
}

/** Append a filter's parameters to any list-shaped URL (the sort screen's). */
export function hrefWithFilter(href: string, filter: UnitFilter): string {
  return withFilter(href, filter);
}

/** What kind of unit an entry is, as the original's Normal / Evolution / Enhancing filter. */
export function unitKind(entry: Pick<CollectionEntry, "unitId" | "formId">): string {
  const unit = unitContent(entry.unitId);
  if (!unit?.stackable) return "normal";
  const form = unit.forms.find((f) => f.id === entry.formId);
  // The fodder picker's material rule (fusion-stage.ts): level-1-only, no fixed EXP or effect.
  return form?.maxLevel === 1 && form.fusionExp === undefined && form.fusionEffect === undefined
    ? "evolution"
    : "enhancing";
}

/** What the filter reads from the page besides the entry itself. */
export type FilterContext = {
  /** `owned_units` ids in any saved squad. */
  party: ReadonlySet<string>;
  /** Each owned row's type roll; rows missing here (stacks, units that never roll) are Lord. */
  types: ReadonlyMap<string, UnitType>;
};

function entryValue(entry: CollectionEntry, group: FilterGroup, context: FilterContext): string {
  switch (group) {
    case "element":
      return entry.element ?? "";
    case "rarity":
      return entry.rarity === null ? "" : String(entry.rarity);
    case "kind":
      return unitKind(entry);
    case "level":
      return entry.maxLevel !== null && entry.level >= entry.maxLevel ? "max" : "notmax";
    case "type":
      return context.types.get(entry.id) ?? "lord";
    case "squad":
      return entry.stackCount === null && context.party.has(entry.id) ? "in" : "out";
  }
}

/** The entries an applied filter keeps, in their order. */
export function filterEntries<T extends CollectionEntry>(
  entries: readonly T[],
  filter: UnitFilter,
  context: FilterContext,
): T[] {
  const groups = GROUPS.filter((group) => (filter[group]?.length ?? 0) > 0);
  if (groups.length === 0) return [...entries];
  return entries.filter((entry) =>
    groups.every((group) => filter[group]?.includes(entryValue(entry, group, context))),
  );
}

/** The list's Remove Filter tile (shown as the grid's last cell while a filter is applied). */
export const REMOVE_FILTER: readonly [OriginalAsset, OriginalAsset] = [
  "common/remove_filter_1.png",
  "common/remove_filter_2.png",
];

/** The Filter tab's own buttons: Clear Selection and Select All share the red `sub_s_r_btn`. */
export const FILTER_TAB_ASSETS = {
  sortTab: "sort/sort_header_tab1_2.png",
  sortTabLit: "sort/sort_header_tab1_1.png",
  filterTab: "sort/sort_header_tab2_2.png",
  filterTabLit: "sort/sort_header_tab2_1.png",
  red: ["common/button/sub_s_r_btn1.png", "common/button/sub_s_r_btn2.png"],
} as const satisfies Record<string, OriginalAsset | readonly OriginalAsset[]>;

/** Every original asset the Filter tab and Remove Filter tile draw (checked in tests). */
export function unitFilterScreenAssets(): string[] {
  const options = FILTER_ROWS.flatMap((row) => row.options);
  return [
    ...options.flatMap((option) => [
      filterLabelAsset(option, true),
      filterLabelAsset(option, false),
    ]),
    ...Object.values(FILTER_BASES).flat(),
    ...REMOVE_FILTER,
    ...Object.values(FILTER_TAB_ASSETS).flat(),
  ];
}
