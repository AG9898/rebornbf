import { describe, expect, it } from "vitest";
import { AttackSchema } from "./attack.ts";
import { BurstSchema } from "./burst.ts";
import { EFFECT_IDS, EffectSchema } from "./effect.ts";

const attack = {
  moveType: "melee",
  startDelayFrames: 20,
  hitFrames: [0, 10, 20],
  damageDistribution: [30, 30, 40],
  dropChecks: 6,
};

describe("AttackSchema", () => {
  it("accepts a distribution summing to 100", () => {
    expect(AttackSchema.safeParse(attack).success).toBe(true);
  });

  it("accepts thirds within floating-point tolerance", () => {
    const thirds = { ...attack, damageDistribution: [100 / 3, 100 / 3, 100 / 3] };
    expect(AttackSchema.safeParse(thirds).success).toBe(true);
  });

  it.each([
    [[30, 30, 30], "must sum to 100 (got 90)"],
    [[40, 40, 30], "must sum to 100 (got 110)"],
  ])("rejects distribution %j", (damageDistribution, message) => {
    const result = AttackSchema.safeParse({ ...attack, damageDistribution });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => [i.path, i.message])).toEqual([
      [["damageDistribution"], message],
    ]);
  });

  it("rejects mismatched hit and distribution counts", () => {
    const result = AttackSchema.safeParse({ ...attack, damageDistribution: [50, 50] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("hitFrames has 3");
  });

  it("rejects out-of-order hit frames", () => {
    const result = AttackSchema.safeParse({ ...attack, hitFrames: [0, 20, 10] });
    expect(result.error?.issues[0]?.path).toEqual(["hitFrames", 2]);
  });

  it("requires drop checks that divide evenly by the hit count", () => {
    expect(AttackSchema.safeParse({ ...attack, dropChecks: 0 }).success).toBe(true);
    const result = AttackSchema.safeParse({ ...attack, dropChecks: 7 });
    expect(result.error?.issues.map((i) => [i.path, i.message])).toEqual([
      [["dropChecks"], "must divide evenly by the hit count 3 (got 7)"],
    ]);
    const { dropChecks: _omitted, ...missing } = attack;
    expect(AttackSchema.safeParse(missing).success).toBe(false);
  });

  it("rejects unknown move types and fractional frames", () => {
    expect(AttackSchema.safeParse({ ...attack, moveType: "fly" }).success).toBe(false);
    expect(AttackSchema.safeParse({ ...attack, startDelayFrames: 1.5 }).success).toBe(false);
  });
});

