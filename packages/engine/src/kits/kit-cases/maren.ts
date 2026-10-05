import type { KitReference } from "../reference.ts";

export const reference = {
  unit: "maren",
  form: "maren-omni",
  rarities: [2, 3, 4, 5, 6, 7, "omni"],
  notes: [
    "atk_total = floor((2678 + 100) × (1 + 1.5 + 3.5)) = 2778 × 6 = 16668",
    "core = (16668 − 600/3) × 1.0 + 16668/25 = 17134.72; Water → Fire ×1.5 = 25702.08",
  ],
  damage: {
    tier: "bb",
    seed: 7,
    bc: 25,
    target: { element: "fire", def: 600 },
    divisor: 25,
    attacks: [
      {
        input: { atk: 2678, flatAtk: 100, statMods: 1.5, bbModifier: 3.5 },
        atkTotal: 16668,
        core: 25702.08,
        distribution: [16, 8, 7, 6, 5, 4, 15, 9, 8, 7, 6, 5, 4],
        hits: [4112, 2056, 1799, 1542, 1285, 1028, 3855, 2313, 2056, 1799, 1542, 1285, 1028],
        total: 25700,
      },
    ],
  },
  effectChecks: [
    {
      scope: "party",
      match: {
        id: "heal.over_time",
        source: "bb",
        min: 4000,
        max: 4500,
        recBonus: 0.1,
        turns: 3,
        healerRec: 2760,
      },
    },
    { scope: "party", match: { id: "bb.fill_per_turn", value: 7, turns: 3, source: "bb" } },
  ],
} satisfies KitReference;
