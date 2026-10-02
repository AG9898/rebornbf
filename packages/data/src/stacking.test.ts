import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadContent } from "../scripts/content-seed.ts";
import { UnitSchema } from "./schemas/unit.ts";

// GAME_DESIGN §6 → Growth fodder → Stacking (RESOLVED-75).
const unitsDir = join(import.meta.dirname, "..", "content", "units");
const units = readdirSync(unitsDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => UnitSchema.parse(JSON.parse(readFileSync(join(unitsDir, name), "utf8"))));

describe("stackable units", () => {
  it("flags every single-form fodder and material unit, and no multi-form or placeholder unit", () => {
    // Placeholders are matched by id, not `source`: the public export strips `source` (M6-04).
    const expected = units
      .filter((unit) => unit.forms.length === 1 && !unit.id.startsWith("placeholder-"))
      .map((unit) => unit.id);
    const stackable = units.filter((unit) => unit.stackable).map((unit) => unit.id);
    expect(stackable).toEqual(expected);
    expect(stackable).toContain("moss-mote");
    expect(stackable).toContain("cinder-grail");
    expect(stackable).toContain("prism-cairn");
    expect(stackable).not.toContain("brand");
  });

  it("ships the flag in the content seed", () => {
    const seeded = loadContent().filter(
      (item) => item.kind === "unit" && (item.data as { stackable?: boolean }).stackable === true,
    );
    expect(seeded.length).toBe(units.filter((unit) => unit.stackable).length);
  });

  it("rejects stackable on a unit with more than one form", () => {
    const brand = units.find((unit) => unit.id === "brand");
    const mote = units.find((unit) => unit.id === "moss-mote");
    const multi = UnitSchema.safeParse({ ...brand, stackable: true });
    expect(multi.success).toBe(false);
    expect(multi.error?.issues[0]?.path).toEqual(["stackable"]);
    expect(UnitSchema.safeParse({ ...mote, stackable: false }).success).toBe(false);
    expect(UnitSchema.safeParse({ ...mote, stackable: true }).success).toBe(true);
  });
});
