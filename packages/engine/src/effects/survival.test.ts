import type { Effect } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { mitigationMultiplier } from "../formulas/mitigation.ts";
import { createRng, nextInt } from "../rng.ts";
import { createBattle } from "../state/create-battle.ts";
import { step } from "../step.ts";
import { makeSetup } from "../test/factories.ts";
import { applyEffect, EFFECT_REGISTRY, tickEffects } from "./index.ts";
import {
  burstHealAmount,
  damageToHealAmount,
  healOverTimeAmount,
  mitigationFromEffects,
  SURVIVAL_HANDLERS,
  SURVIVAL_IDS,
  takeDamage,
} from "./survival.ts";

const effect = (id: Effect["id"], value: number, turns?: number): Effect => ({
  id,
  value,
  ...(turns === undefined ? {} : { turns }),
  target: "party",
});

describe("survival effects", () => {
  it("registers one handler per survival ID", () => {
    for (const id of SURVIVAL_IDS) {
      expect(EFFECT_REGISTRY[id]).toBe(SURVIVAL_HANDLERS[id]);
    }
  });

  it.each(SURVIVAL_IDS.filter((id) => id !== "heal.instant" && id !== "barrier"))(
    "stores %s with BB/SBB replacement and a separate UBB slot",
    (id) => {
      const bb = applyEffect([], effect(id, 0.2, 3), "bb");
      expect(bb).toEqual([{ ...effect(id, 0.2, 3), source: "bb" }]);
      const sbb = applyEffect(bb, effect(id, 0.3, 2), "sbb");
      expect(sbb).toEqual([{ ...effect(id, 0.3, 2), source: "sbb" }]);
      expect(applyEffect(sbb, effect(id, 0.1, 1), "ubb")).toHaveLength(2);
      expect(tickEffects(tickEffects(sbb))).toEqual([]);
    },
  );

  it("heal.instant stores nothing and heals value + the healed unit's total REC", () => {
    expect(applyEffect([], effect("heal.instant", 1000), "bb")).toEqual([]);
    const rng = createRng(1);
    expect(burstHealAmount(effect("heal.instant", 3160), 1649, 2184, rng)).toEqual({
      value: 4809,
      rng,
    });
    expect(burstHealAmount(effect("heal.instant", 0.5), 0, 0, rng).value).toBe(0);
  });

  it("heal.over_time sums active slots for the end-of-turn heal", () => {
    const active = applyEffect(
      applyEffect([], effect("heal.over_time", 1200, 3), "sbb"),
      effect("heal.over_time", 4000, 3),
      "ubb",
    );
    const rng = createRng(1);
    expect(healOverTimeAmount(active, 900, rng)).toEqual({ value: 5200, rng });
    expect(healOverTimeAmount([], 900, rng).value).toBe(0);
  });

  it("mitigation and elemental_mitigation feed §3 Case 4 and stack across slots", () => {
    const bb = applyEffect([], effect("mitigation", 0.5, 2), "bb");
    expect(mitigationMultiplier(mitigationFromEffects(bb, { passive: 0.1 }))).toBeCloseTo(0.4);
    const both = applyEffect(
      applyEffect(bb, effect("mitigation", 0.5, 1), "ubb"),
      effect("elemental_mitigation", 0.2, 2),
      "bb",
    );
    const input = mitigationFromEffects(both);
    expect(input).toMatchObject({ bb: 0.5, ubb: 0.5, bbElemental: 0.2, ubbElemental: 0 });
    expect(mitigationMultiplier(input)).toBeCloseTo(0.25 * 0.8);
    expect(mitigationFromEffects(both, { ownElement: false })).toMatchObject({
      bbElemental: 0,
      ubbElemental: 0,
    });
  });

  it("angel_idol survives one lethal hit, then is consumed", () => {
    const active = applyEffect([], effect("angel_idol", 0, 3), "bb");
    const rng = createRng(1);
    expect(takeDamage(active, 500, 4000, 400, rng)).toEqual({
      hp: 100,
      effects: active,
      survived: false,
      rng,
    });
    const saved = takeDamage(active, 500, 4000, 9999, rng);
    expect(saved).toEqual({ hp: 1, effects: [], survived: true, rng });
    expect(takeDamage(saved.effects, saved.hp, 4000, 5, rng)).toEqual({
      hp: 0,
      effects: [],
      survived: false,
      rng,
    });
    const full = applyEffect([], effect("angel_idol", 1, 3), "ubb");
    expect(takeDamage(full, 500, 4000, 9999, rng).hp).toBe(4000);
    expect(takeDamage(full, 0, 4000, 10, rng).survived).toBe(false);
  });

  it("damage_to_heal restores a floored share of an attack's damage", () => {
    const active = applyEffect([], effect("damage_to_heal", 0.3, 3), "bb");
    const rng = createRng(1);
    expect(damageToHealAmount(active, 15000, rng)).toEqual({ value: 4500, rng });
    expect(damageToHealAmount(active, 1, rng).value).toBe(0);
    expect(damageToHealAmount([], 15000, rng).value).toBe(0);
  });

  describe("multi-parameter fields (RESOLVED-34)", () => {
    const withFields = (base: Effect, fields: Partial<Effect>): Effect => ({ ...base, ...fields });

    it("heal.instant: RandomBetween(min, max) + healed REC + healer REC × recBonus (wiki example)", () => {
      // Burst Healing example: RandomBetween(3160, 3360) + 1649 + 2184 × 27% = 5398 ~ 5598.
      const heal = withFields(effect("heal.instant", 0), { min: 3160, max: 3360, recBonus: 0.27 });
      const rng = createRng(7);
      const draw = nextInt(rng, 3160, 3360);
      const result = burstHealAmount(heal, 1649, 2184, rng);
      // 2184 × 0.27 = 589.68, so the heal is draw + 1649 + 589 after the floor.
      expect(result).toEqual({ value: draw.value + 1649 + 589, rng: draw.rng });
      expect(burstHealAmount({ ...heal, max: 3160 }, 1649, 2184, rng).value).toBe(5398);
      expect(burstHealAmount({ ...heal, min: 3360 }, 1649, 2184, rng).value).toBe(5598);
    });

    it("heal.over_time: per effect RandomBetween(min, max) + REC × recBonus, summed then floored", () => {
      const hot = withFields(effect("heal.over_time", 0, 3), {
        min: 2000,
        max: 2500,
        recBonus: 0.1,
      });
      // BB slot: healer REC 3005 snapshotted; UBB slot: flat 1000 with the recipient's REC 1203.
      const active = [
        { ...hot, source: "bb" as const, healerRec: 3005 },
        { ...effect("heal.over_time", 1000, 3), recBonus: 0.1, source: "ubb" as const },
      ];
      const rng = createRng(11);
      const draw = nextInt(rng, 2000, 2500);
      // draw + 300.5 + 1000 + 120.3 = draw + 1420.8 → floor → draw + 1420.
      expect(healOverTimeAmount(active, 1203, rng)).toEqual({
        value: draw.value + 1420,
        rng: draw.rng,
      });
    });

    it("damage_to_heal: proc draw, then a whole-percent share draw on a proc", () => {
      // Heal when attacked example: 30% chance to recover 30–35% of 15,000 → 4,500 ~ 5,250.
      const active = applyEffect(
        [],
        withFields(effect("damage_to_heal", 0, 3), { chance: 30, min: 0.3, max: 0.35 }),
        "bb",
      );
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const rng = createRng(seed);
        const proc = nextInt(rng, 0, 99);
        const result = damageToHealAmount(active, 15000, rng);
        if (proc.value < 30) {
          const pct = nextInt(proc.rng, 30, 35);
          expect(result).toEqual({ value: 150 * pct.value, rng: pct.rng });
        } else {
          expect(result).toEqual({ value: 0, rng: proc.rng });
        }
      }
      // A 100% chance skips the proc draw; a flat value skips the share draw.
      const sure = applyEffect(
        [],
        withFields(effect("damage_to_heal", 0.3, 3), { chance: 100 }),
        "bb",
      );
      const rng = createRng(1);
      expect(damageToHealAmount(sure, 15000, rng)).toEqual({ value: 4500, rng });
    });

    it("angel_idol: a chance idol draws [0, 99] on a lethal hit and stays when it fails", () => {
      const idol = applyEffect([], withFields(effect("angel_idol", 0, 3), { chance: 20 }), "bb");
      const outcomes = new Set<boolean>();
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
        const rng = createRng(seed);
        const draw = nextInt(rng, 0, 99);
        const result = takeDamage(idol, 500, 4000, 9999, rng);
        outcomes.add(draw.value < 20);
        expect(result).toEqual(
          draw.value < 20
            ? { hp: 1, effects: [], survived: true, rng: draw.rng }
            : { hp: 0, effects: idol, survived: false, rng: draw.rng },
        );
      }
      expect(outcomes.size).toBe(2);
      // A failed chance idol falls through to a later guaranteed one.
      const both = [...idol, { ...effect("angel_idol", 0.5, 2), source: "ubb" as const }];
      const failing = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        .map(createRng)
        .find((rng) => nextInt(rng, 0, 99).value >= 20);
      if (!failing) throw new Error("expected a failing seed");
      expect(takeDamage(both, 500, 4000, 9999, failing)).toEqual({
        hp: 2000,
        effects: idol,
        survived: true,
        rng: nextInt(failing, 0, 99).rng,
      });
    });
  });

  it("a burst heal.instant raises living party HP, clamps to max, and emits Healed", () => {
    const setup = makeSetup(2);
    const [first, second] = setup.squad;
    if (!first || !second) throw new Error("setup needs two units");
    const form = first.unit.forms[0];
    if (!form?.bursts.bb) throw new Error("fixture form needs a BB");
    const healer = {
      ...first,
      unit: {
        ...first.unit,
        forms: [
          {
            ...form,
            bursts: {
              bb: { ...form.bursts.bb, effects: [effect("heal.instant", 1000)] },
            },
          },
        ],
      },
    };
    const initial = createBattle({ ...setup, squad: [healer, second] }, 3);
    const hurt = {
      ...initial,
      party: initial.party.map((unit) =>
        unit.slot === "p0" ? { ...unit, bc: 20, hp: 3500 } : { ...unit, hp: 100 },
      ),
    };
    const result = step(hurt, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]);
    const healed = result.events.filter((event) => event.type === "Healed");
    expect(healed).toMatchObject([
      { target: "p0", amount: 500, hp: 4000 },
      { target: "p1", amount: 1900, hp: 2000 },
    ]);
    expect(result.state.party.map((unit) => unit.hp)).toEqual([4000, 2000]);
    const koed = {
      ...hurt,
      party: hurt.party.map((unit) => (unit.slot === "p1" ? { ...unit, hp: 0 } : unit)),
    };
    const none = step(koed, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]);
    expect(none.state.party[1]?.hp).toBe(0);
  });

  it("a burst heal range draws once per living target, adds healer REC × bonus, and snapshots HoT REC", () => {
    const setup = makeSetup(2);
    const [first, second] = setup.squad;
    if (!first || !second) throw new Error("setup needs two units");
    const form = first.unit.forms[0];
    if (!form?.bursts.bb) throw new Error("fixture form needs a BB");
    const burstEffects: Effect[] = [
      { ...effect("heal.instant", 0), min: 100, max: 200, recBonus: 0.5 },
      { ...effect("heal.over_time", 0, 3), min: 10, max: 20, recBonus: 0.1 },
    ];
    const healer = {
      ...first,
      unit: {
        ...first.unit,
        forms: [{ ...form, bursts: { bb: { ...form.bursts.bb, effects: burstEffects } } }],
      },
    };
    const initial = createBattle({ ...setup, squad: [healer, second] }, 5);
    const hurt = {
      ...initial,
      party: initial.party.map((unit) => ({ ...unit, bc: unit.slot === "p0" ? 20 : 0, hp: 1 })),
    };
    const [p0, p1] = hurt.party;
    if (!p0 || !p1) throw new Error("expected two party units");
    const result = step(hurt, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]);
    const first_ = nextInt(hurt.rng, 100, 200);
    const second_ = nextInt(first_.rng, 100, 200);
    const bonus = Math.floor(p0.stats.rec * 0.5);
    const healed = result.events.filter((event) => event.type === "Healed");
    expect(healed).toMatchObject([
      { target: "p0", amount: first_.value + p0.stats.rec + bonus },
      { target: "p1", amount: second_.value + p1.stats.rec + bonus },
    ]);
    const hot = result.state.party.map((unit) =>
      unit.effects.find((active) => active.id === "heal.over_time"),
    );
    expect(hot.map((active) => active?.healerRec)).toEqual([p0.stats.rec, p0.stats.rec]);
  });
});
