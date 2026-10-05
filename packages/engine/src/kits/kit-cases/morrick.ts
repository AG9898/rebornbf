import type { KitReference } from "../reference.ts";

export const reference = {
  unit: "morrick",
  form: "morrick-omni",
  rarities: [2, 3, 4, 5, 6, 7, "omni"],
  notes: [
    "atk_total = floor((2540 + 100) × (1 + 1.5 + 3.5)) = 2640 × 6 = 15840",
    "core = (15840 − 600/3) × 1.0 + 15840/30 = 15640 + 528 = 16168; Dark → Light ×1.5 = 24252",
    "Signature-sphere-gated DEF ignore is inactive, so the damage rolls are the first draws.",
  ],
  damage: {
    tier: "bb",
    seed: 13,
    bc: 25,
    target: { element: "light", def: 600 },
    divisor: 30,
    attacks: [
      {
        input: { atk: 2540, flatAtk: 100, statMods: 1.5, bbModifier: 3.5 },
        atkTotal: 15840,
        core: 24252,
        distribution: [9, 4, 9, 4, 30, 6, 5, 6, 5, 6, 5, 6, 5],
        hits: [2182, 970, 2182, 970, 7275, 1455, 1212, 1455, 1212, 1455, 1212, 1455, 1212],
        total: 24247,
      },
    ],
  },
  effectChecks: [
    { scope: "party", match: { id: "buff.def", value: 1.5, turns: 3 } },
    {
      scope: "party",
      match: { id: "guard_mitigation", value: 0.1, turns: 3, source: "bb" },
    },
    { scope: "party", match: { id: "elem_weak_resist", value: 1, source: "leader" } },
    {
      scope: "party",
      match: { id: "bb.fill_on_damage_dealt", value: 8, threshold: 50000, source: "leader" },
    },
  ],
  contentChecks: [
    { path: ["bursts", "bb", "attacks", 0, "startDelayFrames"], mode: "equal", expected: 14 },
    {
      path: ["bursts", "ubb", "effects"],
      mode: "contain",
      expected: { id: "mitigation", value: 1.0, turns: 1, target: "party" },
    },
  ],
} satisfies KitReference;
