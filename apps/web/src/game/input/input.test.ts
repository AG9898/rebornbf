import type { Unit } from "@bfr/data";
import { type BattleState, type BattleUnit, createBattle, type EnemySetup } from "@bfr/engine";
import { describe, expect, it } from "vitest";
import {
  classifyGesture,
  type Gesture,
  type HitRegion,
  hitTest,
  INITIAL_INPUT_UI,
  pickBurstTier,
  SWIPE_MAX_MS,
  SWIPE_MIN_PX,
  TAP_SLOP_PX,
  toEngineInput,
} from "./index.ts";

const STATS = { hp: 4000, atk: 1400, def: 1100, rec: 900 };

/** An enemy that normal-attacks a random unit with one hit. */
function enemy(id: string): EnemySetup {
  return {
    id,
    name: id.toUpperCase(),
    element: "earth",
    stats: STATS,
    normalAttack: {
      moveType: "melee",
      startDelayFrames: 20,
      hitFrames: [0],
      damageDistribution: [100],
      dropChecks: 0,
    },
    skills: [],
    ai: [{ when: "default", skill: "normal", target: "random" }],
  };
}

function burst(name: string, cost: number) {
  return { name, cost, attacks: [], effects: [] };
}

/** A placeholder unit whose form has BB 20, SBB 25 (gauge max 45), and UBB 30. */
function makeUnit(id: string): Unit {
  return {
    id,
    name: `Test ${id}`,
    element: "fire",
    source: { placeholder: true },
    forms: [
      {
        id: `${id}-7`,
        name: `Test ${id}`,
        rarity: 7,
        maxLevel: 120,
        stats: { base: STATS, max: STATS },
        normalAttack: {
          moveType: "melee",
          startDelayFrames: 20,
          hitFrames: [0],
          damageDistribution: [100],
          dropChecks: 2,
        },
        bursts: { bb: burst("B", 20), sbb: burst("S", 25), ubb: burst("U", 30) },
        leaderSkill: {
          name: "Lead",
          effects: [{ id: "passive.exp_gain", value: 0.3, target: "party" }],
        },
        sphereSlots: 2,
      },
    ],
  };
}

function makeState(): BattleState {
  return createBattle(
    {
      squad: ["a", "b"].map((id) => ({ unit: makeUnit(id), formId: `${id}-7`, stats: STATS })),
      leaderIndex: 0,
      waves: [[enemy("x"), enemy("y")]],
    },
    1,
  );
}

function withUnit(state: BattleState, patch: Partial<BattleUnit>): BattleState {
  return { ...state, party: state.party.map((u, i) => (i === 0 ? { ...u, ...patch } : u)) };
}

const down = { x: 40, y: 200, timeMs: 1000 };
const tap: Gesture = { kind: "tap", x: 40, y: 200, timeMs: 1100 };
const swipeUp: Gesture = { kind: "swipe-up", x: 40, y: 200, timeMs: 1100 };
const swipeDown: Gesture = { kind: "swipe-down", x: 40, y: 200, timeMs: 1100 };

describe("classifyGesture", () => {
  it("treats travel within the tap slop as a tap at the press point, stamped at release", () => {
    expect(classifyGesture(down, { x: 40, y: 200, timeMs: 1080 })).toEqual({
      kind: "tap",
      x: 40,
      y: 200,
      timeMs: 1080,
    });
    expect(classifyGesture(down, { x: 40 + TAP_SLOP_PX, y: 200, timeMs: 3000 }).kind).toBe("tap");
  });

  it("classifies vertical flicks as swipes; up is towards smaller y", () => {
    expect(classifyGesture(down, { x: 42, y: 200 - SWIPE_MIN_PX, timeMs: 1150 }).kind).toBe(
      "swipe-up",
    );
    expect(classifyGesture(down, { x: 34, y: 307, timeMs: 1150 }).kind).toBe("swipe-down");
  });

  it("rejects horizontal, short, and slow drags", () => {
    expect(classifyGesture(down, { x: 147, y: 129, timeMs: 1100 }).kind).toBe("none");
    expect(classifyGesture(down, { x: 40, y: 200 - SWIPE_MIN_PX + 1, timeMs: 1100 }).kind).toBe(
      "none",
    );
    expect(
      classifyGesture(down, { x: 40, y: 58, timeMs: down.timeMs + SWIPE_MAX_MS + 1 }).kind,
    ).toBe("none");
  });
});

