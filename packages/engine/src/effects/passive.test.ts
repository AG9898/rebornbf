import type { Effect, ExtraSkill, LeaderSkill, Unit } from "@bfr/data";
import { describe, expect, it } from "vitest";
import type { HitLandedEvent } from "../events.ts";
import { createBattle } from "../state/create-battle.ts";
import type { BattleSetup, BattleState, BattleUnit } from "../state/types.ts";
import { step } from "../step.ts";
import { makeEnemy, makeUnit } from "../test/factories.ts";
import { COND_HANDLERS, COND_IDS } from "./conditional.ts";
import { bcDropBonusesFromEffects } from "./drops.ts";
import { bcFillPerTurn } from "./gauge.ts";
import { applyEffect, EFFECT_REGISTRY } from "./index.ts";
import {
  expGainBonus,
  PASSIVE_HANDLERS,
  PASSIVE_IDS,
  passiveStatTotal,
  refreshPassives,
} from "./passive.ts";
import { mitigationFromEffects } from "./survival.ts";

const STATS = { hp: 4000, atk: 1400, def: 1100, rec: 900 };

interface Skills {
  readonly element?: Unit["element"];
  readonly leaderSkill?: LeaderSkill;
  readonly extraSkill?: ExtraSkill;
}

/** A factory unit whose only form carries the given skills (or none). */
function unitWith(id: string, skills: Skills = {}): BattleSetup["squad"][number] {
  const base = makeUnit(id);
  const form = base.forms[0];
  if (!form) throw new Error("factory form missing");
  const { leaderSkill: _lead, ...rest } = form;
  const unit: Unit = {
    ...base,
    element: skills.element ?? base.element,
    forms: [
      {
        ...rest,
        ...(skills.leaderSkill ? { leaderSkill: skills.leaderSkill } : {}),
        ...(skills.extraSkill ? { extraSkill: skills.extraSkill } : {}),
      },
    ],
  };
  return { unit, formId: form.id, stats: STATS };
}

const lead = (...effects: Effect[]): LeaderSkill => ({ name: "Lead", effects });
const extra = (...effects: Effect[]): ExtraSkill => ({ name: "Extra", effects });
const statPct = (
  stat: "hp" | "atk" | "def" | "rec",
  value: number,
  target: Effect["target"] = "party",
): Effect => ({ id: "passive.stat_pct", stat, value, target });

function battle(squad: BattleSetup["squad"], ally?: BattleSetup["ally"]): BattleState {
  return createBattle(
    { squad, leaderIndex: 0, ...(ally ? { ally } : {}), waves: [[makeEnemy("slime")]] },
    3,
  );
}

function unitAt(state: BattleState, slot: BattleUnit["slot"]): BattleUnit {
  const unit = state.party.find((u) => u.slot === slot);
  if (!unit) throw new Error(`no unit ${slot}`);
  return unit;
}

