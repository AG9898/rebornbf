import { describe, expect, it } from "vitest";
import type { OwnedUnitRow } from "./owned-units.ts";
import {
  canPick,
  nextPickerFilter,
  type PickRules,
  pickedCopies,
  pickerEntries,
  pickNumber,
  pickResult,
  setPickCopies,
  togglePick,
  type UnitPicks,
} from "./unit-picker.ts";
import { collectionEntries, type UnitStackRow } from "./unit-stacks.ts";

const row = (n: number, unit_id = "brand", form_id = "brand-3"): OwnedUnitRow => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  unit_id,
  form_id,
  level: 1,
  exp: 0,
});
const brand = row(1);
const maren = row(2, "maren", "maren-3");
const rook = row(3, "rook", "rook-3");
const garrick = row(4, "garrick", "garrick-3");
const STACK = "00000000-0000-4000-8000-00000000000a";
const moss: UnitStackRow = {
  id: STACK,
  unit_id: "moss-sprite",
  form_id: "moss-sprite-2",
  count: 3,
};

const entries = collectionEntries([brand, maren, rook, garrick], [moss]);
const tile = (id: string) => {
  const found = entries.find((entry) => entry.id === id);
  if (!found) throw new Error(`no tile ${id}`);
  return found;
};
const rules = (limit: number, ineligible: string[] = []): PickRules => ({
  limit,
  ineligible: new Set(ineligible),
});

/** Taps each tile in turn under `r`. */
function tap(ids: string[], r: PickRules, start: UnitPicks = []): UnitPicks {
  return ids.reduce((picks, id) => togglePick(picks, tile(id), r), start);
}

describe("multi-select picker: pick order (M4-06N)", () => {
  it("numbers picks in the order they were made", () => {
    const picks = tap([rook.id, brand.id, maren.id], rules(5));
    expect(pickNumber(picks, rook.id)).toBe(1);
    expect(pickNumber(picks, brand.id)).toBe(2);
    expect(pickNumber(picks, maren.id)).toBe(3);
    expect(pickNumber(picks, garrick.id)).toBeNull();
  });

  it("unpicking moves later badges up and a re-pick goes to the end", () => {
    const picks = tap([rook.id, brand.id, maren.id, rook.id], rules(5));
    expect(picks.map((pick) => pick.id)).toEqual([brand.id, maren.id]);
    const again = tap([rook.id], rules(5), picks);
    expect(pickNumber(again, rook.id)).toBe(3);
  });

  it("returns row ids in pick order", () => {
    const picks = tap([maren.id, brand.id], rules(5));
    expect(pickResult(picks, entries, rules(5))).toEqual({
      unitIds: [maren.id, brand.id],
      stacks: {},
    });
  });
});

describe("multi-select picker: the limit (M4-06N)", () => {
  it("refuses a pick past the limit", () => {
    const picks = tap([brand.id, maren.id, rook.id], rules(2));
    expect(picks.map((pick) => pick.id)).toEqual([brand.id, maren.id]);
    expect(canPick(picks, tile(rook.id), rules(2))).toBe(false);
  });

  it("counts stack copies against the limit and clamps the stepper", () => {
    const r = rules(4);
    let picks = tap([brand.id, STACK], r);
    picks = setPickCopies(picks, tile(STACK), 9, r);
    expect(picks.find((pick) => pick.id === STACK)?.copies).toBe(3);
    expect(pickedCopies(picks)).toBe(4);
    expect(canPick(picks, tile(maren.id), r)).toBe(false);
    picks = setPickCopies(picks, tile(STACK), 0, r);
    expect(pickNumber(picks, STACK)).toBeNull();
  });

  it("never returns more copies than the limit, even from oversized picks", () => {
    const forged: UnitPicks = [
      { id: brand.id, copies: 1 },
      { id: STACK, copies: 9 },
      { id: maren.id, copies: 1 },
    ];
    const result = pickResult(forged, entries, rules(3));
    expect(result).toEqual({ unitIds: [brand.id], stacks: { [STACK]: 2 } });
  });

  it("caps a stack at its held copies", () => {
    const result = pickResult([{ id: STACK, copies: 9 }], entries, rules(5));
    expect(result.stacks).toEqual({ [STACK]: 3 });
  });
});

describe("multi-select picker: ineligibility (M4-06N)", () => {
  it("never picks an ineligible unit", () => {
    const r = rules(5, [brand.id, STACK]);
    const picks = tap([brand.id, STACK, maren.id], r);
    expect(picks.map((pick) => pick.id)).toEqual([maren.id]);
    expect(canPick([], tile(brand.id), r)).toBe(false);
    expect(setPickCopies([{ id: STACK, copies: 1 }], tile(STACK), 2, r)).toEqual([
      { id: STACK, copies: 1 },
    ]);
  });

  it("drops ineligible and unknown ids from the result", () => {
    const picks: UnitPicks = [
      { id: brand.id, copies: 1 },
      { id: "00000000-0000-4000-8000-0000000000ff", copies: 1 },
      { id: maren.id, copies: 1 },
    ];
    expect(pickResult(picks, entries, rules(5, [brand.id]))).toEqual({
      unitIds: [maren.id],
      stacks: {},
    });
  });
});

describe("multi-select picker: sort and filter (M4-06N)", () => {
  it("filters by element and cycles back to all units", () => {
    expect(pickerEntries(entries, "name", "earth").every((e) => e.element === "earth")).toBe(true);
    expect(pickerEntries(entries, "name", null)).toHaveLength(entries.length);
    let filter = nextPickerFilter(null);
    expect(filter).toBe("fire");
    for (let i = 0; i < 6; i += 1) filter = nextPickerFilter(filter);
    expect(filter).toBeNull();
  });
});
