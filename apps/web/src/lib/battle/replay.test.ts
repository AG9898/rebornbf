import { CONTENT_VERSION } from "@bfr/data";
import {
  type BattleEvent,
  type BattleInput,
  type BattleState,
  canBurst,
  createBattle,
  endTurn,
  step,
} from "@bfr/engine";
import { describe, expect, it } from "vitest";
import { dueAutoInputs } from "../../game/hud/controls.ts";
import {
  acceptsInput,
  advanceLive,
  continueLive,
  isOver,
  type LiveBattle,
  queueInput,
  startLive,
} from "../../game/playback/live.ts";
import { STORY_STAGES } from "../quests/quest-map.ts";
import { TRIAL_STAGES } from "../quests/trials.ts";
import { type FinishSessionRow, verifyFinish } from "./finish.ts";
import {
  type BattleInputLog,
  MAX_LOG_INPUTS,
  MAX_LOG_TURNS,
  MAX_TURN_INPUTS,
  parseInputLog,
  replayBattle,
} from "./replay.ts";
import { sessionAutoSettings, sessionBattle } from "./session-battle.ts";

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
function playLive(
  start: BattleState,
  initialInputs: BattleInput[] = [],
): { live: LiveBattle; lateInputs: BattleInput[]; events: BattleEvent[] } {
  let live = startLive(start);
  for (const input of initialInputs) live = queueInput(live, input);
  let queuedTurn = -1;
  let late: BattleInput | undefined;
  const lateInputs: BattleInput[] = [];
  const events: BattleEvent[] = [];
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
    const advanced = advanceLive(live, ms);
    live = advanced.live;
    events.push(...advanced.events);
  }
  return { live, lateInputs, events };
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
      remainingItems: {},
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
      remainingItems: {},
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

describe("session item replay (M3-04J)", () => {
  const session = row({
    items: [
      { item: "valor-draught", count: 1 },
      { item: "dew-tonic", count: 3 },
    ],
  });
  const built = sessionBattle(session);
  if (!built.ok) throw new Error(built.message);
  const { setup, seed } = built.battle;
  const use: BattleInput = { type: "item", tick: 0, actor: "p0", item: "valor-draught" };
  const log = playLive(createBattle(setup, seed), [use]).live.log;

  it("verifies a used item and returns only replay-derived leftovers", () => {
    expect(verifyFinish(session, USER, JSON.parse(JSON.stringify(log)), NOW)).toEqual({
      ok: true,
      result: "win",
      turns: log.length,
      remainingItems: { "valor-draught": 0, "dew-tonic": 3 },
    });
  });

  it("refuses a forged loadout and a log that consumes more than reserved", () => {
    expect(verifyFinish(row(), USER, log, NOW)).toMatchObject({ ok: false, status: 422 });
    const first = log[0];
    if (!first) throw new Error("empty log");
    const over = [
      { ...first, inputs: [use, { ...use, actor: "p1" }, ...first.inputs.slice(1)] },
      ...log.slice(1),
    ];
    expect(verifyFinish(session, USER, over, NOW)).toMatchObject({ ok: false, status: 422 });
  });

  it("keeps only the item id, target unit, and tick from untrusted JSON", () => {
    expect(
      parseInputLog([{ inputs: [{ ...use, count: 99, effects: [{ heal: 999 }] }], endTick: 0 }]),
    ).toEqual({
      ok: true,
      log: [{ inputs: [use], endTick: 0 }],
    });
    for (const item of [null, 1, "", "Bad ID"]) {
      expect(parseInputLog([{ inputs: [{ ...use, item }], endTick: 0 }]).ok).toBe(false);
    }
  });

  it("returns unused stock on a replayed loss without treating it as a win", () => {
    let live = startLive(createBattle(setup, seed));
    live = queueInput(live, use);
    let queuedTurn = -1;
    for (let ms = 0; ms < 3_600_000 && !isOver(live); ms += 50) {
      if (acceptsInput(live) && queuedTurn !== live.state.turn) {
        queuedTurn = live.state.turn;
        for (const unit of live.state.party.filter((unit) => unit.hp > 0)) {
          live = queueInput(live, { type: "guard", tick: live.state.tick, actor: unit.slot });
        }
      }
      live = advanceLive(live, ms).live;
    }
    expect(verifyFinish(session, USER, live.log, NOW, "either")).toEqual({
      ok: true,
      result: "lose",
      turns: live.log.length,
      remainingItems: { "valor-draught": 0, "dew-tonic": 3 },
    });
    expect(verifyFinish(session, USER, live.log, NOW)).toMatchObject({ ok: false, status: 422 });
  });
});

