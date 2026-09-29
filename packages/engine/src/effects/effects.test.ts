import { EFFECT_IDS, type Effect, ELEMENTS } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { createBattle } from "../state/create-battle.ts";
import { step } from "../step.ts";
import { makeSetup } from "../test/factories.ts";
import {
  addedElements,
  BUFF_HANDLERS,
  type BuffId,
  buffTotal,
  clearAddedElements,
  isSetBuffId,
} from "./buffs.ts";
import {
  applyEffect,
  assertKnownEffect,
  EFFECT_REGISTRY,
  endedEffectIds,
  tickEffects,
} from "./index.ts";

const BUFF_IDS = Object.keys(BUFF_HANDLERS) as BuffId[];

describe("effect registry", () => {
  it("covers the catalog and rejects unknown IDs", () => {
    expect(Object.keys(EFFECT_REGISTRY).sort()).toEqual([...EFFECT_IDS].sort());
    expect(() => assertKnownEffect("buff.speed")).toThrow(/unknown effect ID "buff.speed"/);
  });

  it.each(BUFF_IDS)("handles %s and replaces the previous BB/SBB value", (id) => {
    expect(BUFF_HANDLERS).toHaveProperty(id);
    const effect: Effect = {
      id,
      value: id === "buff.add_element" ? 0 : 0.3,
      turns: 3,
      target: "self",
    };
    const first = applyEffect([], effect, "bb");
    expect(first).toEqual([{ ...effect, source: "bb" }]);
    const refreshed = applyEffect(first, { ...effect, turns: 2 }, "sbb");
    expect(refreshed).toEqual([{ ...effect, turns: 2, source: "sbb" }]);
    const ubb = applyEffect(refreshed, effect, "ubb");
    expect(ubb).toHaveLength(2);
    if (!isSetBuffId(id)) {
      expect(buffTotal(ubb, id)).toBeCloseTo(0.6);
    }
  });

  it("decodes every added element and rejects invalid indices", () => {
    const active = ELEMENTS.map(
      (_, value) =>
        applyEffect([], { id: "buff.add_element", value, turns: 1, target: "self" }, "bb")[0],
    );
    expect(addedElements(active.filter((effect) => effect !== undefined))).toEqual(ELEMENTS);
    expect(() =>
      applyEffect([], { id: "buff.add_element", value: 6, target: "self" }, "bb"),
    ).toThrow(/expected an element index/);
  });

  it("decrements only at end of turn and expires after the final tick", () => {
    const effect: Effect = { id: "buff.atk", value: 0.5, turns: 3, target: "party" };
    const active = applyEffect([], effect, "bb");
    expect(active[0]?.turns).toBe(3);
    const afterOne = tickEffects(active);
    expect(afterOne[0]?.turns).toBe(2);
    const afterTwo = tickEffects(afterOne);
    expect(afterTwo[0]?.turns).toBe(1);
    expect(tickEffects(afterTwo)).toEqual([]);
    expect(applyEffect([], { ...effect, turns: 0 }, "bb")).toEqual([]);
    const permanent = applyEffect([], { ...effect, turns: undefined }, "bb");
    expect(tickEffects(permanent)).toEqual(permanent);
  });

  it("applies a party ATK buff at burst start before the next unit attacks", () => {
    const initial = createBattle(makeSetup(2), 7);
    const charged = {
      ...initial,
      party: initial.party.map((unit) => (unit.slot === "p0" ? { ...unit, bc: 20 } : unit)),
    };
    const burst = step(charged, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]);
    expect(step(charged, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]).events).toEqual(
      burst.events,
    );
    expect(burst.events.filter((event) => event.type === "EffectApplied")).toMatchObject([
      { actor: "p0", target: "p0", effect: { id: "buff.atk", turns: 3 } },
      { actor: "p0", target: "p1", effect: { id: "buff.atk", turns: 3 } },
    ]);
    expect(burst.state.party[1]?.effects.find((e) => e.id === "buff.atk")?.value).toBe(0.5);
    const buffed = step(burst.state, [{ type: "attack", tick: 1, actor: "p1" }]);
    const plain = step(initial, [{ type: "attack", tick: 1, actor: "p1" }]);
    const damage = (events: typeof buffed.events) =>
      events
        .filter((event) => event.type === "HitLanded")
        .reduce((sum, event) => sum + event.damage, 0);
    expect(damage(buffed.events)).toBeGreaterThan(damage(plain.events));
  });

  it("keeps one burst's added elements together; a later set in the slot replaces them", () => {
    const add = (value: number, turns = 3): Effect => ({
      id: "buff.add_element",
      value,
      turns,
      target: "party",
    });
    const fireWater = applyEffect(applyEffect([], add(0), "bb"), add(1), "bb");
    expect(addedElements(fireWater)).toEqual(["fire", "water"]);
    // The same element in the same slot replaces (a refreshed duration), not duplicates.
    expect(applyEffect(fireWater, add(1, 1), "sbb").map((e) => [e.value, e.turns])).toEqual([
      [0, 3],
      [1, 1],
    ]);
    // A new burst clears its slot's set first; the UBB slot keeps its own.
    const withUbb = applyEffect(fireWater, add(5), "ubb");
    const thunder = applyEffect(clearAddedElements(withUbb, "sbb"), add(3), "sbb");
    expect(addedElements(thunder)).toEqual(["dark", "thunder"]);

    // In step: a BB adding fire and water gives both; a second BB adding thunder replaces them.
    const setup = makeSetup(2);
    const [first, second] = setup.squad;
    const form = first?.unit.forms[0];
    if (!first || !second || !form) throw new Error("setup needs two units");
    const withBurst = (effects: Effect[]) => ({
      ...first,
      unit: {
        ...first.unit,
        forms: [{ ...form, bursts: { bb: { ...form.bursts.bb, effects } } }],
      },
    });
    const charge = (state: ReturnType<typeof createBattle>) => ({
      ...state,
      acted: [],
      party: state.party.map((unit) => (unit.slot === "p0" ? { ...unit, bc: 20 } : unit)),
    });
    const initial = charge(
      createBattle({ ...setup, squad: [withBurst([add(0), add(1)]), second] }, 7),
    );
    const burst = step(initial, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]);
    for (const unit of burst.state.party) {
      expect(addedElements(unit.effects)).toEqual(["fire", "water"]);
    }
    const later = createBattle({ ...setup, squad: [withBurst([add(3)]), second] }, 7);
    const rebuilt = charge({
      ...burst.state,
      party: burst.state.party.map((unit, i) => ({
        ...unit,
        form: later.party[i]?.form ?? unit.form,
      })),
    });
    const again = step(rebuilt, [{ type: "burst", tick: rebuilt.tick, actor: "p0", tier: "bb" }]);
    for (const unit of again.state.party) {
      expect(addedElements(unit.effects)).toEqual(["thunder"]);
    }
  });
});

describe("endedEffectIds", () => {
  const buff = (id: Effect["id"], turns: number, source: "bb" | "ubb" | "leader" = "bb") => ({
    id,
    value: 50,
    turns,
    target: "self" as const,
    source,
  });

  it("reports an ID only once no effect with it is left", () => {
    const before = [buff("buff.atk", 1), buff("buff.atk", 3, "ubb"), buff("buff.def", 1)];
    expect(endedEffectIds(before, tickEffects(before))).toEqual(["buff.def"]);
    expect(endedEffectIds(before, [])).toEqual(["buff.atk", "buff.def"]);
  });

  it("ignores passive effects, which never had an apply event", () => {
    expect(endedEffectIds([buff("buff.atk", 1, "leader")], [])).toEqual([]);
  });

  it("reports ailments a cure removed", () => {
    const poisoned = [{ ...buff("ailment.inflict.poison", 3), value: 100 }];
    const cured = applyEffect(poisoned, { id: "ailment.cure", value: 0, target: "self" }, "bb");
    expect(endedEffectIds(poisoned, cured)).toEqual(["ailment.inflict.poison"]);
  });
});
