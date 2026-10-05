import type { KitReference } from "../reference.ts";

export const reference = {
  unit: "garrick",
  form: "garrick-omni",
  rarities: [2, 3, 4, 5, 6, 7, "omni"],
  notes: [
    "atk_total = floor((2750 + 100) × (1 + 1.5 + 3.5)) = 2850 × 6 = 17100",
    "core = (17100 − 600/3) × 1.0 + 17100/25 = 17584; Earth → Thunder ×1.5 = 26376",
  ],
  damage: {
    tier: "bb",
    seed: 7,
    bc: 25,
    target: { element: "thunder", def: 600 },
    divisor: 25,
    attacks: [
      {
        input: { atk: 2750, flatAtk: 100, statMods: 1.5, bbModifier: 3.5 },
        atkTotal: 17100,
        core: 26376,
        distribution: [15, 7, 6, 4, 18, 8, 7, 7, 6, 6, 6, 5, 5],
        hits: [3956, 1846, 1582, 1055, 4747, 2110, 1846, 1846, 1582, 1582, 1582, 1318, 1318],
        total: 26370,
      },
    ],
  },
  effectChecks: [
    { scope: "party", match: { id: "buff.def", value: 1.6, turns: 3, source: "bb" } },
    { scope: "party", match: { id: "crit_resist", value: 1, source: "leader" } },
    {
      scope: "party",
      match: { id: "bb.fill_on_damage_taken", value: 8, threshold: 5000, source: "leader" },
    },
  ],
} satisfies KitReference;