describe("passive and conditional effects", () => {
  it("registers one handler per passive and condition ID; bursts store nothing", () => {
    for (const id of PASSIVE_IDS) expect(EFFECT_REGISTRY[id]).toBe(PASSIVE_HANDLERS[id]);
    for (const id of COND_IDS) expect(EFFECT_REGISTRY[id]).toBe(COND_HANDLERS[id]);
    expect(applyEffect([], statPct("atk", 0.5), "bb")).toEqual([]);
    expect(
      applyEffect(
        [],
        { id: "cond.first_turns", value: 2, target: "party", effects: [statPct("atk", 0.5)] },
        "bb",
      ),
    ).toEqual([]);
  });

  it("applies the leader's and the ally's leader skills together, additively", () => {
    const state = battle(
      [unitWith("leader", { leaderSkill: lead(statPct("atk", 1)) }), unitWith("b")],
      { ...unitWith("guest", { leaderSkill: lead(statPct("atk", 0.5)) }), kind: "guest" },
    );
    for (const slot of ["p0", "p1", "ally"] as const) {
      const effects = unitAt(state, slot).effects;
      expect(passiveStatTotal(effects, "atk")).toBe(1.5);
      expect(effects.map((e) => e.source).sort()).toEqual(["ally_leader", "leader"]);
    }
  });

  it("ignores leader skills of non-leader squad units", () => {
    const state = battle([
      unitWith("leader"),
      unitWith("b", { leaderSkill: lead(statPct("atk", 1)) }),
    ]);
    expect(state.party.every((u) => u.effects.length === 0)).toBe(true);
  });

  it("targets self, party, the ally slot, and element-limited passives", () => {
    const state = battle(
      [
        unitWith("leader", {
          leaderSkill: lead(
            { ...statPct("def", 0.5), element: "water" },
            { id: "passive.exp_gain", value: 0.2, target: "ally" },
          ),
        }),
        unitWith("b", { element: "water", extraSkill: extra(statPct("rec", 0.3, "self")) }),
      ],
      { ...unitWith("guest"), kind: "duplicate" },
    );
    expect(passiveStatTotal(unitAt(state, "p0").effects, "def")).toBe(0);
    expect(passiveStatTotal(unitAt(state, "p1").effects, "def")).toBe(0.5);
    expect(passiveStatTotal(unitAt(state, "p1").effects, "rec")).toBe(0.3);
    expect(passiveStatTotal(unitAt(state, "p0").effects, "rec")).toBe(0);
    expect(expGainBonus(unitAt(state, "ally").effects)).toBe(0.2);
    expect(expGainBonus(unitAt(state, "p0").effects)).toBe(0);
  });

  it("raises max HP from HP passives at battle start: floor(4000 × 1.35) = 5400", () => {
    const state = battle([
      unitWith("leader", { leaderSkill: lead(statPct("hp", 0.3)) }),
      unitWith("b", { extraSkill: extra(statPct("hp", 0.05, "self")) }),
    ]);
    expect(unitAt(state, "p0")).toMatchObject({ hp: 5200, stats: { hp: 5200 } });
    expect(unitAt(state, "p1")).toMatchObject({ hp: 5400, stats: { hp: 5400 } });
  });

  it("feeds passive ATK into attack damage", () => {
    const plain = battle([unitWith("leader")]);
    const boosted = battle([unitWith("leader", { leaderSkill: lead(statPct("atk", 1)) })]);
    const input = { type: "attack", tick: 0, actor: "p0" } as const;
    const damage = (state: BattleState) =>
      step(state, [input], { untilTick: 60 }).events.filter(
        (e): e is HitLandedEvent => e.type === "HitLanded",
      )[0]?.damage ?? 0;
    // ATK 1400 → 2800 against DEF 500: the core roughly doubles plus DEF's share.
    expect(damage(boosted)).toBeGreaterThan(damage(plain) * 2);
  });

  it("routes other skill effects into their existing terms", () => {
    const state = battle([
      unitWith("leader", {
        leaderSkill: lead(
          { id: "mitigation", value: 0.1, target: "party" },
          { id: "drop.bc", value: 20, target: "party" },
          { id: "passive.bc_per_turn", value: 4, target: "party" },
          { id: "bb.fill_per_turn", value: 2, turns: 3, target: "party" },
          { id: "ailment.inflict.poison", value: 10, target: "party" },
          { id: "angel_idol", value: 1, target: "party" },
        ),
      }),
    ]);
    const effects = unitAt(state, "p0").effects;
    expect(mitigationFromEffects(effects)).toMatchObject({ bb: 0, ubb: 0, passive: 0.1 });
    expect(bcDropBonusesFromEffects(effects)).toEqual({
      burstBuff: 0,
      ubbBuff: 0,
      leaderSkills: 20,
    });
    expect(bcFillPerTurn(effects)).toBe(6);
    // Passives are permanent, and infliction procs and angel idol are not materialised.
    expect(effects.every((e) => e.turns === undefined)).toBe(true);
    expect(effects.map((e) => e.id)).not.toContain("ailment.inflict.poison");
    expect(effects.map((e) => e.id)).not.toContain("angel_idol");
  });

  it("keeps burst buffs and passives in separate slots", () => {
    const state = battle([unitWith("leader", { leaderSkill: lead(statPct("atk", 1)) })]);
    const p0 = unitAt(state, "p0");
    const withBurst = applyEffect(
      p0.effects,
      { id: "buff.atk", value: 0.5, turns: 3, target: "party" },
      "bb",
    );
    const refreshed = refreshPassives({
      ...state,
      party: [{ ...p0, effects: withBurst }],
    });
    expect(unitAt(refreshed, "p0").effects.map((e) => [e.id, e.source])).toEqual([
      ["buff.atk", "bb"],
      ["passive.stat_pct", "leader"],
    ]);
  });

  it("toggles an HP-conditioned passive as the recipient's HP crosses the threshold", () => {
    const state = battle([
      unitWith("leader", {
        extraSkill: extra({
          id: "cond.hp_above",
          value: 0.5,
          target: "self",
          effects: [statPct("atk", 0.5, "self")],
        }),
      }),
      unitWith("b"),
    ]);
    const atk = (s: BattleState) => passiveStatTotal(unitAt(s, "p0").effects, "atk");
    expect(atk(state)).toBe(0.5);
    expect(passiveStatTotal(unitAt(state, "p1").effects, "atk")).toBe(0);

    const setHp = (s: BattleState, hp: number): BattleState =>
      refreshPassives({
        ...s,
        party: s.party.map((u) => (u.slot === "p0" ? { ...u, hp } : u)),
      });
    const atHalf = setHp(state, 2000);
    expect(atk(atHalf)).toBe(0);
    expect(atk(setHp(atHalf, 2001))).toBe(0.5);
  });

  it("switches a low-HP passive on and a first-turns passive off", () => {
    const state = battle([
      unitWith("leader", {
        leaderSkill: lead(
          {
            id: "cond.hp_below",
            value: 0.2,
            target: "party",
            effects: [{ id: "mitigation", value: 0.3, target: "party" }],
          },
          {
            id: "cond.first_turns",
            value: 2,
            target: "party",
            effects: [statPct("atk", 1)],
          },
          {
            id: "cond.sphere_type_equipped",
            value: 0,
            target: "party",
            effects: [statPct("def", 1)],
          },
        ),
      }),
    ]);
    const p0 = (s: BattleState) => unitAt(s, "p0").effects;
    expect(mitigationFromEffects(p0(state)).passive).toBe(0);
    expect(passiveStatTotal(p0(state), "atk")).toBe(1);
    expect(passiveStatTotal(p0(state), "def")).toBe(0);

    const low = refreshPassives({
      ...state,
      party: state.party.map((u) => ({ ...u, hp: 799 })),
    });
    expect(mitigationFromEffects(p0(low)).passive).toBe(0.3);

    const turn2 = refreshPassives({ ...state, turn: 2 });
    expect(passiveStatTotal(p0(turn2), "atk")).toBe(1);
    const turn3 = refreshPassives({ ...state, turn: 3 });
    expect(passiveStatTotal(p0(turn3), "atk")).toBe(0);
    expect(p0(refreshPassives(turn3))).toEqual(p0(turn3));
  });
});