describe("hitTest", () => {
  const regions: HitRegion[] = [
    { target: { kind: "unit", slot: "p0" }, x: 0, y: 0, width: 20, height: 20 },
    { target: { kind: "od" }, x: 10, y: 10, width: 20, height: 20 },
  ];

  it("returns the topmost region containing the point, with exclusive far edges", () => {
    expect(hitTest(regions, 5, 5)).toEqual({ kind: "unit", slot: "p0" });
    expect(hitTest(regions, 15, 15)).toEqual({ kind: "od" });
    expect(hitTest(regions, 30, 30)).toBeUndefined();
  });
});

describe("toEngineInput", () => {
  const unit = { kind: "unit", slot: "p0" } as const;

  it("taps a unit into an attack at the release tick with the selected target", () => {
    const state = makeState();
    const selected = toEngineInput(INITIAL_INPUT_UI, state, tap, { kind: "enemy", slot: "e1" });
    expect(selected.input).toBeUndefined();
    expect(selected.ui.selectedTarget).toBe("e1");

    // 1100 ms → floor(1100 × 60 / 1000) = tick 66.
    expect(toEngineInput(selected.ui, state, tap, unit).input).toEqual({
      type: "attack",
      tick: 66,
      actor: "p0",
      target: "e1",
    });
  });

  it("never stamps an input earlier than the battle clock", () => {
    const state = { ...makeState(), tick: 90 };
    expect(toEngineInput(INITIAL_INPUT_UI, state, tap, unit).input?.tick).toBe(90);
  });

  it("swipes down into guard", () => {
    expect(toEngineInput(INITIAL_INPUT_UI, makeState(), swipeDown, unit).input).toEqual({
      type: "guard",
      tick: 66,
      actor: "p0",
    });
  });

  it("swipes up into the highest charged burst tier, or nothing", () => {
    const burstTier = (patch: Partial<BattleUnit>) =>
      toEngineInput(INITIAL_INPUT_UI, withUnit(makeState(), patch), swipeUp, unit).input;
    expect(burstTier({ bc: 19 })).toBeUndefined();
    expect(burstTier({ bc: 20 })).toMatchObject({ type: "burst", tier: "bb", actor: "p0" });
    expect(burstTier({ bc: 45 })).toMatchObject({ type: "burst", tier: "sbb" });
    expect(burstTier({ bc: 45, overdrive: true })).toMatchObject({ type: "burst", tier: "ubb" });
    expect(burstTier({ bc: 25, overdrive: true })).toMatchObject({ type: "burst", tier: "bb" });
    const [lead] = withUnit(makeState(), { bc: 30, overdrive: true }).party;
    expect(lead && pickBurstTier(lead)).toBe("ubb");
  });

  it("uses the OD button to arm Overdrive for the next unit touched, only when the gauge is full", () => {
    const empty = makeState();
    expect(toEngineInput(INITIAL_INPUT_UI, empty, tap, { kind: "od" }).ui.odArmed).toBe(false);

    const full = { ...empty, od: { ...empty.od, points: empty.od.limit } };
    const armed = toEngineInput(INITIAL_INPUT_UI, full, tap, { kind: "od" }).ui;
    expect(armed.odArmed).toBe(true);
    expect(toEngineInput(armed, full, tap, { kind: "od" }).ui.odArmed).toBe(false);

    const result = toEngineInput(armed, full, swipeUp, unit);
    expect(result.input).toEqual({ type: "overdrive", tick: 66, actor: "p0" });
    expect(result.ui.odArmed).toBe(false);
  });

  it("ignores no-op gestures, empty space, dead units, dead enemies, and swipes on enemies", () => {
    const state = makeState();
    const deadUnit = withUnit(state, { hp: 0 });
    const deadEnemy = {
      ...state,
      enemies: state.enemies.map((e) => (e.slot === "e1" ? { ...e, hp: 0 } : e)),
    };
    const e1 = { kind: "enemy", slot: "e1" } as const;
    expect(toEngineInput(INITIAL_INPUT_UI, state, { kind: "none" }, unit).input).toBeUndefined();
    expect(toEngineInput(INITIAL_INPUT_UI, state, tap, undefined).input).toBeUndefined();
    expect(toEngineInput(INITIAL_INPUT_UI, deadUnit, tap, unit).input).toBeUndefined();
    expect(toEngineInput(INITIAL_INPUT_UI, deadEnemy, tap, e1).ui.selectedTarget).toBeUndefined();
    expect(toEngineInput(INITIAL_INPUT_UI, state, swipeUp, e1).ui).toBe(INITIAL_INPUT_UI);
  });
});
