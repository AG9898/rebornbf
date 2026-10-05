import type { KitReference } from "../reference.ts";

export const reference = {
  unit: "brand",
  form: "brand-omni",
  rarities: [2, 3, 4, 5, 6, 7, "omni"],
  notes: [
    "Leader skill: ATK +100% (all) + 50% (Fire) passive, BB ATK +120% passive.",
    "atk_total = floor((2842 + 100) × (1 + 3.0 + 7.7)) = floor(34421.4) = 34421",
    "core = (34421 − 600/3) × 1.0 + 34421/25 = 35597.84; Fire → Earth ×1.5 = 53396.76",
  ],
  damage: {
    tier: "bb",
    seed: 7,
    bc: 25,
    target: { element: "earth", def: 600 },
    divisor: 25,
    attacks: [
      {
        input: { atk: 2842, flatAtk: 100, statMods: 3, bbModifier: 7.7 },
        atkTotal: 34421,
        core: 53396.76,
        distribution: [9, 12, 11, 8, 6, 5, 6, 5, 10, 7, 5, 4, 4, 4, 4],
        hits: [
          4805, 6407, 5873, 4271, 3203, 2669, 3203, 2669, 5339, 3737, 2669, 2135, 2135, 2135, 2135,
        ],
        total: 53385,
      },
    ],
  },
  effectChecks: [],
} satisfies KitReference;
