import { describe, expect, it } from "vitest";
import {
  evolutionPlan,
  evolveBlockers,
  evolveErrorMessage,
  materialItemName,
  materialUnitName,
  nextEvolution,
} from "./evolution.ts";
import type { OwnedUnitRow } from "./owned-units.ts";

const TARGET = "00000000-0000-4000-8000-000000000001";
const STACK = "00000000-0000-4000-8000-00000000aaaa";
const EMPTY_STACK = "00000000-0000-4000-8000-00000000bbbb";
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
        sprite: "/assets/units/brand/battle-idle-4star.png",
      },
      omni: false,
      levelReady: true,
      zel: 100000,
      problems: [],
    });
    expect(plan?.units).toEqual([
      {
        unitId: "cinder-effigy",
        name: "Cinder Effigy",
        element: "fire",
        thumb: null, // no exported effigy art in the web content map yet
        count: 1,
        owned: 1,
        stacked: 0,
        inSquad: 0,
      },
      {
        unitId: "cinder-sprite",
        name: expect.any(String),
        element: "fire",
        thumb: "/assets/ui/cards/thumb/cinder-sprite-2star.webp",
        count: 1,
        owned: 1,
        stacked: 0,
        inSquad: 0,
      },
    ]);
    expect(plan?.materialIds).toEqual([effigy.id, sprite.id]);
    expect(plan?.materialStacks).toEqual({});
    expect(plan && evolveBlockers(plan)).toEqual([]);
  });

  it("spends stacked copies first and counts them as owned (M4-05C)", () => {
    const brand4: OwnedUnitRow = { ...brand3, form_id: "brand-4", level: 60 };
    const row = unit("cinder-mote");
    const stack = { id: STACK, unit_id: "cinder-mote", form_id: "cinder-mote-1", count: 1 };
    const empty = { id: EMPTY_STACK, unit_id: "cinder-mote", form_id: "cinder-mote-1", count: 0 };
    const plan = evolutionPlan(brand4, [brand4, row], [], [], 0, [empty, stack]);
    expect(plan?.units.find((need) => need.unitId === "cinder-mote")).toMatchObject({
      count: 2,
      owned: 2,
      stacked: 1,
    });
    expect(plan?.materialStacks).toEqual({ [STACK]: 1 });
    expect(plan?.materialIds).toEqual([row.id]);

    const plenty = evolutionPlan(brand4, [brand4, row], [], [], 0, [{ ...stack, count: 9 }]);
    expect(plenty?.materialStacks).toEqual({ [STACK]: 2 });
    expect(plenty?.materialIds).not.toContain(row.id);
    expect(plenty?.units.find((need) => need.unitId === "cinder-mote")?.owned).toBe(10);
  });

  it("lists every shortfall: level, missing materials, squad-locked copies, and Zel", () => {
    const locked = unit("cinder-effigy");
    const plan = evolutionPlan(
      { ...brand3, level: 12 },
      [brand3, locked],
      [{ unit_ids: [locked.id] }],
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
    expect(plan && evolveBlockers(plan)).toEqual([
      "Insufficient Units",
      "Insufficient Zel",
      "Insufficient Level",
    ]);
    expect(plan?.materialIds).toEqual([]);
  });

  it("never spends the unit itself or squad members, and picks the lowest-level copies first", () => {
    const motes = [unit("cinder-mote", { level: 5 }), unit("cinder-mote"), unit("cinder-mote")];
    const member = unit("cinder-mote");
    const brand4: OwnedUnitRow = { ...brand3, form_id: "brand-4", level: 60 };
    const plan = evolutionPlan(
      brand4,
      [brand4, ...motes, member],
      [{ unit_ids: [member.id] }],
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

describe("evolveBlockers (M4-06L)", () => {
  const ready = { levelReady: true, units: [], items: [], zel: 100, zelOwned: 100 };

  it("is empty when everything is met", () => {
    expect(evolveBlockers(ready)).toEqual([]);
  });

  it("reports a short material item as Insufficient Units and short Zel on its own", () => {
    expect(evolveBlockers({ ...ready, items: [{ owned: 0, count: 1 }] })).toEqual([
      "Insufficient Units",
    ]);
    expect(evolveBlockers({ ...ready, zelOwned: 99 })).toEqual(["Insufficient Zel"]);
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
