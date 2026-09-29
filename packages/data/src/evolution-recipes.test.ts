import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ItemSchema, MaterialItemSchema } from "./schemas/item.ts";
import { type EvolutionRecipe, UnitSchema } from "./schemas/unit.ts";

/**
 * Reference tests for transcribed evolution recipes (GAME_DESIGN §6 → Evolution materials,
 * RESOLVED-66/67). Each expected recipe is the homage form page's `evomats` / `evoitem` /
 * `evozelcost`, mapped to BFR materials (ROSTER.md → Evolution materials), keyed by the form that
 * evolves. Materials keep the page's order.
 */

const unitsDir = join(import.meta.dirname, "..", "content", "units");
const itemsDir = join(import.meta.dirname, "..", "content", "items");

function recipesOf(id: string): Record<string, EvolutionRecipe | undefined> {
  const unit = UnitSchema.parse(JSON.parse(readFileSync(join(unitsDir, `${id}.json`), "utf8")));
  return Object.fromEntries(unit.forms.map((form) => [form.id, form.evolution]));
}

const one = (unit: string) => ({ unit, count: 1 });

describe("Brand evolution recipes (M4-02E)", () => {
  // Source: bravefrontierglobal.fandom.com form pages of Brand's homage unit (ROSTER.md), read 2026-09-29. Homage IDs:
  // 10130 Fire Nymph → cinder-mote, 10131 Fire Spirit → cinder-sprite, 10132 Fire Idol →
  // cinder-effigy, 10133 Fire Totem → cinder-cairn, 10354 Fire Mecha God → cinder-colossus,
  // 50354 Miracle Totem → prism-cairn, Legend Stone → crown-shard. The Zenith Core is BFR's own
  // Omni key material (RESOLVED-69) with no homage.
  const recipes = recipesOf("brand");

  it("has no 2★→3★ recipe (starters are granted from 3★) and none on the last (Omni) form", () => {
    expect(recipes["brand-2"]).toBeUndefined();
    expect(recipes["brand-omni"]).toBeUndefined();
  });

  it("Forge Hand 3★→4★: cinder effigy, cinder sprite, 100,000 Zel", () => {
    expect(recipes["brand-3"]).toEqual({
      units: [one("cinder-effigy"), one("cinder-sprite")],
      zel: 100_000,
    });
  });

  it("Forge Guard 4★→5★: cinder cairn, effigy, sprite, mote ×2, 200,000 Zel", () => {
    expect(recipes["brand-4"]).toEqual({
      units: [
        one("cinder-cairn"),
        one("cinder-effigy"),
        one("cinder-sprite"),
        { unit: "cinder-mote", count: 2 },
      ],
      zel: 200_000,
    });
  });

  it("Flame Guard 5★→6★: prism cairn, cinder cairn, effigy, sprite, mote, 500,000 Zel", () => {
    expect(recipes["brand-5"]).toEqual({
      units: [
        one("prism-cairn"),
        one("cinder-cairn"),
        one("cinder-effigy"),
        one("cinder-sprite"),
        one("cinder-mote"),
      ],
      zel: 500_000,
    });
  });

  it("Ember Knight 6★→7★: cinder colossus, prism cairn, cairn, effigy, Crown Shard, 1,500,000 Zel", () => {
    expect(recipes["brand-6"]).toEqual({
      units: [
        one("cinder-colossus"),
        one("prism-cairn"),
        one("cinder-cairn"),
        one("cinder-effigy"),
      ],
      items: [{ item: "crown-shard", count: 1 }],
      zel: 1_500_000,
    });
  });

  it("Forge Legend 7★→Omni (M4-02M): colossus ×2, prism cairn, cairn, effigy, sprite, mote, Crown Shard, Zenith Core, 3,000,000 Zel", () => {
    // Homage 7★ form page (RESOLVED-69 shape B0); the original's 1,000,000 Karma is dropped.
    expect(recipes["brand-7"]).toEqual({
      units: [
        { unit: "cinder-colossus", count: 2 },
        one("prism-cairn"),
        one("cinder-cairn"),
        one("cinder-effigy"),
        one("cinder-sprite"),
        one("cinder-mote"),
      ],
      items: [
        { item: "crown-shard", count: 1 },
        { item: "zenith-core", count: 1 },
      ],
      zel: 3_000_000,
    });
  });
});

describe("Zenith Core item (M4-02M)", () => {
  const data: unknown = JSON.parse(readFileSync(join(itemsDir, "zenith-core.json"), "utf8"));

  it("is a material item that cannot be used in battle", () => {
    expect(MaterialItemSchema.parse(data)).toMatchObject({ id: "zenith-core", kind: "material" });
    expect(ItemSchema.safeParse(data).success).toBe(false);
  });
});
