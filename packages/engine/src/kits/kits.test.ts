import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { refreshPassives } from "../effects/passive.ts";
import type { HitLandedEvent } from "../events.ts";
import { attackTotal } from "../formulas/attack-stat.ts";
import { attackCore, hitDamage, rollAttack } from "../formulas/damage.ts";
import { elementMultiplier } from "../formulas/element.ts";
import { nextInt } from "../rng.ts";
import { createBattle } from "../state/create-battle.ts";
import { step } from "../step.ts";
import { makeEnemy, makeMember } from "../test/factories.ts";
import { units } from "./content.ts";
import type { KitReference } from "./reference.ts";

const files = readdirSync(new URL("./kit-cases/", import.meta.url))
  .filter((file) => file.endsWith(".ts"))
  .sort();
const references: KitReference[] = await Promise.all(
  files.map(async (file) => {
    const { reference }: { reference: KitReference } = await import(
      `./kit-cases/${file.slice(0, -3)}.ts`
    );
    if (file !== `${reference.unit}.ts`) throw new Error(`${file}: fixture unit must match file`);
    return reference;
  }),
);

describe("kit reference coverage", () => {
  it("requires a fixture for every transcribed or evolving unit", () => {
    // Single-form fodder, materials and original summon filler use the roster invariants.
    // Homage kits need independent arithmetic even if only one form is transcribed so far.
    // The evolving-unit check also survives source metadata being stripped in the public mirror.
    const required = units
      .filter((unit) => unit.forms.length > 1 || (unit.source && "unit" in unit.source))
      .map((unit) => unit.id);
    expect(references.map((reference) => reference.unit)).toEqual(expect.arrayContaining(required));
    expect(references.length).toBeGreaterThan(0);
  });
});

