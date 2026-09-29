import { CONTENT_VERSION } from "@bfr/data";
import { type BattleInput, type BattleState, canBurst, createBattle } from "@bfr/engine";
import { describe, expect, it } from "vitest";
import {
  acceptsInput,
  advanceLive,
  isOver,
  type LiveBattle,
  queueInput,
  startLive,
} from "../../game/playback/live.ts";
import { STORY_STAGES } from "../quests/quest-map.ts";
import { type FinishSessionRow, verifyFinish } from "./finish.ts";
import {
  type BattleInputLog,
  MAX_LOG_INPUTS,
  MAX_LOG_TURNS,
  MAX_TURN_INPUTS,
  parseInputLog,
  replayBattle,
} from "./replay.ts";
import { sessionBattle } from "./session-battle.ts";

const NOW = new Date("2026-09-28T12:00:00Z");
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function row(overrides: Partial<FinishSessionRow> = {}): FinishSessionRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    user_id: USER,
    stage_id: STORY_STAGES[0]?.id ?? "",
    seed: 20260928,
    squad: {
      leader_index: 0,
      units: ["brand", "maren", "rook"].map((id) => ({
        owned_unit_id: `owned-${id}`,
        unit_id: id,
        form_id: `${id}-3`,
        level: 1,
      })),
      ally: null,
    },
    content_version: CONTENT_VERSION,
    expires_at: "2026-09-28T13:00:00Z",
    finished_at: null,
    ...overrides,
  };
}

/** The unacted living units' highest charged burst, else an attack, spaced a few frames apart. */
function turnInputs(state: BattleState): BattleInput[] {
  return state.party
    .filter((unit) => unit.hp > 0 && !state.acted.includes(unit.slot))
    .map((unit, i): BattleInput => {
      const tick = state.tick + 4 * i;
      const tier = (["sbb", "bb"] as const).find((t) =>
        canBurst(unit.form, t, unit.bc, unit.overdrive),
      );
      return tier
        ? { type: "burst", tick, actor: unit.slot, tier }
        : { type: "attack", tick, actor: unit.slot };
    });
}

/**
 * Plays `start` as the battle page does: 50 ms frames, the turn's inputs but one queued at its
 * start, and the last one a frame later stamped at tick 0 (a late frame). Returns the battle and,
 * per turn, the tick each late input should run at: the one after the last stepped tick.
 */
function playLive(start: BattleState): { live: LiveBattle; lateInputs: BattleInput[] } {
  let live = startLive(start);
  let queuedTurn = -1;
  let late: BattleInput | undefined;
  const lateInputs: BattleInput[] = [];
  for (let ms = 0; ms < 3_600_000 && !isOver(live); ms += 50) {
    const { state } = live;
    if (late) {
      lateInputs.push({ ...late, tick: live.steppedTo + 1 });
      live = queueInput(live, { ...late, tick: 0 });
      late = undefined;
    } else if (acceptsInput(live) && queuedTurn !== state.turn && state.result === undefined) {
      queuedTurn = state.turn;
      const inputs = turnInputs(state);
      late = inputs.pop();
      for (const input of inputs) live = queueInput(live, input);
    }
    live = advanceLive(live, ms).live;
  }
  return { live, lateInputs };
}

function battle() {
  const built = sessionBattle(row());
  if (!built.ok) throw new Error(built.message);
  return built.battle;
}

describe("battle replay (M3-04C)", () => {
  const { setup, seed } = battle();
  const { live, lateInputs } = playLive(createBattle(setup, seed));

  it("replays a battle recorded by the live driver to the same win", () => {
    expect(live.state.result).toBe("win");
    expect(live.log.length).toBe(live.state.turn);
    // The log survives JSON (the finish request body).
    const parsed = parseInputLog(JSON.parse(JSON.stringify(live.log)));
    if (!parsed.ok) throw new Error(parsed.message);
    expect(replayBattle(setup, seed, parsed.log)).toEqual({
      ok: true,
      result: "win",
      turns: live.log.length,
    });
  });

  it("records late inputs at the tick after the last stepped tick", () => {
    expect(lateInputs.length).toBe(live.log.length);
    live.log.forEach((turn, i) => {
      expect(turn.inputs).toContainEqual(lateInputs[i]);
      expect(turn.inputs.every((input) => input.tick <= turn.endTick)).toBe(true);
    });
  });

  it("rejects a log that stops before the battle ends", () => {
    expect(replayBattle(setup, seed, live.log.slice(0, -1))).toMatchObject({ ok: false });
  });

  it("rejects turns after the battle ended", () => {
    const extra = [...live.log, { inputs: [], endTick: 1_000_000 }];
    expect(replayBattle(setup, seed, extra)).toEqual({
      ok: false,
      message: `turn ${extra.length} comes after the battle ended`,
    });
  });

  it("rejects a turn that ends before every unit has acted", () => {
    const [first, ...rest] = live.log;
    if (!first) throw new Error("empty log");
    const skipped = [{ ...first, inputs: first.inputs.slice(1) }, ...rest];
    expect(replayBattle(setup, seed, skipped)).toEqual({
      ok: false,
      message: "turn 1 ends before every unit has acted",
    });
  });

  it("rejects a turn that ends before its hits land or before its inputs", () => {
    const [first, ...rest] = live.log;
    if (!first) throw new Error("empty log");
    const early = Math.max(...first.inputs.map((input) => input.tick));
    const result = replayBattle(setup, seed, [{ ...first, endTick: early }, ...rest]);
    expect(result).toMatchObject({ ok: false });
    const before = replayBattle(setup, seed, [{ ...first, endTick: early - 1 }, ...rest]);
    expect(before).toMatchObject({ ok: false });
  });
});

