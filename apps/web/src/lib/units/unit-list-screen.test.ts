import { describe, expect, it } from "vitest";
import { ORIGINAL_ASSETS } from "../original/original-assets.ts";
import { UNIT_SORT_KEYS } from "./owned-units.ts";
import {
  SORT_OPTIONS,
  sortLabelAsset,
  UNIT_SORT_PATH,
  unitListScreenAssets,
  unitSortHref,
} from "./unit-list-screen.ts";

describe("Units list and sort screen (M8-04)", () => {
  it("names only imported original assets", () => {
    const missing = unitListScreenAssets().filter((asset) => !(asset in ORIGINAL_ASSETS));
    expect(missing).toEqual([]);
  });

  it("lays out the original's fourteen sort keys, then Name, with every BFR sort live", () => {
    expect(SORT_OPTIONS.map((option) => option.label)).toEqual([
      "Element",
      "Level",
      "Rarity",
      "Cost",
      "HP",
      "Attack",
      "Defense",
      "Recovery",
      "Acquired",
      "BB Level",
      "Sphere",
      "Raised Stats",
      "Favorited",
      "SP",
      "Name",
    ]);
    const live = SORT_OPTIONS.flatMap((option) => (option.sort ? [option.sort] : []));
    expect([...live].sort()).toEqual([...UNIT_SORT_KEYS].sort());
    expect(SORT_OPTIONS.filter((option) => option.art === null).map((o) => o.label)).toEqual([
      "Name",
    ]);
  });

  it("picks the lit or dim label piece", () => {
    expect(sortLabelAsset("element", true)).toBe(
      "common/button/label/sub_option_btn_sort_label/element1.png",
    );
    expect(sortLabelAsset("element", false)).toBe(
      "common/button/label/sub_option_btn_sort_label/element2.png",
    );
  });

  it("keeps the list's sort and pick mode in the sort screen URL", () => {
    expect(unitSortHref("rarity", null)).toBe(UNIT_SORT_PATH);
    expect(unitSortHref("level", null)).toBe("/units/list/sort?sort=level");
    expect(unitSortHref("name", "evolve")).toBe("/units/list/sort?sort=name&pick=evolve");
    expect(unitSortHref("rarity", "sphere")).toBe("/units/list/sort?pick=sphere");
  });
});
