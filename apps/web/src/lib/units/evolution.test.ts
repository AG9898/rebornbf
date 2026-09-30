import { describe, expect, it } from "vitest";
import {
  evolutionPlan,
  evolveErrorMessage,
  materialItemName,
  materialUnitName,
  nextEvolution,
} from "./evolution.ts";
import type { OwnedUnitRow } from "./owned-units.ts";

const TARGET = "00000000-0000-4000-8000-000000000001";
let seq = 100;

function unit(unitId: string, overrides: Partial<OwnedUnitRow> = {}): OwnedUnitRow {
  seq += 1;
  const id = `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
  return { id, unit_id: unitId, form_id: `${unitId}-3`, level: 1, exp: 0, ...overrides };
}

const brand3: OwnedUnitRow = {
  id: TARGET,
  unit_id: "brand",
  form_id: "brand-3",
  level: 40,
  exp: 0,
};

describe("nextEvolution", () => {
  it("finds the current form's recipe and next form", () => {
    const evolution = nextEvolution(brand3);
    expect(evolution?.form.id).toBe("brand-3");
    expect(evolution?.next.id).toBe("brand-4");
    expect(evolution?.recipe.zel).toBe(100000);
  });

  it("is null for the last form, a form without a recipe, and unknown content", () => {
    expect(nextEvolution({ unit_id: "brand", form_id: "brand-omni" })).toBeNull();
    expect(nextEvolution({ unit_id: "brand", form_id: "brand-2" })).toBeNull();
    expect(nextEvolution({ unit_id: "nobody", form_id: "nobody-3" })).toBeNull();
  });
});

describe("evolutionPlan (M4-02C)", () => {
  it("is ready when level, materials, and Zel are met, and picks the materials", () => {
    const effigy = unit("cinder-effigy");
    const sprite = unit("cinder-sprite", { form_id: "cinder-sprite-2" });
    const plan = evolutionPlan(brand3, [brand3, effigy, sprite], [], [], 100000);
    expect(plan).toMatchObject({
      from: { id: "brand-3", rarityLabel: "3★", maxLevel: 40 },
      next: {
        id: "brand-4",
        rarityLabel: "4★",
        illustration: "/assets/units/brand/illustration-4star.png",
      },
      omni: false,
      levelReady: true,
      zel: 100000,
      problems: [],
    });
    expect(plan?.units).toEqual([
      { unitId: "cinder-effigy", name: "Cinder Effigy", count: 1, owned: 1, inSquad: 0 },
      { unitId: "cinder-sprite", name: expect.any(String), count: 1, owned: 1, inSquad: 0 },
    ]);
    expect(plan?.materialIds).toEqual([effigy.id, sprite.id]);
  });

  it("lists every shortfall: level, missing materials, squad-locked copies, and Zel", () => {
    const locked = unit("cinder-effigy");
    const plan = evolutionPlan(
      { ...brand3, level: 12 },
      [brand3, locked],
      [{ unit_ids: [locked.id], ally_unit_id: null }],
      [],
      40000,
    );
    expect(plan?.levelReady).toBe(false);
    expect(plan?.units[0]).toMatchObject({ owned: 0, inSquad: 1 });
    expect(plan?.problems).toEqual([
      "Reach level 40 first.",
      "Take Cinder Effigy out of your squads first.",
      `Needs 1 more ${materialUnitName("cinder-sprite")}.`,
      "Needs 60,000 more Zel.",
    ]);
    expect(plan?.materialIds).toEqual([]);
  });

  it("never spends the unit itself or the ally, and picks the lowest-level copies first", () => {
    const motes = [unit("cinder-mote", { level: 5 }), unit("cinder-mote"), unit("cinder-mote")];
    const ally = unit("cinder-mote");
    const brand4: OwnedUnitRow = { ...brand3, form_id: "brand-4", level: 60 };
    const plan = evolutionPlan(
      brand4,
      [brand4, ...motes, ally],
      [{ unit_ids: [], ally_unit_id: ally.id }],
      [],
      0,
    );
    const mote = plan?.units.find((need) => need.unitId === "cinder-mote");
    expect(mote).toMatchObject({ count: 2, owned: 3, inSquad: 1 });
    expect(plan?.materialIds).toEqual([motes[1]?.id, motes[2]?.id]);
    expect(plan?.materialIds).not.toContain(brand4.id);
  });

  it("checks the Crown Shard and Zenith Core for the 7★ → Omni evolution", () => {
    const brand7: OwnedUnitRow = { ...brand3, form_id: "brand-7", level: 120 };
    const plan = evolutionPlan(brand7, [brand7], [], [{ item_id: "crown-shard", count: 1 }], 0);
    expect(plan?.omni).toBe(true);
    expect(plan?.next).toMatchObject({ id: "brand-omni", rarityLabel: "Omni" });
    expect(plan?.items).toEqual([
      { itemId: "crown-shard", name: "Crown Shard", count: 1, owned: 1 },
      { itemId: "zenith-core", name: materialItemName("zenith-core"), count: 1, owned: 0 },
    ]);
    expect(plan?.problems).toContain(`Needs 1 more ${materialItemName("zenith-core")}.`);
  });

  it("names every material unit and item in every launch recipe", () => {
    for (const unitId of [
      "brand",
      "maren",
      "rook",
      "garrick",
      "solen",
      "morrick",
      "aurelle",
      "vespera",
    ]) {
      for (const rarity of [3, 4, 5, 6, 7]) {
        const evolution = nextEvolution({ unit_id: unitId, form_id: `${unitId}-${rarity}` });
        for (const need of evolution?.recipe.units ?? []) {
          expect(materialUnitName(need.unit)).not.toBe(need.unit);
        }
        for (const need of evolution?.recipe.items ?? []) {
          expect(materialItemName(need.item)).not.toBe(need.item);
        }
      }
    }
  });
});

describe("evolveErrorMessage", () => {
  it("shows the RPC's validation and Zel messages and hides anything else", () => {
    expect(evolveErrorMessage("22023", "evolve: the unit must be at max level (40)")).toBe(
      "The unit must be at max level (40)",
    );
    expect(evolveErrorMessage("P0001", "evolve: not enough Zel (costs 100000)")).toBe(
      "Not enough Zel (costs 100000)",
    );
    expect(evolveErrorMessage("42501", "evolve: not signed in")).toBe(
      "The evolution could not be completed.",
    );
  });
});
