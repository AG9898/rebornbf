import type { KitReference } from "../reference.ts";

export const reference = {
  unit: "aurelle",
  form: "aurelle-omni",
  rarities: [3, 4, 5, 6, 7, "omni"],
  notes: [
    "Leader skill ATK +100% (Light) + 50% (all); Extra Skill ATK +50% while HP > 50%.",
    "BB 360% + leader skill BB ATK 250% + Extra Skill 150% + the BB's own BB ATK buff 350%.",
    "atk_total = floor((3485 + 200) × (1 + 2.0 + 11.1)) = floor(3685 × 14.1) = floor(51958.5)",
    "core = (51958 − 600/3) × 1.0 + 51958/30 = 51758 + 1731.93… = 53489.93…; Light → Dark ×1.5",
  ],
  damage: {
    tier: "bb",
    seed: 17,
    bc: 26,
    target: { element: "dark", def: 600 },
    divisor: 30,
    attacks: [
      {
        input: { atk: 3485, flatAtk: 200, statMods: 2, bbModifier: 11.1 },
        atkTotal: 51958,
        core: 80234.9,
        distribution: [18, 11, 8, 6, 4, 18, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3],
        hits: [
          14442, 8825, 6418, 4814, 3209, 14442, 3209, 2407, 3209, 2407, 3209, 2407, 3209, 2407,
          3209, 2407,
        ],
        total: 80230,
      },
      {
        input: { atk: 3485, flatAtk: 200, statMods: 2, bbModifier: 11.1 },
        atkTotal: 51958,
        core: 80234.9,
        distribution: [30, 25, 20, 25],
        hits: [24070, 20058, 16046, 20058],
        total: 80232,
      },
    ],
    unsparked: true,
  },
  effectChecks: [
    { scope: "party", match: { id: "buff.spark_dmg", value: 1.3, turns: 3 } },
    { scope: "party", match: { id: "buff.bb_atk", source: "bb", value: 3.5, turns: 3 } },
    { scope: "party", match: { id: "buff.bb_atk", source: "leader", value: 2.5 } },
    { scope: "party", match: { id: "buff.bb_atk", source: "extra", value: 1.5 } },
    {
      scope: "party",
      match: { id: "passive.stat_pct", source: "extra", stat: "atk", value: 0.5 },
    },
  ],
  contentChecks: [
    { path: ["bursts", "bb", "attacks", 0, "startDelayFrames"], mode: "equal", expected: 21 },
    { path: ["bursts", "bb", "attacks", 1, "startDelayFrames"], mode: "equal", expected: 116 },
    {
      path: ["bursts", "bb", "effects", 1],
      mode: "match",
      expected: { id: "attack.element_target", element: "dark", value: 3.6, flatAtk: 200 },
    },
    {
      path: ["bursts", "sbb", "effects", 0],
      mode: "match",
      expected: { id: "attack.hp_scaled", value: 2, hpScaling: 7 },
    },
    {
      path: ["bursts", "bb", "effects"],
      mode: "contain",
      expected: {
        id: "buff.add_ailment",
        ailment: "paralysis",
        value: 10,
        turns: 3,
        target: "party",
      },
      form: "aurelle-7",
    },
  ],
} satisfies KitReference;