describe("input log parsing (M3-04C)", () => {
  const turn = { inputs: [{ type: "attack", tick: 1, actor: "p0" }], endTick: 90 };

  it("keeps only the fields the engine reads", () => {
    const parsed = parseInputLog([
      {
        inputs: [
          { type: "burst", tick: 2, actor: "p1", tier: "bb", target: "e0", damage: 9e9 },
          { type: "guard", tick: 3, actor: "ally", target: "e1" },
        ],
        endTick: 5,
        result: "win",
      },
    ]);
    expect(parsed).toEqual({
      ok: true,
      log: [
        {
          inputs: [
            { type: "burst", tick: 2, actor: "p1", tier: "bb", target: "e0" },
            { type: "guard", tick: 3, actor: "ally" },
          ],
          endTick: 5,
        },
      ],
    });
  });

  it("rejects malformed logs", () => {
    for (const bad of [
      null,
      {},
      [],
      [[]],
      [{ inputs: [] }],
      [{ inputs: [], endTick: -1 }],
      [{ inputs: [], endTick: 1.5 }],
      [{ inputs: [{ type: "heal", tick: 1, actor: "p0" }], endTick: 2 }],
      [{ inputs: [{ type: "attack", tick: "1", actor: "p0" }], endTick: 2 }],
      [{ inputs: [{ type: "attack", tick: 1, actor: "e0" }], endTick: 2 }],
      [{ inputs: [{ type: "attack", tick: 1, actor: "p0", target: "p1" }], endTick: 2 }],
      [{ inputs: [{ type: "burst", tick: 1, actor: "p0", tier: "xbb" }], endTick: 2 }],
    ]) {
      expect(parseInputLog(bad).ok).toBe(false);
    }
  });

  it("enforces the size limits", () => {
    expect(parseInputLog(Array(MAX_LOG_TURNS).fill(turn)).ok).toBe(true);
    expect(parseInputLog(Array(MAX_LOG_TURNS + 1).fill(turn)).ok).toBe(false);
    const full = { inputs: Array(MAX_TURN_INPUTS).fill(turn.inputs[0]), endTick: 90 };
    expect(parseInputLog([full]).ok).toBe(true);
    const over = { ...full, inputs: [...full.inputs, turn.inputs[0]] };
    expect(parseInputLog([over]).ok).toBe(false);
    const turns = Math.ceil((MAX_LOG_INPUTS + 1) / MAX_TURN_INPUTS);
    expect(parseInputLog(Array(turns).fill(full)).ok).toBe(false);
  });
});

describe("finish verification (M3-04C)", () => {
  const { setup, seed } = battle();
  const log: BattleInputLog = playLive(createBattle(setup, seed)).live.log;

  it("verifies the owner's win", () => {
    expect(verifyFinish(row(), USER, log, NOW)).toEqual({
      ok: true,
      result: "win",
      turns: log.length,
    });
  });

  it("rejects a tampered log that does not replay to a win", () => {
    // Only the first turn's inputs, then turns of guarding: the party never wins.
    const [first] = log;
    if (!first) throw new Error("empty log");
    const guards: BattleInputLog = Array.from({ length: MAX_LOG_TURNS }, (_, i) => ({
      inputs: ["p0", "p1", "p2"].map((actor) => ({
        type: "guard" as const,
        tick: 100_000 * (i + 1),
        actor: actor as "p0",
      })),
      endTick: 100_000 * (i + 1),
    }));
    const tampered = verifyFinish(row(), USER, guards, NOW);
    expect(tampered).toMatchObject({ ok: false, status: 422 });
    // A claimed endTick moved before the last hit lands.
    const cut = [{ ...first, endTick: first.inputs[0]?.tick ?? 0 }, ...log.slice(1)];
    expect(verifyFinish(row(), USER, cut, NOW)).toMatchObject({ ok: false, status: 422 });
  });

  it("rejects missing, foreign, reused, and expired sessions", () => {
    expect(verifyFinish(undefined, USER, log, NOW)).toMatchObject({ ok: false, status: 404 });
    expect(verifyFinish(row({ user_id: OTHER }), USER, log, NOW)).toMatchObject({
      ok: false,
      status: 403,
    });
    const reused = row({ finished_at: "2026-09-28T12:00:00Z" });
    expect(verifyFinish(reused, USER, log, NOW)).toMatchObject({ ok: false, status: 409 });
    const expired = row({ expires_at: "2026-09-28T11:59:59Z" });
    expect(verifyFinish(expired, USER, log, NOW)).toMatchObject({ ok: false, status: 410 });
    const stale = row({ content_version: "0000000000000000" });
    expect(verifyFinish(stale, USER, log, NOW)).toMatchObject({ ok: false, status: 409 });
  });

  it("rejects a malformed log before replaying", () => {
    expect(verifyFinish(row(), USER, "win", NOW)).toMatchObject({ ok: false, status: 400 });
  });
});