describe.each(references)("$unit — $form", (reference) => {
  const unit = units.find((unit) => unit.id === reference.unit);
  const form = unit?.forms.find((form) => form.id === reference.form);
  if (!unit || !form)
    throw new Error(`Missing reference unit/form: ${reference.unit}/${reference.form}`);
  const damage = reference.damage;
  const elementMult = elementMultiplier({
    attacker: unit.element,
    defender: damage.target.element,
  });
  const targetDef = damage.target.effectiveDef ?? damage.target.def;

  it("pins the transcribed forms and special kit data", () => {
    expect(unit.forms.map((form) => form.rarity)).toEqual(reference.rarities);
    expect(reference.notes.length).toBeGreaterThan(0);
    expect(form.bursts[damage.tier]?.attacks).toHaveLength(damage.attacks.length);
    expect(damage.attacks.length).toBeGreaterThan(0);
    damage.attacks.forEach((attack, index) => {
      expect(form.bursts[damage.tier]?.attacks[index]?.damageDistribution).toEqual(
        attack.distribution,
      );
      expect(form.stats.max.atk).toBe(attack.input.atk);
    });
    for (const check of reference.contentChecks ?? []) {
      const checkedForm = unit.forms.find((form) => form.id === (check.form ?? reference.form));
      let value: unknown = checkedForm;
      for (const key of check.path) {
        value =
          value !== null && typeof value === "object"
            ? (value as Record<string | number, unknown>)[key]
            : undefined;
      }
      if (check.mode === "equal") expect(value).toEqual(check.expected);
      else if (check.mode === "match") {
        if (check.expected === null || typeof check.expected !== "object") {
          throw new Error("A partial content expectation must be an object");
        }
        expect(value).toMatchObject(check.expected);
      } else expect(value).toContainEqual(check.expected);
    }
  });

  it("matches the hand-worked fixed-roll arithmetic", () => {
    const cores = damage.attacks.map((attack) => {
      const atkTotal = attackTotal(attack.input);
      expect(atkTotal).toBe(attack.atkTotal);
      const core = attackCore({
        atkTotal,
        targetDef,
        rolls: { critical: false, variance: 1, divisor: damage.divisor },
        elementMult,
      });
      expect(core).toBeCloseTo(attack.core, 6);
      const hits = attack.distribution.map((percent) => hitDamage(core, percent));
      expect(hits).toEqual(attack.hits);
      expect(hits.reduce((sum, hit) => sum + hit, 0)).toBe(attack.total);
      return core;
    });
    if (damage.spark) {
      const spark = damage.spark;
      const core = cores[spark.attack];
      if (core === undefined) throw new Error("Missing spark reference attack");
      expect(hitDamage(core, spark.percent, { sparkMult: spark.multiplier })).toBe(spark.damage);
    }
  });

  it("matches a seeded battle's damage, effects and passive refresh", () => {
    const foe = {
      ...makeEnemy("dummy"),
      element: damage.target.element,
      stats: { hp: 1_000_000, atk: 800, def: damage.target.def, rec: 100 },
    };
    const battle = createBattle(
      { squad: [{ unit, formId: form.id, stats: form.stats.max }], leaderIndex: 0, waves: [[foe]] },
      damage.seed,
    );
    const start = { ...battle, party: battle.party.map((unit) => ({ ...unit, bc: damage.bc })) };
    const { state, events } = step(start, [
      { type: "burst", tick: 0, actor: "p0", tier: damage.tier },
    ]);
    expect(events.some((event) => event.type === "BurstUsed")).toBe(true);

    let rng = start.rng;
    for (const draw of damage.beforeAttack ?? []) {
      const result = nextInt(rng, draw.min, draw.max);
      if (draw.below !== undefined) expect(result.value).toBeLessThan(draw.below);
      rng = result.rng;
    }
    // Attack rolls are scheduled at burst start, before hit/drop draws. Expectations use
    // fixture inputs, never the engine's computed stats or resulting damage.
    const expected = damage.attacks.flatMap((attack) => {
      const draw = rollAttack(rng, 0);
      rng = draw.rng;
      const core = attackCore({
        atkTotal: attack.atkTotal,
        targetDef,
        rolls: draw.value,
        elementMult,
      });
      return attack.distribution.map((percent) => hitDamage(core, percent));
    });
    const hits = events.filter((event): event is HitLandedEvent => event.type === "HitLanded");
    const actual = hits.map((hit) => hit.damage);
    if (damage.unorderedHits) {
      actual.sort((a, b) => a - b);
      expected.sort((a, b) => a - b);
    }
    expect(actual).toEqual(expected);
    if (damage.unsparked) expect(hits.every((hit) => !hit.sparked)).toBe(true);

    const scopes = {
      party: state.party[0]?.effects ?? [],
      enemy: state.enemies[0]?.effects ?? [],
      charged: refreshPassives(start).party[0]?.effects ?? [],
    };
    for (const check of reference.effectChecks ?? []) {
      const effects = scopes[check.scope];
      if (check.count !== undefined) {
        expect(
          effects.filter((effect) =>
            Object.entries(check.match).every(
              ([key, value]) => effect[key as keyof typeof effect] === value,
            ),
          ),
        ).toHaveLength(check.count);
      } else expect(effects).toContainEqual(expect.objectContaining(check.match));
    }
    for (const set of reference.effectSets ?? []) {
      const effects = scopes.party.filter((effect) =>
        Object.entries(set.match).every(
          ([key, value]) => effect[key as keyof typeof effect] === value,
        ),
      );
      expect(effects.map((effect) => set.fields.map((key) => effect[key]))).toEqual(set.expected);
    }
  });

  if (reference.partyBurst) {
    const burst = reference.partyBurst;
    it("applies the party burst to every squad member", () => {
      const battle = createBattle(
        {
          squad: [
            { unit, formId: form.id, stats: form.stats.max },
            ...Array.from({ length: burst.companions }, (_, i) => makeMember(`companion-${i}`)),
          ],
          leaderIndex: 0,
          waves: [[makeEnemy("dummy")]],
        },
        damage.seed,
      );
      const start = {
        ...battle,
        party: battle.party.map((unit, i) =>
          i === 0 ? { ...unit, bc: burst.bc, overdrive: true } : unit,
        ),
      };
      const { state, events } = step(start, [
        { type: "burst", tick: 0, actor: "p0", tier: burst.tier },
      ]);
      expect(events.some((event) => event.type === "BurstUsed")).toBe(true);
      expect(state.party).toHaveLength(burst.companions + 1);
      for (const unit of state.party) {
        for (const effect of burst.effects) {
          expect(unit.effects).toContainEqual(expect.objectContaining(effect));
        }
        const ids = new Set(burst.effects.map((effect) => effect.id));
        expect(unit.effects.filter((effect) => ids.has(effect.id))).toHaveLength(
          burst.effects.length,
        );
      }
    });
  }
});
