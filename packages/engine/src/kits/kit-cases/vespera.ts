import type { KitReference } from "../reference.ts";

export const reference = {
  unit: "vespera",
  form: "vespera-omni",
  rarities: [3, 4, 5, 6, 7, "omni"],
  notes: [
    "Leader skill ATK +100% (Dark) + 50% (all). The Extra Skill's ATK +50% while the BB gauge is",
    "The case's seed lands Weak (DEF −50%) on the foe before the damage is rolled: 600 → 300.",
    "atk_total = floor((3183 + 200) × (1 + 1.5 + 3.6)) = floor(3383 × 6.1) = floor(20636.3)",
    "core = (20636 − 300/3) × 1.0 + 20636/30 = 20536 + 687.87 = 21223.87; Dark → Light ×1.5",
    "Six ailment draws for the one foe (poison, sick, curse, weak, injury, paralysis in list",
    "order), then one draw set per attack.",
    "Passives initialize at empty gauge: cond.bb_above ATK is off until a charged passive refresh. Weak halves foe DEF: 600 → 300.",
  ],
  damage: {
    tier: "bb",
    seed: 18,
    bc: 26,
    target: { element: "light", def: 600, effectiveDef: 300 },
    divisor: 30,
    attacks: [
      {
        input: { atk: 3183, flatAtk: 200, statMods: 1.5, bbModifier: 3.6 },
        atkTotal: 20636,
        core: 31835.8,
        distribution: [15, 15, 10, 10, 8, 8, 7, 6, 6, 4, 4, 3, 2, 2],
        hits: [4775, 4775, 3183, 3183, 2546, 2546, 2228, 1910, 1910, 1273, 1273, 955, 636, 636],
        total: 31829,
      },
      {
        input: { atk: 3183, flatAtk: 200, statMods: 1.5, bbModifier: 3.6 },
        atkTotal: 20636,
        core: 31835.8,
        distribution: [30, 20, 20, 10, 10, 10],
        hits: [9550, 6367, 6367, 3183, 3183, 3183],
        total: 31833,
      },
    ],
    unorderedHits: true,
    beforeAttack: [
      { min: 0, max: 99 },
      { min: 0, max: 99 },
      { min: 0, max: 99 },
      { min: 0, max: 99, below: 75 },
      { min: 0, max: 99 },
      { min: 0, max: 99 },
    ],
  },
  effectChecks: [
    { scope: "party", match: { id: "bb.cost_reduction", value: 0.2 } },
    { scope: "party", match: { id: "damage_reflect", value: 0.25, chance: 20 } },
    { scope: "enemy", match: { id: "ailment.inflict.weak" } },
    { scope: "enemy", match: { id: "debuff.dot", value: 5, turns: 3 } },
    { scope: "party", match: { id: "passive.stat_pct", source: "extra" }, count: 0 },
    {
      scope: "charged",
      match: { id: "passive.stat_pct", source: "extra", stat: "atk", value: 0.5 },
    },
  ],
  effectSets: [
    {
      match: { id: "buff.add_ailment", source: "extra" },
      fields: ["ailment", "value"],
      expected: [
        ["poison", 8],
        ["curse", 8],
        ["paralysis", 8],
        ["weak", 10],
        ["sick", 10],
        ["injury", 10],
      ],
    },
  ],
  contentChecks: [
    { path: ["bursts", "bb", "attacks", 0, "startDelayFrames"], mode: "equal", expected: 99 },
    { path: ["bursts", "bb", "attacks", 1, "startDelayFrames"], mode: "equal", expected: 106 },
    {
      path: ["bursts", "bb", "effects", 1],
      mode: "match",
      expected: { id: "attack.element_target", element: "light", value: 3.6, flatAtk: 200 },
    },
    {
      path: ["bursts", "bb", "effects"],
      mode: "contain",
      expected: { id: "debuff.dot", value: 5, turns: 3, target: "enemies", flatAtk: 100 },
    },
    {
      path: ["bursts", "sbb", "effects", 0],
      mode: "match",
      expected: { id: "attack.aoe", critRate: 20 },
      form: "vespera-6",
    },
    {
      path: ["bursts", "bb", "attacks", 0, "hitFrames"],
      mode: "equal",
      expected: [0, 4, 16, 20, 22, 28, 34, 40, 46, 52],
      form: "vespera-5",
    },
    {
      path: ["bursts", "sbb", "effects"],
      mode: "contain",
      expected: { id: "bb.fill_on_hit", value: 0, min: 5, max: 8, turns: 3, target: "party" },
    },
  ],
} satisfies KitReference;
