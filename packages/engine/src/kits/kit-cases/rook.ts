import type { KitReference } from "../reference.ts";

export const reference = {
  unit: "rook",
  form: "rook-omni",
  rarities: [2, 3, 4, 5, 6, 7, "omni"],
  notes: [
    "atk_total = floor((3000 + 100) × (1 + 3.0 + 3.5)) = 3100 × 7.5 = 23250",
    "core = (23250 − 600/3) × 1.0 + 23250/25 = 23980; Thunder → Water ×1.5 = 35970",
  ],
  damage: {
    tier: "bb",
    seed: 7,
    bc: 25,
    target: { element: "water", def: 600 },
    divisor: 25,
    attacks: [
      {
        input: { atk: 3000, flatAtk: 100, statMods: 3, bbModifier: 3.5 },
        atkTotal: 23250,
        core: 35970,
        distribution: [10, 90],
        hits: [3597, 32373],
        total: 35970,
      },
    ],
    unsparked: true,
    spark: { attack: 0, percent: 90, multiplier: 3.6, damage: 116542 },
  },
  effectChecks: [
    { scope: "party", match: { id: "buff.atk", value: 1.5, turns: 3 } },
    { scope: "party", match: { id: "buff.spark_dmg", source: "bb", value: 0.9, turns: 3 } },
    { scope: "party", match: { id: "buff.spark_dmg", source: "leader", value: 1.2 } },
    { scope: "party", match: { id: "bb.fill_on_spark", min: 2, max: 3, source: "leader" } },
  ],
  contentChecks: [
    { path: ["bursts", "bb", "attacks", 0, "hitFrames"], mode: "equal", expected: [0, 55] },
  ],
} satisfies KitReference;
