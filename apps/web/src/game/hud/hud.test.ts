import type { BattleEvent, BattleState } from "@bfr/engine";
import { describe, expect, it } from "vitest";
import { UI_ASSETS } from "../../components/menu/ui-assets.ts";
import {
  classifyGesture,
  hitTest,
  INITIAL_INPUT_UI,
  type InputUiState,
  pickBurstTier,
  toEngineInput,
} from "../input/index.ts";
import { hitRegions, unitCardRect } from "../playback/layout.ts";
import {
  acceptsInput,
  advanceLive,
  isOver,
  type LiveBattle,
  queueInput,
  startLive,
} from "../playback/live.ts";
import { createTestBattle } from "../playback/test-battle.ts";
import {
  applyHudEvent,
  applyHudEvents,
  bossEnemy,
  gaugeView,
  type HudUnit,
  initHud,
} from "./model.ts";
import { STATUS_BADGES, statusBadges } from "./status.ts";

const FRAME_MS = 1000 / 60;
/** Frames between one input and the next, like a player tapping cards in turn. */
const INPUT_GAP_FRAMES = 12;

/**
 * Plays the test battle as a player would: once the player phase opens, it touches each living
 * unit's card that has not acted — a swipe up when a burst is charged, otherwise a tap — through
 * the real gesture → hit-test → `toEngineInput` path, and lets `advanceLive` run the turn loop.
 */
function playToEnd(seed: number, maxMs = 10 * 60_000) {
  let live: LiveBattle = startLive(createTestBattle(seed));
  let ui: InputUiState = INITIAL_INPUT_UI;
  const events: BattleEvent[] = [];
  let bursts = 0;
  let taps = 0;
  let frame = 0;
  for (let ms = 0; ms <= maxMs && !isOver(live); ms += FRAME_MS, frame += 1) {
    const result = advanceLive(live, ms);
    live = result.live;
    events.push(...result.events);
    if (!acceptsInput(live) || live.queued.length > 0 || frame % INPUT_GAP_FRAMES !== 0) continue;
    const state: BattleState = live.state;
    const index = state.party.findIndex((u) => u.hp > 0 && !state.acted.includes(u.slot));
    const unit = state.party[index];
    if (!unit) continue;
    const card = unitCardRect(index);
    const x = card.x + card.width / 2;
    const y = card.y + card.height / 2;
    const burst = pickBurstTier(unit) !== undefined;
    const gesture = classifyGesture(
      { x, y, timeMs: ms },
      { x, y: burst ? y - 85 : y, timeMs: ms + 100 },
    );
    const input = toEngineInput(ui, state, gesture, hitTest(hitRegions(state), x, y));
    ui = input.ui;
    if (!input.input) continue;
    if (burst) bursts += 1;
    else taps += 1;
    live = queueInput(live, input.input);
  }
  return { live, events, bursts, taps };
}

const played = playToEnd(1);

describe("a player playing the test battle", () => {
  it("wins it with taps and bursts", () => {
    expect(played.live.state.result).toBe("win");
    expect(played.taps).toBeGreaterThan(0);
    expect(played.bursts).toBeGreaterThan(0);
    expect(played.events.some((e) => e.type === "BurstUsed")).toBe(true);
    expect(played.events.some((e) => e.type === "WaveStarted" && e.wave === 1)).toBe(true);
    expect(played.events.at(-1)).toMatchObject({ type: "BattleEnded", result: "win" });
  });

  it("is deterministic for a seed", () => {
    expect(playToEnd(1).events).toEqual(played.events);
  });
});

