import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FormSchema, UnitSchema } from "./schemas/unit.ts";

function unit(id: string): ReturnType<typeof UnitSchema.parse> {
  return UnitSchema.parse(
    JSON.parse(readFileSync(new URL(`../content/units/${id}.json`, import.meta.url), "utf8")),
  );
}

// Transcribed from ROSTER -> Imp caps, sourced from the homage form pages (RESOLVED-59).
const BALANCED =
  "300/120/120/120 400/160/160/160 500/200/200/200 750/300/300/300 1000/400/400/400 1500/600/600/600 2000/800/800/800";
const CAPS = [
  [
    "brand",
    "400/160/80/80 500/200/120/120 700/240/140/140 900/360/200/200 1200/480/260/260 1700/680/360/360 2200/880/460/460",
  ],
  ["maren", BALANCED],
  ["garrick", BALANCED],
  ["solen", BALANCED],
  [
    "rook",
    "200/160/80/160 300/200/120/200 350/260/140/260 500/400/200/400 700/580/280/580 1000/840/400/840 1300/1100/520/1100",
  ],
  [
    "morrick",
    "200/160/160/80 300/200/200/120 350/260/260/140 500/400/400/200 700/580/580/280 1000/840/840/400 1300/1100/1100/520",
  ],
  [
    "aurelle",
    "300/100/100/160 400/140/140/200 500/160/160/280 750/240/240/420 1000/340/340/620 1250/460/460/820",
  ],
  [
    "vespera",
    "300/120/120/120 400/160/160/160 500/200/200/200 750/300/300/300 1100/440/440/440 1500/600/600/600",
  ],
] as const;

describe("stat hobs and per-form caps (M4-04B)", () => {
  it.each(CAPS)("%s carries all sourced caps in form order", (id, caps) => {
    expect(
      unit(id).forms.map(
        (form) =>
          form.impCaps && [form.impCaps.hp, form.impCaps.atk, form.impCaps.def, form.impCaps.rec],
      ),
    ).toEqual(caps.split(" ").map((row) => row.split("/").map(Number)));
  });
  it.each([
    ["vital", { hp: 50, atk: 0, def: 0, rec: 0 }],
    ["might", { hp: 0, atk: 20, def: 0, rec: 0 }],
    ["ward", { hp: 0, atk: 0, def: 20, rec: 0 }],
    ["mend", { hp: 0, atk: 0, def: 0, rec: 20 }],
    ["grand", { hp: 150, atk: 60, def: 60, rec: 60 }],
  ] as const)("%s Hob is stackable unit fodder with sourced gains", (name, imps) => {
    const hob = unit(`${name}-hob`);
    expect(hob.stackable).toBe(true);
    expect(hob.forms).toHaveLength(1);
    expect(hob.forms[0]).toMatchObject({ rarity: 3, maxLevel: 1, fusionEffect: { imps } });
    expect(hob.forms[0]?.impCaps).toBeUndefined();
    expect(hob.forms[0]?.fusionExp).toBeUndefined();
  });
  it("rejects negative, fractional, zero-only, incomplete and mixed effects", () => {
    const form = unit("grand-hob").forms[0];
    for (const imps of [
      { hp: -1, atk: 0, def: 0, rec: 0 },
      { hp: 0.5, atk: 0, def: 0, rec: 0 },
      { hp: 0, atk: 0, def: 0, rec: 0 },
      { hp: 50 },
    ])
      expect(FormSchema.safeParse({ ...form, fusionEffect: { imps } }).success).toBe(false);
    expect(
      FormSchema.safeParse({
        ...form,
        fusionEffect: { imps: { hp: 50, atk: 0, def: 0, rec: 0 }, burstLevels: 1 },
      }).success,
    ).toBe(false);
  });
});
