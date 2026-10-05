import type { KitReference } from "../reference.ts";

export const reference = {
  unit: "solen",
  form: "solen-omni",
  rarities: [2, 3, 4, 5, 6, 7, "omni"],
  notes: [
    "atk_total = floor((2780 + 100) × (1 + 3.0 + 3.5)) = 2880 × 7.5 = 21600",
    "core = (21600 − 600/3) × 1.0 + 21600/25 = 21400 + 864 = 22264; Light → Dark ×1.5 = 33396",
    "Leader skill BB cost −25%: ceil(25 × 0.75) = 19 BC is enough for the BB.",
    "Reduced BB cost: ceil(25 × (1 − 0.25)) = 19 BC; UBB adds all six elements to all three party members.",
  ],
  damage: {
    tier: "bb",
    seed: 11,
    bc: 19,
    target: { element: "dark", def: 600 },
    divisor: 25,
    attacks: [
      {
        input: { atk: 2780, flatAtk: 100, statMods: 3, bbModifier: 3.5 },
        atkTotal: 21600,
        core: 33396,
        distribution: [15, 8, 7, 6, 5, 4, 3, 20, 6, 6, 5, 5, 5, 5],
        hits: [5009, 2671, 2337, 2003, 1669, 1335, 1001, 6679, 2003, 2003, 1669, 1669, 1669, 1669],
        total: 33386,
      },
    ],
  },
  effectChecks: [
    { scope: "party", match: { id: "buff.atk", value: 1.5, turns: 3 } },
    { scope: "party", match: { id: "buff.def", value: 1.5, turns: 3 } },
    { scope: "party", match: { id: "buff.rec", value: 1.5, turns: 3 } },
    { scope: "party", match: { id: "bb.fill_rate", source: "bb", value: 0.3, turns: 3 } },
    { scope: "party", match: { id: "bb.cost_reduction", value: 0.25, source: "leader" } },
    { scope: "party", match: { id: "bb.fill_rate", source: "leader", value: 0.5 } },
  ],
  partyBurst: {
    tier: "ubb",
    bc: 25,
    companions: 2,
    effects: [
      { id: "buff.add_element", value: 0, source: "ubb" },
      { id: "buff.add_element", value: 1, source: "ubb" },
      { id: "buff.add_element", value: 2, source: "ubb" },
      { id: "buff.add_element", value: 3, source: "ubb" },
      { id: "buff.add_element", value: 4, source: "ubb" },
      { id: "buff.add_element", value: 5, source: "ubb" },
    ],
  },
  contentChecks: [
    { path: ["bursts", "bb", "attacks", 0, "startDelayFrames"], mode: "equal", expected: 16 },
    { path: ["bursts", "ubb", "cost"], mode: "equal", expected: 25 },
  ],
} satisfies KitReference;