describe("paid continue replay (M3-04E)", () => {
  const { setup, seed } = battle();
  let live = startLive(createBattle(setup, seed));
  let ms = 0;
  let queuedTurn = -1;
  for (; ms < 3_600_000 && !isOver(live); ms += 50) {
    if (acceptsInput(live) && queuedTurn !== live.state.turn) {
      queuedTurn = live.state.turn;
      for (const unit of live.state.party.filter((unit) => unit.hp > 0)) {
        live = queueInput(live, { type: "guard", tick: live.state.tick, actor: unit.slot });
      }
    }
    live = advanceLive(live, ms).live;
  }
  const lost = live;
  const paidTurn = lost.log.length;
  live = continueLive(lost).live;
  queuedTurn = -1;
  for (; ms < 7_200_000 && !isOver(live); ms += 50) {
    if (acceptsInput(live) && queuedTurn !== live.state.turn) {
      queuedTurn = live.state.turn;
      for (const input of turnInputs(live.state)) live = queueInput(live, input);
    }
    live = advanceLive(live, ms).live;
  }

  it("proves a loss before payment and resumes the same seed to a verified win", () => {
    expect(lost.state.result).toBe("lose");
    expect(verifyFinish(row(), USER, lost.log, NOW, "lose").ok).toBe(true);
    expect(verifyFinish(row(), USER, lost.log, NOW, "either")).toEqual({
      ok: true,
      result: "lose",
      turns: paidTurn,
      remainingItems: {},
    });
    expect(live.state.result).toBe("win");
    const parsed = parseInputLog(JSON.parse(JSON.stringify(live.log)));
    if (!parsed.ok) throw new Error(parsed.message);
    expect(replayBattle(setup, seed, parsed.log)).toMatchObject({ ok: true, result: "win" });
    expect(verifyFinish(row({ continued_turn: paidTurn }), USER, parsed.log, NOW).ok).toBe(true);
  });

  it("rejects unpaid, missing, moved, and extra continue markers", () => {
    expect(verifyFinish(row(), USER, live.log, NOW)).toMatchObject({ ok: false, status: 422 });
    expect(verifyFinish(row({ continued_turn: paidTurn + 1 }), USER, live.log, NOW)).toMatchObject({
      ok: false,
      status: 422,
    });
    expect(verifyFinish(row({ continued_turn: paidTurn }), USER, lost.log, NOW)).toMatchObject({
      ok: false,
      status: 422,
    });
    const extra = live.log.map((turn, index) =>
      index === live.log.length - 1 ? { ...turn, continued: true } : turn,
    );
    expect(verifyFinish(row({ continued_turn: paidTurn }), USER, extra, NOW)).toMatchObject({
      ok: false,
      status: 422,
    });
  });

  it("rejects a continue before a wipe and in a trial", () => {
    const early = [{ ...lost.log[0], continued: true }] as BattleInputLog;
    expect(replayBattle(setup, seed, early)).toMatchObject({ ok: false });
    expect(replayBattle({ ...setup, trial: true }, seed, live.log)).toMatchObject({ ok: false });
    expect(continueLive(startLive(createBattle(setup, seed))).events).toEqual([]);
    const trialLoss = { ...lost, state: { ...lost.state, trial: true } };
    expect(continueLive(trialLoss).live).toBe(trialLoss);
  });

  it("rejects malformed continue markers", () => {
    expect(parseInputLog([{ inputs: [], endTick: 1, continued: false }]).ok).toBe(false);
  });
});

/** The events a replay of `log` produces, as the finish route drives the engine. */
function replayEvents(row: FinishSessionRow, log: BattleInputLog): BattleEvent[] {
  const built = sessionBattle(row);
  if (!built.ok) throw new Error(built.message);
  let state = createBattle(built.battle.setup, built.battle.seed);
  const events: BattleEvent[] = [];
  for (const { inputs, endTick } of log) {
    const player = step(state, inputs, { untilTick: endTick });
    const enemy = endTurn(player.state);
    events.push(...player.events, ...enemy.events);
    state = enemy.state;
  }
  return events;
}

describe("session spark assist (M7-01_2)", () => {
  const assisted = row({ spark_assist: true });
  const built = sessionBattle(assisted);
  if (!built.ok) throw new Error(built.message);
  const { setup, seed } = built.battle;
  const { live, events } = playLive(createBattle(setup, seed));

  it("puts the session's frozen spark assist into the battle setup", () => {
    expect(setup.sparkAssist).toBe(true);
    expect(createBattle(setup, seed).sparkWindowTicks).toBe(2);
    expect(battle().setup.sparkAssist).toBeUndefined();
    expect(createBattle(battle().setup, seed).sparkWindowTicks).toBe(1);
  });

  it("replays on the server with the same spark window and event log", () => {
    expect(live.state.result).toBe("win");
    const log = JSON.parse(JSON.stringify(live.log)) as BattleInputLog;
    expect(verifyFinish(assisted, USER, log, NOW)).toMatchObject({ ok: true, result: "win" });
    expect(replayEvents(assisted, log)).toEqual(events);
  });
});

