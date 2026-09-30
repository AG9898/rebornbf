import { describe, expect, it } from "vitest";
import { SphereSchema } from "./schemas/sphere.ts";
import { SPHERES, sphereContent } from "./spheres.ts";
import { validateSphereFile } from "./validate.ts";

describe("launch spheres (RESOLVED-71 and ROSTER signature sources)", () => {
  it("has two all-stat tiers and all eight signatures with sourced bonuses", () => {
    expect(SPHERES).toHaveLength(10);
    expect(
      SPHERES.filter((s) => s.kind === "all-stat").map((s) => s.effects.map((e) => e.value)),
    ).toEqual([
      [0.1, 0.1, 0.1, 0.1],
      [0.2, 0.2, 0.2, 0.2],
    ]);
    expect(SPHERES.filter((s) => s.kind === "signature").map((s) => s.signatureUnit)).toEqual([
      "brand",
      "maren",
      "rook",
      "garrick",
      "solen",
      "morrick",
      "aurelle",
      "vespera",
    ]);
    expect(sphereContent("gravewell")?.effects.slice(2)).toEqual([
      { id: "hp_drain", value: 0, min: 0.15, max: 0.3, target: "self" },
      { id: "bb.fill_on_attack", value: 0, min: 4, max: 6, target: "self" },
    ]);
  });
  it("rejects unknown keys, missing identity, temporary effects, and broken refs", () => {
    const sphere = sphereContent("emberheart");
    expect(SphereSchema.safeParse({ ...sphere, unknown: true }).success).toBe(false);
    expect(SphereSchema.safeParse({ ...sphere, signatureUnit: undefined }).success).toBe(false);
    expect(
      SphereSchema.safeParse({
        ...sphere,
        effects: [{ id: "buff.atk", value: 1, turns: 3, target: "self" }],
      }).success,
    ).toBe(false);
    expect(validateSphereFile("emberheart.json", sphere, new Set())).toEqual([
      'emberheart.json: signatureUnit: unknown unit "brand"',
    ]);
  });
});