describe("EffectSchema", () => {
  it("accepts every catalog ID", () => {
    const inner = { id: "buff.atk", value: 0.5, target: "self" };
    const extras: Record<string, object> = {
      "passive.stat_pct": { stat: "atk" },
      "attack.aoe": { target: "enemies" },
      "attack.st": { target: "enemy" },
      "attack.random": { target: "enemies" },
      "attack.hp_scaled": { target: "enemies", hpScaling: 7 },
      "attack.element_target": { target: "enemies", element: "dark" },
      "passive.atk_hp_scaled": { hpScaling: 0.5 },
      chance_mitigation: { chance: 20 },
      mitigation_after_damage: { threshold: 10000 },
      "bb.fill_on_damage_taken": { threshold: 5000 },
      "buff.spark_crit": { chance: 20 },
      "bb.fill_on_damage_dealt": { threshold: 50000 },
      "buff.add_ailment": { ailment: "paralysis" },
      damage_reflect: { chance: 20 },
    };
    for (const id of EFFECT_IDS) {
      const extra = id.startsWith("cond.") ? { effects: [inner] } : (extras[id] ?? {});
      expect(EffectSchema.safeParse({ id, value: 1, target: "party", ...extra }).success).toBe(
        true,
      );
    }
  });

  it("rejects unknown effect IDs", () => {
    const result = EffectSchema.safeParse({ id: "buff.speed", value: 1, target: "party" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["id"]);
  });

  it("rejects the wildcard catalog row and extra keys", () => {
    expect(
      EffectSchema.safeParse({ id: "ailment.inflict.*", value: 1, target: "enemy" }).success,
    ).toBe(false);
    expect(
      EffectSchema.safeParse({ id: "buff.atk", value: 1, target: "party", extra: 1 }).success,
    ).toBe(false);
  });

  it("validates the optional passive and condition fields per effect ID", () => {
    const ok = (effect: object) => EffectSchema.safeParse(effect).success;
    const stat = { id: "passive.stat_pct", value: 0.5, target: "party" };
    expect(ok({ ...stat, stat: "atk", element: "fire" })).toBe(true);
    expect(ok(stat)).toBe(false);
    expect(ok({ ...stat, stat: "speed" })).toBe(false);
    expect(ok({ id: "buff.atk", value: 1, target: "party", stat: "atk" })).toBe(false);
    expect(ok({ id: "buff.atk", value: 1, target: "party", element: "fire" })).toBe(false);

    const cond = { id: "cond.hp_above", value: 0.5, target: "self" };
    expect(ok({ ...cond, effects: [{ ...stat, stat: "atk" }] })).toBe(true);
    expect(ok(cond)).toBe(false);
    expect(ok({ ...cond, effects: [] })).toBe(false);
    expect(ok({ ...cond, effects: [stat] })).toBe(false);
    expect(ok({ ...cond, effects: [{ ...cond, effects: [{ ...stat, stat: "atk" }] }] })).toBe(
      false,
    );
    expect(ok({ id: "buff.atk", value: 1, target: "party", effects: [stat] })).toBe(false);
  });

  it("validates attack-effect fields, targets, and values per effect ID", () => {
    const ok = (effect: object) => EffectSchema.safeParse(effect).success;
    const scaled = { id: "attack.hp_scaled", value: 2, target: "enemies" };
    expect(ok({ ...scaled, hpScaling: 7 })).toBe(true);
    expect(ok(scaled)).toBe(false);
    expect(ok({ id: "attack.aoe", value: 2, target: "enemies", hpScaling: 7 })).toBe(false);
    const byElement = { id: "attack.element_target", value: 3.6, target: "enemies" };
    expect(ok({ ...byElement, element: "dark" })).toBe(true);
    expect(ok(byElement)).toBe(false);
    expect(ok({ id: "attack.aoe", value: 2, target: "enemy" })).toBe(false);
    expect(ok({ id: "attack.st", value: 2, target: "enemies" })).toBe(false);
    expect(ok({ id: "attack.random", value: -1, target: "enemies" })).toBe(false);
    const extraHits = { id: "hits.add_normal", value: 2, turns: 3, target: "party" };
    expect(ok({ ...extraHits, damageBonus: 0.2 })).toBe(true);
    expect(ok({ ...extraHits, value: 1.5 })).toBe(false);
    expect(ok({ ...extraHits, target: "enemies" })).toBe(false);
    expect(ok({ id: "buff.atk", value: 1, target: "party", damageBonus: 0.2 })).toBe(false);
    const ignore = { id: "attack.def_ignore", value: 80, target: "self" };
    expect(ok(ignore)).toBe(true);
    expect(ok({ ...ignore, value: 0 })).toBe(false);
    expect(ok({ ...ignore, value: 120 })).toBe(false);
  });

  it("validates survival min/max/recBonus/chance fields per effect ID (RESOLVED-34)", () => {
    const ok = (effect: object) => EffectSchema.safeParse(effect).success;
    const heal = { id: "heal.instant", value: 0, target: "party" };
    expect(ok({ ...heal, min: 3160, max: 3360, recBonus: 0.27 })).toBe(true);
    expect(ok({ ...heal, value: 1000, recBonus: 0.27 })).toBe(true);
    expect(ok({ ...heal, min: 3160 })).toBe(false);
    expect(ok({ ...heal, min: 3360, max: 3160 })).toBe(false);
    expect(ok({ ...heal, min: 3160.5, max: 3360 })).toBe(false);
    expect(ok({ ...heal, value: 3160, min: 3160, max: 3360 })).toBe(false);
    expect(ok({ ...heal, chance: 50 })).toBe(false);
    const hot = { id: "heal.over_time", value: 0, turns: 3, target: "party" };
    expect(ok({ ...hot, min: 2000, max: 2500, recBonus: 0.1 })).toBe(true);
    const onHit = { id: "damage_to_heal", value: 0, turns: 3, target: "party" };
    expect(ok({ ...onHit, chance: 30, min: 0.3, max: 0.35 })).toBe(true);
    expect(ok({ ...onHit, min: 0.305, max: 0.35 })).toBe(false);
    expect(ok({ ...onHit, value: 0.3, recBonus: 0.1 })).toBe(false);
    expect(ok({ ...onHit, value: 0.3, chance: 0 })).toBe(false);
    expect(ok({ ...onHit, value: 0.3, chance: 101 })).toBe(false);
    const idol = { id: "angel_idol", value: 0, turns: 3, target: "self" };
    expect(ok({ ...idol, chance: 20 })).toBe(true);
    expect(ok({ ...idol, min: 0, max: 1 })).toBe(false);
    expect(ok({ id: "mitigation", value: 0.5, target: "party", chance: 50 })).toBe(false);
    expect(ok({ id: "buff.atk", value: 1, target: "party", recBonus: 0.1 })).toBe(false);
  });

  it("validates flatAtk, element, hpScaling, and debuff chance fields (M2-04A)", () => {
    const ok = (effect: object) => EffectSchema.safeParse(effect).success;
    expect(ok({ id: "attack.aoe", value: 3.5, target: "enemies", flatAtk: 100 })).toBe(true);
    expect(ok({ id: "attack.aoe", value: 3.5, target: "enemies", flatAtk: -1 })).toBe(false);
    expect(ok({ id: "buff.atk", value: 1.5, target: "party", flatAtk: 100 })).toBe(false);
    const ewd = { id: "buff.elem_weak_dmg", value: 0.75, turns: 3, target: "party" };
    expect(ok({ ...ewd, element: "fire" })).toBe(true);
    expect(ok({ id: "buff.atk", value: 1, target: "party", element: "fire" })).toBe(false);
    const byHp = { id: "passive.atk_hp_scaled", value: 0, target: "self" };
    expect(ok({ ...byHp, hpScaling: 0.5 })).toBe(true);
    expect(ok(byHp)).toBe(false);
    const down = { id: "debuff.atk_down", value: 0.5, turns: 1, target: "enemies" };
    expect(ok({ ...down, chance: 30 })).toBe(true);
    expect(ok({ ...down, id: "debuff.def_down", chance: 30 })).toBe(true);
    expect(ok({ ...down, chance: 0 })).toBe(false);
    expect(ok({ id: "buff.bb_atk", value: 3, turns: 3, target: "party" })).toBe(true);
  });

  it("validates chance, threshold, and barrier element fields (M2-04C)", () => {
    const ok = (effect: object) => EffectSchema.safeParse(effect).success;
    const chanceMit = { id: "chance_mitigation", value: 0.2, target: "self" };
    expect(ok({ ...chanceMit, chance: 20 })).toBe(true);
    expect(ok(chanceMit)).toBe(false);
    const afterDamage = { id: "mitigation_after_damage", value: 0.25, turns: 1, target: "self" };
    expect(ok({ ...afterDamage, threshold: 10000 })).toBe(true);
    expect(ok(afterDamage)).toBe(false);
    const fill = { id: "bb.fill_on_damage_taken", value: 8, target: "party" };
    expect(ok({ ...fill, threshold: 5000 })).toBe(true);
    expect(ok({ ...fill, threshold: 0 })).toBe(false);
    expect(ok({ ...fill, threshold: 12.5 })).toBe(false);
    expect(ok({ id: "bb.fill_on_hit", value: 3, target: "party", threshold: 5000 })).toBe(false);
    expect(ok({ id: "barrier", value: 2000, target: "party", element: "earth" })).toBe(true);
    expect(ok({ id: "barrier", value: 2000, target: "party" })).toBe(true);
    expect(ok({ id: "buff.atk_from_def", value: 2.5, turns: 3, target: "party" })).toBe(true);
    expect(ok({ id: "crit_resist", value: 1, target: "party" })).toBe(true);
  });

  it("validates spark crit chance, spark vulnerability, and spark BC ranges (M2-04D)", () => {
    const ok = (effect: object) => EffectSchema.safeParse(effect).success;
    const sparkCrit = { id: "buff.spark_crit", value: 0.5, turns: 3, target: "party" };
    expect(ok({ ...sparkCrit, chance: 20 })).toBe(true);
    expect(ok(sparkCrit)).toBe(false);
    const vuln = { id: "debuff.spark_vuln", value: 1, turns: 1, target: "enemies" };
    expect(ok(vuln)).toBe(true);
    expect(ok({ ...vuln, chance: 50 })).toBe(true);
    const fill = { id: "bb.fill_on_spark", target: "party" };
    expect(ok({ ...fill, value: 0, min: 2, max: 3 })).toBe(true);
    expect(ok({ ...fill, value: 2 })).toBe(true);
    expect(ok({ ...fill, value: 0, min: 2.5, max: 3 })).toBe(false);
    expect(ok({ ...fill, value: 0, min: 3, max: 2 })).toBe(false);
    expect(ok({ ...fill, value: 2, min: 2, max: 3 })).toBe(false);
    expect(ok({ id: "bb.fill_on_guard", value: 0, min: 2, max: 3, target: "party" })).toBe(false);
  });

  it("validates BB consumption reduction ranges as whole percents (M2-04E)", () => {
    const ok = (effect: object) => EffectSchema.safeParse(effect).success;
    const refund = { id: "bb.consumption_reduction", target: "self" };
    expect(ok({ ...refund, value: 0.2 })).toBe(true);
    expect(ok({ ...refund, value: 0, min: 0.2, max: 0.25 })).toBe(true);
    expect(ok({ ...refund, value: 0, min: 0.205, max: 0.25 })).toBe(false);
    expect(ok({ ...refund, value: 0, min: 0.25, max: 0.2 })).toBe(false);
    expect(ok({ ...refund, value: 0.2, min: 0.2, max: 0.25 })).toBe(false);
    expect(ok({ id: "bb.cost_reduction", value: 0, min: 0.2, max: 0.25, target: "self" })).toBe(
      false,
    );
  });

  it("validates HP drain ranges and the damage-dealt BC threshold (M2-04F)", () => {
    const ok = (effect: object) => EffectSchema.safeParse(effect).success;
    const drain = { id: "hp_drain", turns: 3, target: "party" };
    expect(ok({ ...drain, value: 0, min: 0.03, max: 0.06, chance: 50 })).toBe(true);
    expect(ok({ ...drain, value: 0.05 })).toBe(true);
    expect(ok({ ...drain, value: 0, min: 0.035, max: 0.06 })).toBe(false);
    expect(ok({ ...drain, value: 0, min: 0.06, max: 0.03 })).toBe(false);
    expect(ok({ ...drain, value: 0.05, chance: 0 })).toBe(false);
    const fill = { id: "bb.fill_on_damage_dealt", value: 8, target: "party" };
    expect(ok({ ...fill, threshold: 50000 })).toBe(true);
    expect(ok(fill)).toBe(false);
    expect(ok({ ...fill, threshold: 50000.5 })).toBe(false);
    expect(ok({ id: "guard_mitigation", value: 0.1, turns: 3, target: "party" })).toBe(true);
    expect(ok({ id: "guard_mitigation", value: 0.1, threshold: 1, target: "party" })).toBe(false);
    expect(ok({ id: "elem_weak_resist", value: 1, target: "party" })).toBe(true);
    expect(ok({ id: "elem_weak_resist", value: 1, chance: 50, target: "party" })).toBe(false);
  });

  it("validates added ailments and an attack's own BC drop bonus (M2-04G)", () => {
    const ok = (effect: object) => EffectSchema.safeParse(effect).success;
    const add = { id: "buff.add_ailment", value: 10, turns: 3, target: "party" };
    expect(ok({ ...add, ailment: "paralysis" })).toBe(true);
    expect(ok(add)).toBe(false);
    expect(ok({ ...add, ailment: "sleep" })).toBe(false);
    expect(ok({ ...add, ailment: "curse", value: 0 })).toBe(false);
    expect(ok({ ...add, ailment: "curse", value: 101 })).toBe(false);
    expect(ok({ id: "buff.atk", value: 1, target: "party", ailment: "curse" })).toBe(false);
    const shape = { id: "attack.aoe", value: 5, target: "enemies", flatAtk: 100 };
    expect(ok({ ...shape, bcDrop: 10 })).toBe(true);
    expect(ok({ ...shape, bcDrop: -1 })).toBe(false);
    expect(ok({ id: "drop.bc", value: 35, turns: 3, target: "party", bcDrop: 10 })).toBe(false);
  });

  it("validates DoT, counter, BB-gauge condition, crit, and ranged fill fields (M2-04H)", () => {
    const ok = (effect: object) => EffectSchema.safeParse(effect).success;
    const dot = { id: "debuff.dot", value: 5, turns: 3, target: "enemies" };
    expect(ok({ ...dot, flatAtk: 100 })).toBe(true);
    expect(ok({ ...dot, flatAtk: -1 })).toBe(false);
    const reflect = { id: "damage_reflect", value: 0.25, target: "self" };
    expect(ok({ ...reflect, chance: 20 })).toBe(true);
    expect(ok(reflect)).toBe(false);
    const gated = { id: "passive.stat_pct", stat: "atk", value: 0.5, target: "self" };
    expect(ok({ id: "cond.bb_above", value: 0.5, target: "self", effects: [gated] })).toBe(true);
    expect(ok({ id: "cond.bb_above", value: 0.5, target: "self" })).toBe(false);
    const shape = { id: "attack.aoe", value: 5, target: "enemies", flatAtk: 100 };
    expect(ok({ ...shape, critRate: 20 })).toBe(true);
    expect(ok({ ...shape, critRate: -5 })).toBe(false);
    expect(ok({ id: "buff.crit_rate", value: 0.2, target: "party", critRate: 20 })).toBe(false);
    const fill = { id: "bb.fill_on_hit", turns: 3, target: "party" };
    expect(ok({ ...fill, value: 0, min: 4, max: 7 })).toBe(true);
    expect(ok({ ...fill, value: 50 })).toBe(true);
    expect(ok({ ...fill, value: 0, min: 4.5, max: 7 })).toBe(false);
    expect(ok({ ...fill, value: 4, min: 4, max: 7 })).toBe(false);
  });

  it("has no duplicate catalog IDs", () => {
    expect(new Set(EFFECT_IDS).size).toBe(EFFECT_IDS.length);
  });
});

describe("BurstSchema", () => {
  const burst = {
    name: "Test Burst",
    cost: 20,
    attacks: [attack, attack],
    effects: [
      { id: "attack.aoe", value: 3.5, target: "enemies" },
      { id: "buff.atk", value: 1.5, turns: 3, target: "party" },
      { id: "attack.element_target", value: 3.6, target: "enemies", element: "dark" },
    ],
  };

  it("pairs one attack-shape effect with each attack", () => {
    expect(BurstSchema.safeParse(burst).success).toBe(true);
    const missing = { ...burst, effects: burst.effects.slice(0, 2) };
    expect(BurstSchema.safeParse(missing).error?.issues[0]?.message).toBe(
      "has 1 attack-shape effects but 2 attacks",
    );
    expect(BurstSchema.safeParse({ ...burst, attacks: [], effects: [] }).success).toBe(true);
  });
});
