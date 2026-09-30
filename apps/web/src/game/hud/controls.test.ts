import type { Item } from "@bfr/data";
import { type BattleEvent, type BattleState, createBattle } from "@bfr/engine";
import { describe, expect, it } from "vitest";
import { classifyGesture, hitTest, INITIAL_INPUT_UI, toEngineInput } from "../input/index.ts";
import { HUD, hitRegions, itemSlotRect } from "../playback/layout.ts";
import { advanceLive, isOver, type LiveBattle, queueInput, startLive } from "../playback/live.ts";
import { createTestBattle, TEST_BATTLE_SETUP } from "../playback/test-battle.ts";
import {
  type BattleControls,
  dueAutoInputs,
  INITIAL_CONTROLS,
  type PlaybackSpeed,
  playbackSteps,
  speedLabel,
  toggleAuto,
  toggleSpeed,
} from "./controls.ts";
import { applyHudEvents, initHud } from "./model.ts";

const WALL_FRAME_MS = 1000 / 60;
const AUTO: BattleControls = { auto: true, speed: 1 };

/** Plays the test battle on auto at `speed`, one wall-clock frame at a time, as the scene does. */
function playAuto(speed: PlaybackSpeed, maxWallMs = 10 * 60_000) {
  const controls: BattleControls = { auto: true, speed };
  let live: LiveBattle = startLive(createTestBattle(1));
  const events: BattleEvent[] = [];
  let playbackMs = 0;
  let frames = 0;
  for (let wall = 0; wall <= maxWallMs && !isOver(live); wall += WALL_FRAME_MS, frames += 1) {
    for (const stepMs of playbackSteps(WALL_FRAME_MS, speed)) {
      playbackMs += stepMs;
      for (const input of dueAutoInputs(controls, live)) live = queueInput(live, input);
      const result = advanceLive(live, playbackMs);
      live = result.live;
      events.push(...result.events);
    }
  }
  return { live, events, frames };
}

describe("Auto and Speed toggles", () => {
  it("toggle auto on and off, and speed between x1 and x2", () => {
    expect(INITIAL_CONTROLS).toEqual({ auto: false, speed: 1 });
    expect(toggleAuto(INITIAL_CONTROLS).auto).toBe(true);
    expect(toggleAuto(toggleAuto(INITIAL_CONTROLS)).auto).toBe(false);
    expect(toggleSpeed(INITIAL_CONTROLS).speed).toBe(2);
    expect(toggleSpeed(toggleSpeed(INITIAL_CONTROLS)).speed).toBe(1);
    expect(speedLabel(2)).toBe("x2");
    expect(playbackSteps(10, 1)).toEqual([10]);
    expect(playbackSteps(10, 2)).toEqual([10, 10]);
  });

  it("are touch regions on the boss band pills, and never engine inputs", () => {
    const state = createTestBattle(1);
    const regions = hitRegions(state);
    const at = (r: { x: number; y: number; width: number; height: number }) =>
      hitTest(regions, r.x + r.width / 2, r.y + r.height / 2);
    expect(at(HUD.autoPill)).toEqual({ kind: "auto" });
    expect(at(HUD.speedPill)).toEqual({ kind: "speed" });
    const tap = classifyGesture({ x: 0, y: 0, timeMs: 0 }, { x: 0, y: 0, timeMs: 50 });
    const result = toEngineInput(INITIAL_INPUT_UI, state, tap, { kind: "auto" });
    expect(result).toEqual({ ui: INITIAL_INPUT_UI });
  });
});

const normal = playAuto(1);

describe("auto-battle inputs", () => {
  const live = startLive(createTestBattle(1));

  it("queues nothing while Auto is off", () => {
    expect(dueAutoInputs(INITIAL_CONTROLS, live)).toEqual([]);
  });

  it("queues one input per waiting unit, at most once per turn", () => {
    const inputs = dueAutoInputs(AUTO, live);
    expect(inputs.map((input) => input.actor)).toEqual(live.state.party.map((u) => u.slot));
    let next = inputs.reduce(queueInput, live);
    expect(dueAutoInputs(AUTO, next)).toEqual([]);
    next = advanceLive(next, 5).live;
    expect(dueAutoInputs(AUTO, next)).toEqual([]);
  });

  it("switched on mid-turn, moves only the units without an action", () => {
    let next = queueInput(live, { type: "attack", tick: 0, actor: "p0" });
    next = advanceLive(next, 5).live;
    next = advanceLive(next, 5000).live;
    expect(next.state.timeline).toEqual([]);
    expect(dueAutoInputs(AUTO, next).map((input) => input.actor)).not.toContain("p0");
    expect(dueAutoInputs(AUTO, next)).toHaveLength(live.state.party.length - 1);
  });

  it("aims at the selected enemy while it lives", () => {
    const [first] = dueAutoInputs(AUTO, live, "e1");
    expect(first).toMatchObject({ target: "e1" });
  });

  it("wins the test battle on its own", () => {
    expect(normal.live.state.result).toBe("win");
  });
});

