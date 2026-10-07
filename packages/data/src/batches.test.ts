import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type Batch, BatchSchema } from "./schemas/batch.ts";
import { type Unit, UnitSchema } from "./schemas/unit.ts";
import { obtainableUnitIds, validateBatches } from "./validate.ts";

const original = join(import.meta.dirname, "..", "content", "original");
const readUnits = (dir: string) =>
  new Map(
    readdirSync(dir).map((file) => {
      const unit = UnitSchema.parse(JSON.parse(readFileSync(join(dir, file), "utf8")));
      return [unit.id, unit] as const;
    }),
  );
const units = readUnits(join(original, "units"));
const sixHeroes = BatchSchema.parse(
  JSON.parse(readFileSync(join(original, "batches", "six-heroes.json"), "utf8")),
);
const launch = new Set(["brand", "maren", "garrick", "rook", "solen", "morrick"]);
// Read from content, not written out: the public export guard rejects original names in code.
const hero = sixHeroes.characters[0]?.unit ?? "";
const material = [...units.values()].find((unit) => unit.stackable)?.id ?? "";

describe("batch manifests (RESOLVED-100)", () => {
  it("accepts the staged Six Heroes batch", () => {
    expect(sixHeroes.status).toBe("staged");
    expect(validateBatches([sixHeroes], units, launch)).toEqual([]);
  });

  it("rejects missing units, materials, duplicates, unknown replacements, and orphans", () => {
    const bad: Batch = {
      ...sixHeroes,
      id: "bad",
      order: 2,
      characters: [
        { unit: "nobody", name: "Nobody", category: 1, tag: "rare" },
        { unit: material, name: "Material", category: 2, tag: "free" },
        { unit: hero, name: "Hero", category: 3, tag: "free", replaces: "ghost" },
      ],
    };
    const errors = validateBatches([sixHeroes, bad], units, launch);
    expect(errors).toEqual([
      'original/batches/bad.json: characters[0].unit: no imported unit "nobody"',
      `original/batches/bad.json: characters[1].unit: "${material}" is a stackable material`,
      `original/batches/bad.json: characters[2].unit: "${hero}" is also in "six-heroes"`,
      'original/batches/bad.json: characters[2].replaces: no launch unit "ghost"',
    ]);
    const orphan = new Map<string, Unit>(units);
    expect(validateBatches([], orphan, launch)).toContain(
      `original/units/${hero}.json: (root): not in any batch`,
    );
    expect(validateBatches([sixHeroes, { ...sixHeroes, id: "twin" }], units, launch)).toContain(
      'original/batches/twin.json: order: 1 is also batch "six-heroes"',
    );
  });

  it("makes only released characters and imported materials referenceable", () => {
    const staged = obtainableUnitIds(launch, units, [sixHeroes]);
    expect(staged.has("brand")).toBe(true);
    expect(staged.has(material)).toBe(true);
    expect(staged.has(hero)).toBe(false);
    const released = obtainableUnitIds(launch, units, [{ ...sixHeroes, status: "released" }]);
    expect(released.has(hero)).toBe(true);
  });
});
