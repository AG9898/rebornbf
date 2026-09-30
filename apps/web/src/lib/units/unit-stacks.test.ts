import { describe, expect, it } from "vitest";
import type { OwnedUnitRow } from "./owned-units.ts";
import {
  collectionEntries,
  collectionHref,
  heldStacks,
  ownedCopyTotal,
  setStackQuantity,
  stackArgs,
  stackCopies,
  stackQuantitiesProblem,
  stackQuantityTotal,
  type UnitStackRow,
} from "./unit-stacks.ts";

const brand: OwnedUnitRow = {
  id: "00000000-0000-4000-8000-000000000001",
  unit_id: "brand",
  form_id: "brand-3",
  level: 12,
  exp: 0,
};
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const moss: UnitStackRow = { id: A, unit_id: "moss-sprite", form_id: "moss-sprite-2", count: 3 };
const flask: UnitStackRow = { id: B, unit_id: "cinder-flask", form_id: "cinder-flask-3", count: 9 };
const spent: UnitStackRow = { id: C, unit_id: "rill-sprite", form_id: "rill-sprite-2", count: 0 };

describe("Units list entries (M4-05C)", () => {
  it("shows every row and one tile per held stack, sorted together", () => {
    const entries = collectionEntries([brand], [moss, flask, spent]);
    expect(entries.map((e) => [e.unitId, e.stackCount])).toEqual([
      ["brand", null],
      ["cinder-flask", 9],
      ["moss-sprite", 3],
    ]);
    expect(entries.find((e) => e.id === A)).toMatchObject({ level: 1, element: "earth" });
  });

  it("counts every stacked copy in the owned total and skips spent stacks", () => {
    expect(heldStacks([moss, spent])).toEqual([moss]);
    expect(ownedCopyTotal([brand], [moss, flask, spent])).toBe(13);
    expect(ownedCopyTotal([], [])).toBe(0);
  });

  it("links rows to their detail page and stacks to the stack page", () => {
    expect(collectionHref({ id: brand.id, stackCount: null })).toBe(`/units/${brand.id}`);
    expect(collectionHref({ id: A, stackCount: 3 })).toBe(`/units/stack/${A}`);
  });

  it("names and frames stacks of evolution material units", () => {
    const [mote] = collectionEntries(
      [],
      [{ id: A, unit_id: "cinder-mote", form_id: "cinder-mote-1", count: 2 }],
    );
    expect(mote).toMatchObject({ name: "Cinder Mote", element: "fire", stackCount: 2 });
  });
});

describe("stack quantities", () => {
  it("clamps to the stack's copies and the copies left under the limit", () => {
    expect(setStackQuantity({}, moss, 2, 0)).toEqual({ [A]: 2 });
    expect(setStackQuantity({}, moss, 9, 0)).toEqual({ [A]: 3 });
    expect(setStackQuantity({}, flask, 9, 1)).toEqual({ [B]: 4 });
    expect(setStackQuantity({ [A]: 3 }, flask, 9, 1)).toEqual({ [A]: 3, [B]: 1 });
    expect(setStackQuantity({ [A]: 3 }, flask, 9, 2)).toEqual({ [A]: 3 });
    expect(setStackQuantity({ [A]: 3 }, moss, 1, 0)).toEqual({ [A]: 1 });
    expect(setStackQuantity({ [A]: 3, [B]: 1 }, moss, 0, 0)).toEqual({ [B]: 1 });
    expect(setStackQuantity({}, moss, -1, 0)).toEqual({});
  });

  it("totals quantities and builds the RPC argument", () => {
    expect(stackQuantityTotal({ [A]: 2, [B]: 3 })).toBe(5);
    expect(stackArgs({ [B]: 3, [A]: 2, [C]: 0 })).toEqual({ [A]: 2, [B]: 3 });
    expect(Object.keys(stackArgs({ [B]: 3, [A]: 2 }))).toEqual([A, B]);
  });

  it("rejects malformed stack arguments", () => {
    expect(stackQuantitiesProblem({ [A]: 2 })).toBeNull();
    expect(stackQuantitiesProblem({})).toBeNull();
    for (const bad of [null, [], "x", { x: 1 }, { [A]: 0 }, { [A]: 1.5 }, { [A]: "2" }]) {
      expect(stackQuantitiesProblem(bad)).toBe("Choose valid stacked units.");
    }
  });

  it("expands chosen copies into level-1 rows with distinct ids", () => {
    const copies = stackCopies([moss, flask], { [A]: 2 });
    expect(copies).toHaveLength(2);
    expect(new Set(copies.map((row) => row.id)).size).toBe(2);
    expect(copies[0]).toMatchObject({ unit_id: "moss-sprite", level: 1, exp: 0, unit_type: null });
  });
});