describe("HUD model", () => {
  const start = createTestBattle(1);

  it("ends in step with the engine state after every event is applied", () => {
    const hud = applyHudEvents(initHud(start), played.events);
    const state = played.live.state;
    expect(hud.result).toBe("win");
    expect(hud.turn).toBe(state.turn);
    expect(hud.wave).toBe(1);
    expect(hud.od).toEqual({ points: state.od.points, limit: state.od.limit });
    expect(hud.units.map((u) => [u.hp, u.bc, u.overdrive])).toEqual(
      state.party.map((u) => [u.hp, u.bc, u.overdrive]),
    );
    expect(hud.enemies.map((e) => e.hp)).toEqual(state.enemies.map((e) => e.hp));
  });

  it("copies HP, gauge, and OD values from events", () => {
    let hud = initHud(start);
    hud = applyHudEvent(hud, {
      type: "HitLanded",
      tick: 1,
      actionId: 0,
      actor: "p0",
      target: "e1",
      attackIndex: 0,
      hitIndex: 0,
      critical: false,
      sparked: false,
      damage: 900,
      targetHp: 29100,
    });
    hud = applyHudEvent(hud, {
      type: "CrystalDropped",
      tick: 1,
      actionId: 0,
      collector: "p0",
      target: "e1",
      attackIndex: 0,
      hitIndex: 0,
      bc: 3,
      hc: 1,
      bcGained: 3,
      healed: 0,
      gauge: 3,
      hp: 4000,
    });
    hud = applyHudEvent(hud, {
      type: "EnemyHitLanded",
      tick: 2,
      actor: "e0",
      target: "p1",
      attackIndex: 0,
      hitIndex: 0,
      critical: false,
      damage: 250,
      unitHp: 3750,
    });
    hud = applyHudEvent(hud, {
      type: "OdGained",
      tick: 2,
      gained: 500,
      points: 500,
      limit: 10000,
    });
    expect(hud.enemies[1]?.hp).toBe(29100);
    expect(hud.units[0]?.bc).toBe(3);
    expect(hud.units[1]?.hp).toBe(3750);
    expect(hud.od).toEqual({ points: 500, limit: 10000 });
  });

  it("marks acting and guarding units until the next turn starts", () => {
    let hud = initHud(start);
    hud = applyHudEvent(hud, { type: "Guarded", tick: 5, actor: "p2" });
    expect(hud.units[2]).toMatchObject({ acted: true, guarding: true });
    hud = applyHudEvent(hud, { type: "TurnStarted", tick: 90, turn: 2 });
    expect(hud.turn).toBe(2);
    expect(hud.units[2]).toMatchObject({ acted: false, guarding: false });
  });

  it("names the wave's highest-HP enemy in the boss bar", () => {
    const hud = initHud(createTestBattle(1));
    expect(bossEnemy(hud)).toMatchObject({ slot: "e1", name: "Golem" });
    expect(bossEnemy({ ...hud, enemies: [] })).toBeUndefined();
  });

  it("spawns the next wave's roster at full HP", () => {
    const hud = applyHudEvent(initHud(start), { type: "WaveStarted", tick: 9, wave: 1 });
    expect(hud.wave).toBe(1);
    expect(hud.waveCount).toBe(2);
    expect(hud.enemies).toEqual([
      { slot: "e0", name: "Slime", element: "earth", hp: 3000, maxHp: 3000, effects: [] },
      { slot: "e1", name: "Slime", element: "earth", hp: 3000, maxHp: 3000, effects: [] },
    ]);
  });

  it("tracks status effects from apply events until their expiry events", () => {
    const atk = { id: "buff.atk", value: 100, turns: 3, target: "party" } as const;
    const poison = { id: "ailment.inflict.poison", value: 100, turns: 3, target: "enemy" } as const;
    let hud = initHud(start);
    expect(hud.units[0]?.effects).toEqual([]);
    hud = applyHudEvents(hud, [
      { type: "EffectApplied", tick: 1, actionId: 0, actor: "p0", target: "p0", effect: atk },
      { type: "EffectApplied", tick: 1, actionId: 0, actor: "p0", target: "p0", effect: atk },
      { type: "EnemyEffectApplied", tick: 2, actor: "e0", target: "p0", effect: poison },
      { type: "EffectApplied", tick: 3, actionId: 1, actor: "p1", target: "e1", effect: poison },
      { type: "AilmentCounterApplied", tick: 3, actor: "p0", target: "e1", effect: poison },
      {
        type: "EffectTriggered",
        tick: 4,
        target: "p1",
        effect: "mitigation_after_damage",
        value: 20,
        turns: 2,
      },
    ]);
    expect(hud.units[0]?.effects).toEqual(["buff.atk", "ailment.inflict.poison"]);
    expect(statusBadges(hud.units[0]?.effects ?? [])).toEqual(["status-poison", "buff-atk"]);
    expect(statusBadges(hud.enemies[1]?.effects ?? [])).toEqual(["status-poison"]);
    expect(statusBadges(hud.units[1]?.effects ?? [])).toEqual(["buff-mitigation"]);
    hud = applyHudEvents(hud, [
      { type: "EffectEnded", tick: 90, target: "p0", effect: "ailment.inflict.poison" },
      { type: "EffectEnded", tick: 90, target: "e1", effect: "ailment.inflict.poison" },
    ]);
    expect(statusBadges(hud.units[0]?.effects ?? [])).toEqual(["buff-atk"]);
    expect(statusBadges(hud.enemies[1]?.effects ?? [])).toEqual([]);
  });

  it("maps effect IDs to badges through one table, and unmapped IDs show nothing", () => {
    expect(statusBadges(["buff.crit_rate", "buff.crit_dmg", "attack.aoe", "ailment.cure"])).toEqual(
      ["buff-crit"],
    );
    expect(
      statusBadges(["debuff.def_down", "buff.def", "buff.rec", "buff.atk", "ailment.inflict.sick"]),
    ).toEqual(["status-sick", "buff-def", "buff-rec", "buff-atk"]);
    for (const badge of Object.values(STATUS_BADGES)) expect(UI_ASSETS[badge]).toBeDefined();
  });

  it("carries each unit's element and the leader for the card art", () => {
    const hud = initHud(start);
    expect(hud.units.map((u) => [u.element, u.leader])).toEqual(
      start.party.map((u, i) => [u.element, i === 0]),
    );
    expect(hud.enemies[1]?.element).toBe("earth");
  });

  it("tallies a turn's hit damage and sparked hits for the top counters", () => {
    const hit = {
      type: "HitLanded",
      tick: 1,
      actionId: 0,
      actor: "p0",
      target: "e1",
      attackIndex: 0,
      hitIndex: 0,
      critical: false,
      sparked: false,
      damage: 900,
      targetHp: 29100,
    } as const;
    let hud = initHud(start);
    expect(hud.counters).toEqual({ damage: 0, sparks: 0, turn: 1 });
    hud = applyHudEvents(hud, [
      hit,
      { ...hit, sparked: true, hitIndex: 1, damage: 1100, targetHp: 28000 },
    ]);
    expect(hud.counters).toEqual({ damage: 2000, sparks: 1, turn: 1 });
    // The totals stay up through the enemy phase and restart with the next turn's first hit.
    hud = applyHudEvent(hud, { type: "TurnStarted", tick: 90, turn: 2 });
    expect(hud.counters.damage).toBe(2000);
    hud = applyHudEvent(hud, { ...hit, tick: 91, damage: 500, targetHp: 27500 });
    expect(hud.counters).toEqual({ damage: 500, sparks: 0, turn: 2 });
  });

  it("empties the gauge when Overdrive ends and records the battle result", () => {
    let hud = initHud(start);
    hud = applyHudEvent(hud, {
      type: "OverdriveActivated",
      tick: 3,
      actor: "p0",
      limitBefore: 10000,
      limitAfter: 12000,
      turns: 3,
    });
    expect(hud.units[0]?.overdrive).toBe(true);
    expect(hud.od).toEqual({ points: 0, limit: 12000 });
    hud = applyHudEvent(hud, { type: "OverdriveEnded", tick: 4, actor: "p0" });
    expect(hud.units[0]).toMatchObject({ overdrive: false, bc: 0 });
    hud = applyHudEvent(hud, { type: "BattleEnded", tick: 5, result: "lose", turn: 7 });
    expect(hud.result).toBe("lose");
  });
});