describe("playback speed", () => {
  it("does not change engine ticks: x2 gives the same events and input log in fewer frames", () => {
    const fast = playAuto(2);
    expect(fast.events).toEqual(normal.events);
    expect(fast.live.log).toEqual(normal.live.log);
    expect(fast.live.state).toEqual(normal.live.state);
    expect(fast.frames).toBeLessThan(normal.frames);
  });
});

const POTION: Item = {
  id: "test-potion",
  name: "Potion",
  target: "single",
  effects: [{ kind: "heal", amount: 500 }],
};
const FEATHER: Item = {
  id: "test-feather",
  name: "Feather",
  target: "single",
  effects: [{ kind: "revive", hpPercent: 50 }],
};
const TONIC: Item = {
  id: "test-tonic",
  name: "Tonic",
  target: "party",
  effects: [{ kind: "bb_fill", bc: 5 }],
};

function itemBattle(): BattleState {
  return createBattle(
    {
      ...TEST_BATTLE_SETUP,
      items: [
        { item: POTION, count: 2 },
        { item: FEATHER, count: 1 },
        { item: TONIC, count: 1 },
      ],
    },
    1,
  );
}

describe("item bar", () => {
  const tap = classifyGesture({ x: 0, y: 0, timeMs: 0 }, { x: 0, y: 0, timeMs: 50 });

  it("has a touch region per inventory item", () => {
    const state = itemBattle();
    const r = itemSlotRect(2);
    expect(hitTest(hitRegions(state), r.x + 5, r.y + 5)).toEqual({
      kind: "item",
      item: "test-tonic",
    });
    const empty = itemSlotRect(3);
    expect(hitTest(hitRegions(state), empty.x + 5, empty.y + 5)).toBeUndefined();
  });

  it("uses a party item on tap", () => {
    const state = itemBattle();
    const result = toEngineInput(INITIAL_INPUT_UI, state, tap, {
      kind: "item",
      item: "test-tonic",
    });
    expect(result.input).toEqual({ type: "item", tick: 3, actor: "p0", item: "test-tonic" });
  });

  it("selects a single-target item, then uses it on the tapped unit (KO'd ones too)", () => {
    const base = itemBattle();
    const state: BattleState = {
      ...base,
      party: base.party.map((u) => (u.slot === "p2" ? { ...u, hp: 0 } : u)),
    };
    const pick = toEngineInput(INITIAL_INPUT_UI, state, tap, {
      kind: "item",
      item: "test-feather",
    });
    expect(pick.input).toBeUndefined();
    expect(pick.ui.selectedItem).toBe("test-feather");
    const again = toEngineInput(pick.ui, state, tap, { kind: "item", item: "test-feather" });
    expect(again.ui.selectedItem).toBeUndefined();
    const use = toEngineInput(pick.ui, state, tap, { kind: "unit", slot: "p2" });
    expect(use.input).toEqual({ type: "item", tick: 3, actor: "p2", item: "test-feather" });
    expect(use.ui.selectedItem).toBeUndefined();
  });

  it("counts items down on the HUD from ItemUsed", () => {
    const state = itemBattle();
    let live = queueInput(startLive(state), {
      type: "item",
      tick: 0,
      actor: "p0",
      item: "test-tonic",
    });
    const { live: after, events } = advanceLive(live, 5);
    live = after;
    const hud = applyHudEvents(initHud(state), events);
    expect(initHud(state).items.map((i) => [i.id, i.count])).toEqual([
      ["test-potion", 2],
      ["test-feather", 1],
      ["test-tonic", 1],
    ]);
    expect(hud.items.find((i) => i.id === "test-tonic")?.count).toBe(0);
    expect(live.state.items.find((s) => s.item.id === "test-tonic")?.count).toBe(0);
  });
});