/** Plays `start` on Auto as the battle page does: 50 ms frames, `dueAutoInputs` queued each frame. */
function playAuto(start: BattleState): { live: LiveBattle; events: BattleEvent[] } {
  let live = startLive(start);
  const events: BattleEvent[] = [];
  for (let ms = 0; ms < 3_600_000 && !isOver(live); ms += 50) {
    for (const input of dueAutoInputs({ auto: true, speed: 1 }, live)) {
      live = queueInput(live, input);
    }
    const advanced = advanceLive(live, ms);
    live = advanced.live;
    events.push(...advanced.events);
  }
  return { live, events };
}

describe("session auto-battle settings (M7-01_3)", () => {
  const frozen = {
    unit_auto_modes: { "owned-maren": "guard", "owned-rook": "attack", "owned-brand": "auto" },
    sbb_priority: true,
    forced_bb_priority: false,
    od_ubb_priority: true,
  };
  const configured = row({ auto_settings: frozen });

  it("maps owned-unit modes to party slots and keeps the toggles", () => {
    expect(sessionAutoSettings(configured)).toEqual({
      modes: { p1: "guard", p2: "attack" },
      sbbPriority: true,
      odUbbPriority: true,
    });
  });

  it("leaves a default session's setup without auto settings and ignores bad values", () => {
    expect(sessionAutoSettings(row())).toBeUndefined();
    expect(sessionAutoSettings(row({ auto_settings: {} }))).toBeUndefined();
    expect(battle().setup.autoSettings).toBeUndefined();
    expect(
      sessionAutoSettings(
        row({
          auto_settings: {
            unit_auto_modes: { "owned-brand": "nuke", "someone-else": "guard" },
            sbb_priority: "yes",
          },
        }),
      ),
    ).toBeUndefined();
  });

  it("puts the frozen settings into the session's battle setup", () => {
    const built = sessionBattle(configured);
    if (!built.ok) throw new Error(built.message);
    expect(built.battle.setup.autoSettings).toEqual(sessionAutoSettings(configured));
    expect(createBattle(built.battle.setup, built.battle.seed).autoSettings).toEqual(
      sessionAutoSettings(configured),
    );
  });

  it("replays an auto battle on the server to the client's event log", () => {
    const built = sessionBattle(configured);
    if (!built.ok) throw new Error(built.message);
    const { live, events } = playAuto(createBattle(built.battle.setup, built.battle.seed));
    expect(isOver(live)).toBe(true);
    // The frozen modes drove the client: Maren guarded and Rook never burst.
    const inputs = live.log.flatMap((turn) => turn.inputs);
    expect(inputs.filter((input) => input.actor === "p1").every((i) => i.type === "guard")).toBe(
      true,
    );
    expect(inputs.some((input) => input.actor === "p2" && input.type === "burst")).toBe(false);
    const log = JSON.parse(JSON.stringify(live.log)) as BattleInputLog;
    expect(verifyFinish(configured, USER, log, NOW, "either")).toMatchObject({
      ok: true,
      result: live.state.result,
    });
    expect(replayEvents(configured, log)).toEqual(events);
  });
});

describe("three-squad trial replay (M6-01J)", () => {
  const party = (ids: string[]) => ({
    leader_index: 0,
    units: ids.map((id) => ({
      owned_unit_id: `owned-${id}`,
      unit_id: id,
      form_id: `${id}-3`,
      level: 1,
    })),
    ally: null,
  });
  const session = row({
    stage_id: TRIAL_STAGES[0]?.id ?? "",
    squad: {
      ...party(["brand", "maren"]),
      reserves: [party(["rook", "garrick"]), party(["solen"])],
    },
  });
  const built = sessionBattle(session);
  if (!built.ok) throw new Error(built.message);
  const { setup, seed } = built.battle;
  const { live, events } = playLive(createBattle(setup, seed));

  it("builds the frozen reserve squads into the engine setup", () => {
    expect(setup.trial).toBe(true);
    expect(setup.squad.map((member) => member.unit.id)).toEqual(["brand", "maren"]);
    expect(setup.reserveSquads?.map((reserve) => reserve.squad.map((m) => m.unit.id))).toEqual([
      ["rook", "garrick"],
      ["solen"],
    ]);
    expect(built.battle.reserveArt.map((art) => art.partyArt.length)).toEqual([2, 1]);
  });

  it("replays the live trial on the server to the same result after squads enter", () => {
    expect(live.state.result).toBeDefined();
    expect(events.some((event) => event.type === "SquadEntered")).toBe(true);
    const parsed = parseInputLog(JSON.parse(JSON.stringify(live.log)));
    if (!parsed.ok) throw new Error(parsed.message);
    expect(verifyFinish(session, USER, parsed.log, NOW, "either")).toEqual({
      ok: true,
      result: live.state.result,
      turns: live.log.length,
      remainingItems: {},
    });
  });

  it("refuses a session with more than two reserve squads", () => {
    const reserves = [party(["rook"]), party(["garrick"]), party(["solen"])];
    expect(sessionBattle({ ...session, squad: { ...session.squad, reserves } })).toEqual({
      ok: false,
      message: "This battle's squads are invalid.",
    });
  });
});