describe("gauge view", () => {
  const unit = initHud(createTestBattle(1)).units[0] as HudUnit;

  it("marks the BB threshold and shows the charged tier", () => {
    const empty = gaugeView({ ...unit, bc: 0 });
    expect(empty.max).toBe(20);
    expect(empty.marks).toEqual([{ tier: "bb", at: 1 }]);
    expect(empty.fill).toBe(0);
    expect(empty.ready).toBeUndefined();
    const half = gaugeView({ ...unit, bc: 10 });
    expect(half.fill).toBe(0.5);
    expect(gaugeView({ ...unit, bc: 20 }).ready).toBe("bb");
  });

  it("marks SBB and UBB thresholds when the form has them", () => {
    const form = {
      ...unit.form,
      bursts: {
        ...unit.form.bursts,
        sbb: { ...unit.form.bursts.bb, cost: 30 },
        ubb: { ...unit.form.bursts.bb, cost: 40 },
      },
    };
    const normal = gaugeView({ ...unit, form, bc: 50 });
    expect(normal.max).toBe(50);
    expect(normal.marks).toEqual([
      { tier: "bb", at: 0.4 },
      { tier: "sbb", at: 1 },
    ]);
    expect(normal.ready).toBe("sbb");
    const od = gaugeView({ ...unit, form, bc: 40, overdrive: true });
    expect(od.marks.map((m) => m.tier)).toEqual(["bb", "sbb", "ubb"]);
    expect(od.ready).toBe("ubb");
  });
});
