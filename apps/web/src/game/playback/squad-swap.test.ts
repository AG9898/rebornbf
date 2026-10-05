import { type BattleEvent, type BattleSetup, createBattle, type EnemySetup } from "@bfr/engine";
import { describe, expect, it } from "vitest";
import { dueAutoInputs, INITIAL_CONTROLS, playbackSteps } from "../hud/controls.ts";
import { applyHudEvents, initHud } from "../hud/model.ts";
import { advanceLive, isOver, queueInput, startLive } from "./live.ts";
import {
  advanceSquadSwap,
  SQUAD_SWAP_MS,
  SQUAD_SWAP_TOTAL_MS,
  type SquadSwap,
  squadBanner,
  squadSwapFrame,
  squadSwapPlacement,
  startSquadSwap,
  swapHoldsInput,
} from "./squad-swap.ts";
import { TEST_BATTLE_SETUP } from "./test-battle.ts";

const FRAME_MS = 1000 / 60;

const [brand, maren, rook, garrick] = TEST_BATTLE_SETUP.squad;
const [[slime] = []] = TEST_BATTLE_SETUP.waves;
if (!brand || !maren || !rook || !garrick || !slime) throw new Error("test battle changed");

/** One-shots any test unit with its single-hit normal attack. */
const BRUTE: EnemySetup = { ...slime, stats: { hp: 1_000_000, atk: 60_000, def: 500, rec: 100 } };

/** A three-squad trial: one unit per squad, the third with a guest ally, against the brute. */
const TRIAL: BattleSetup = {
  squad: [brand],
  leaderIndex: 0,
  waves: [[BRUTE]],
  trial: true,
  reserveSquads: [
    { squad: [maren], leaderIndex: 0 },
    { squad: [rook], leaderIndex: 0, ally: { ...garrick, kind: "guest" } },
  ],
};

const AUTO = { ...INITIAL_CONTROLS, auto: true };

/** Runs the battle on auto (the brute wipes each squad in turn, auto acting for each) to its end. */
function playAuto(setup: BattleSetup): BattleEvent[] {
  let live = startLive(createBattle(setup, 7));
  const events: BattleEvent[] = [];
  for (let ms = 0; ms <= 120_000 && !isOver(live); ms += FRAME_MS) {
    for (const input of dueAutoInputs(AUTO, live, undefined)) live = queueInput(live, input);
    const result = advanceLive(live, ms);
    live = result.live;
    events.push(...result.events);
  }
  return events;
}

/** Plays a swap frame by frame; returns the frames it held input and the beats it showed. */
function play(swap: SquadSwap, speed: 1 | 2) {
  let s = swap;
  let held = 0;
  const beats: string[] = [];
  while (swapHoldsInput(s)) {
    held += 1;
    for (const ms of playbackSteps(FRAME_MS, speed)) s = advanceSquadSwap(s, ms);
    const beat = squadSwapFrame(s)?.beat;
    if (beat && beats.at(-1) !== beat) beats.push(beat);
  }
  return { held, beats };
}

describe("trial squad swap (M6-01L)", () => {
  it("swaps the HUD cards, leader, and ally on each SquadEntered of a wiped trial party", () => {
    const events = playAuto(TRIAL);
    const entered = events.filter((e) => e.type === "SquadEntered");
    expect(entered.map((e) => e.squad)).toEqual([1, 2]);

    const start = createBattle(TRIAL, 7);
    let hud = initHud(start);
    expect(hud.units.map((u) => u.name)).toEqual(["Brand"]);
    expect(hud.reserves).toHaveLength(2);

    const first = events.indexOf(entered[0] as BattleEvent);
    // Auto battle carries on with the new squad: it acts on its first turn.
    expect(events.slice(first).some((e) => e.type === "ActionStarted" && e.actor === "p0")).toBe(
      true,
    );
    hud = applyHudEvents(hud, events.slice(0, first + 1));
    expect(hud.squad).toBe(1);
    expect(hud.units.map((u) => ({ name: u.name, leader: u.leader, hp: u.hp }))).toEqual([
      { name: "Maren", leader: true, hp: 4000 },
    ]);

    const second = events.indexOf(entered[1] as BattleEvent);
    hud = applyHudEvents(hud, events.slice(first + 1, second + 1));
    expect(hud.squad).toBe(2);
    expect(hud.units.map((u) => [u.slot, u.name, u.leader])).toEqual([
      ["p0", "Rook", true],
      ["ally", "Garrick", false],
    ]);
    expect(hud.units.every((u) => u.bc === 0 && !u.acted)).toBe(true);
    expect(hud.reserves).toEqual([]);

    // The last squad's wipe ends the battle.
    hud = applyHudEvents(hud, events.slice(second + 1));
    expect(hud.result).toBe("lose");
  });

  it("holds input from the wipe until the new squad has entered, at x1 and x2", () => {
    expect(SQUAD_SWAP_TOTAL_MS).toBe(2100);
    const x1 = play(startSquadSwap(1), 1);
    expect(x1.beats).toEqual(["leave", "banner", "enter"]);
    expect(x1.held).toBe(Math.ceil(SQUAD_SWAP_TOTAL_MS / FRAME_MS));
    const x2 = play(startSquadSwap(1), 2);
    expect(x2.held).toBe(Math.ceil(SQUAD_SWAP_TOTAL_MS / 2 / FRAME_MS));
    expect(swapHoldsInput(undefined)).toBe(false);
    expect(swapHoldsInput(advanceSquadSwap(startSquadSwap(1), SQUAD_SWAP_TOTAL_MS))).toBe(false);
  });

  it("titles the banner with the entering squad on the wave banner plate", () => {
    expect(squadBanner(1)).toEqual({ piece: "banner-wave", title: "Squad 2" });
    expect(squadBanner(2).title).toBe("Squad 3");
    const banner = squadSwapFrame(advanceSquadSwap(startSquadSwap(2), SQUAD_SWAP_MS.leave));
    expect(banner).toEqual({ beat: "banner", index: 1, progress: 0 });
  });

  it("slides the wiped party out and the next one in, or fades in place with reduced motion", () => {
    expect(squadSwapPlacement("leave", 0, true)).toEqual({ alpha: 0.2, offsetX: 0, visible: true });
    expect(squadSwapPlacement("leave", 1, true)).toEqual({ alpha: 0, offsetX: 60, visible: true });
    expect(squadSwapPlacement("banner", 0.5, true).visible).toBe(false);
    expect(squadSwapPlacement("enter", 0, true)).toEqual({ alpha: 0, offsetX: 60, visible: true });
    expect(squadSwapPlacement("enter", 1, true)).toEqual({ alpha: 1, offsetX: 0, visible: true });
    expect(squadSwapPlacement("enter", 0.5, false)).toEqual({
      alpha: 0.5,
      offsetX: 0,
      visible: true,
    });
  });

  it("leaves single-squad battles without squad fields or swaps", () => {
    const single: BattleSetup = { ...TRIAL, reserveSquads: undefined };
    const hud = initHud(createBattle(single, 7));
    expect(hud.squad).toBe(0);
    expect(hud.reserves).toEqual([]);
    const events = playAuto(single);
    expect(events.some((e) => e.type === "SquadEntered")).toBe(false);
    expect(applyHudEvents(hud, events).units.map((u) => u.name)).toEqual(["Brand"]);
  });
});
