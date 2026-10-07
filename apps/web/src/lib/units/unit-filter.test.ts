import { describe, expect, it } from "vitest";
import { ORIGINAL_ASSETS } from "../original/original-assets.ts";
import {
  allFilterKeys,
  FILTER_ROWS,
  FILTER_VALUES,
  filterEntries,
  filterFromSelection,
  hasFilter,
  optionKey,
  parseUnitFilter,
  selectionFromFilter,
  unitFilterScreenAssets,
  unitKind,
  unitListFilterHref,
} from "./unit-filter.ts";
import { unitSortHref } from "./unit-list-screen.ts";
import type { CollectionEntry } from "./unit-stacks.ts";

function entry(overrides: Partial<CollectionEntry>): CollectionEntry {
  return {
    id: "row",
    unitId: "brand",
    formId: "brand-3",
    name: "Brand",
    formName: null,
    quote: null,
    element: "fire",
    rarity: 3,
    rarityLabel: "3★",
    level: 1,
    maxLevel: 40,
    exp: 0,
    stats: null,
    currentStats: null,
    illustration: null,
    sprite: null,
    thumb: null,
    stackCount: null,
    ...overrides,
  };
}

const context = { party: new Set(["squadded"]), types: new Map([["anima-row", "anima" as const]]) };

describe("Units Filter tab (M8-04_1)", () => {
  it("names only imported original assets", () => {
    const missing = unitFilterScreenAssets().filter((asset) => !(asset in ORIGINAL_ASSETS));
    expect(missing).toEqual([]);
  });

  it("lays out the original's rows with the live filters BFR has data for", () => {
    expect(FILTER_ROWS.map((row) => row.options.length)).toEqual([
      6, 8, 4, 2, 3, 4, 3, 4, 3, 4, 2, 2, 2, 3, 4, 4,
    ]);
    expect(FILTER_VALUES).toEqual({
      element: ["fire", "water", "earth", "thunder", "light", "dark"],
      rarity: ["1", "2", "3", "4", "5", "6", "7", "omni"],
      kind: ["normal", "evolution", "enhancing"],
      level: ["max", "notmax"],
      type: ["anima", "breaker", "guardian", "oracle", "lord", "rex"],
      squad: ["in", "out"],
    });
    const disabled = FILTER_ROWS.flatMap((row) => row.options).filter((o) => o.group === null);
    expect(disabled.map((o) => o.label)).toContain("Sale");
    expect(disabled.map((o) => o.label)).toContain("Favorite");
  });

  it("drops a group with every value or none lit", () => {
    expect(filterFromSelection(allFilterKeys())).toEqual({});
    expect(filterFromSelection(new Set())).toEqual({});
    const lit = allFilterKeys();
    lit.delete(optionKey("element", "water"));
    lit.delete(optionKey("squad", "out"));
    expect(filterFromSelection(lit)).toEqual({
      element: ["fire", "earth", "thunder", "light", "dark"],
      squad: ["in"],
    });
  });

  it("round-trips a filter through the list and sort URLs, keeping sort and pick", () => {
    const filter = { element: ["fire", "water"], rarity: ["omni"] };
    const href = unitListFilterHref("level", "evolve", filter);
    expect(href).toBe("/units/list?sort=level&pick=evolve&el=fire,water&rar=omni");
    expect(unitSortHref("level", "evolve", filter)).toBe(
      "/units/list/sort?sort=level&pick=evolve&el=fire,water&rar=omni",
    );
    const params = Object.fromEntries(new URL(href, "https://x").searchParams);
    expect(parseUnitFilter(params)).toEqual(filter);
    expect(selectionFromFilter(filter).has(optionKey("element", "earth"))).toBe(false);
    expect(unitListFilterHref("rarity", null, {})).toBe("/units/list");
  });

  it("ignores unknown values and full groups in the URL", () => {
    expect(parseUnitFilter({ el: "fire,bogus", lv: "max,notmax", kind: "nope" })).toEqual({
      element: ["fire"],
    });
    expect(hasFilter(parseUnitFilter({}))).toBe(false);
  });

  it("sorts units into the original's Normal / Evolution / Enhancing kinds", () => {
    expect(unitKind({ unitId: "brand", formId: "brand-3" })).toBe("normal");
    expect(unitKind({ unitId: "cinder-mote", formId: "cinder-mote-1" })).toBe("evolution");
    expect(unitKind({ unitId: "cinder-flask", formId: "cinder-flask-3" })).toBe("enhancing");
  });

  it("keeps only the entries every filtered group matches", () => {
    const entries = [
      entry({ id: "squadded", level: 40 }),
      entry({ id: "anima-row", element: "water" }),
      entry({ id: "stack", element: "fire", stackCount: 3, rarity: "omni" }),
    ];
    const ids = (filter: Parameters<typeof filterEntries>[1]) =>
      filterEntries(entries, filter, context).map((e) => e.id);
    expect(ids({})).toEqual(["squadded", "anima-row", "stack"]);
    expect(ids({ element: ["fire"] })).toEqual(["squadded", "stack"]);
    expect(ids({ level: ["max"] })).toEqual(["squadded"]);
    expect(ids({ squad: ["out"] })).toEqual(["anima-row", "stack"]);
    expect(ids({ type: ["anima"] })).toEqual(["anima-row"]);
    expect(ids({ type: ["lord"], rarity: ["omni"] })).toEqual(["stack"]);
  });
});
