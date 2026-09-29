import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type EvolutionRecipe, UnitSchema } from "./schemas/unit.ts";

/**
 * Reference tests for transcribed evolution recipes (GAME_DESIGN §6 → Evolution materials,
 * RESOLVED-66/67). Each expected recipe is the homage form page's `evomats` / `evoitem` /
 * `evozelcost`, mapped to BFR materials (ROSTER.md → Evolution materials), keyed by the form that
 * evolves. Materials keep the page's order.
 */

const unitsDir = join(import.meta.dirname, "..", "content", "units");

function recipesOf(id: string): Record<string, EvolutionRecipe | undefined> {
  const unit = UnitSchema.parse(JSON.parse(readFileSync(join(unitsDir, `${id}.json`), "utf8")));
  return Object.fromEntries(unit.forms.map((form) => [form.id, form.evolution]));
}

const one = (unit: string) => ({ unit, count: 1 });

describe("Brand evolution recipes (M4-02E)", () => {
  // Source: bravefrontierglobal.fandom.com form pages of Brand's homage unit (ROSTER.md), read 2026-09-29. Homage IDs:
  // 10130 Fire Nymph → cinder-mote, 10131 Fire Spirit → cinder-sprite, 10132 Fire Idol →
  // cinder-effigy, 10133 Fire Totem → cinder-cairn, 10354 Fire Mecha God → cinder-colossus,
  // 50354 Miracle Totem → prism-cairn, Legend Stone → crown-shard.
  const recipes = recipesOf("brand");

  it("has no 2★→3★ recipe (starters are granted from 3★) and none on the Omni-bound 7★", () => {
    expect(recipes["brand-2"]).toBeUndefined();
    expect(recipes["brand-7"]).toBeUndefined();
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
});
