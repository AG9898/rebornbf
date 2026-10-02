import { CONTENT_VERSION } from "@bfr/data";
import { createBattle } from "@bfr/engine";
import { describe, expect, it } from "vitest";
import { STORY_STAGES } from "../quests/quest-map.ts";
import { unitContent } from "../units/owned-units.ts";
import {
  type BattleSessionRow,
  isBattleSessionId,
  type SnapshotUnit,
  sessionBattle,
  sessionProblem,
} from "./session-battle.ts";

const NOW = new Date("2026-09-28T12:00:00Z");

function snap(unitId: string, formId: string, level = 1): SnapshotUnit {
  return { owned_unit_id: `id-${unitId}`, unit_id: unitId, form_id: formId, level };
}

function row(overrides: Partial<BattleSessionRow> = {}): BattleSessionRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    stage_id: STORY_STAGES[0]?.id ?? "",
    seed: 4294967295,
    squad: {
      leader_index: 1,
      units: [snap("maren", "maren-3"), snap("brand", "brand-3")],
      ally: snap("rook", "rook-3"),
    },
    content_version: CONTENT_VERSION,
    expires_at: "2026-09-28T13:00:00Z",
    finished_at: null,
    ...overrides,
  };
}

describe("session battle (M3-04B)", () => {
  it("uses frozen hob totals once for playback/replay, including duplicate allies", () => {
    const imps = { hp: 150, atk: 60, def: 60, rec: 60 };
    const snapshot = { ...snap("brand", "brand-3"), imps };
    const result = sessionBattle(
      row({ squad: { leader_index: 0, units: [snapshot], ally: snapshot } }),
    );
    if (!result.ok) throw new Error(result.message);
    const battle = createBattle(result.battle.setup, result.battle.seed);
    expect(battle.party.map((unit) => unit.stats)).toEqual([
      { hp: 1634, atk: 690, def: 577, rec: 464 },
      { hp: 1634, atk: 690, def: 577, rec: 464 },
    ]);
    expect(createBattle(result.battle.setup, result.battle.seed)).toEqual(battle);
    expect(
      sessionBattle(
        row({
          squad: {
            leader_index: 0,
            units: [{ ...snapshot, imps: { ...imps, hp: 501 } }],
            ally: null,
          },
        }),
      ).ok,
    ).toBe(false);
  });
  it("resolves the frozen loadout and rejects invalid or non-battle items", () => {
    const result = sessionBattle(row({ items: [{ item: "dew-tonic", count: 2 }] }));
    if (!result.ok) throw new Error(result.message);
    expect(createBattle(result.battle.setup, result.battle.seed).items).toMatchObject([
      { item: { id: "dew-tonic", effects: [{ kind: "heal", amount: 100 }] }, count: 2 },
    ]);
    for (const items of [
      [{ item: "crown-shard", count: 1 }],
      [{ item: "missing", count: 1 }],
      [{ item: "dew-tonic", count: 0 }],
      [{ item: "dew-tonic", count: 11 }],
      [{ item: "dew-tonic", count: 1.5 }],
      [
        { item: "dew-tonic", count: 1 },
        { item: "dew-tonic", count: 2 },
      ],
      [
        "dew-tonic",
        "bright-tonic",
        "grand-tonic",
        "rekindle-ash",
        "valor-draught",
        "bitterleaf",
      ].map((item) => ({ item, count: 1 })),
    ])
      expect(sessionBattle(row({ items })).ok).toBe(false);
  });
  it("resolves frozen sphere IDs identically for playback and replay", () => {
    const result = sessionBattle(
      row({
        squad: {
          leader_index: 0,
          units: [
            {
              ...snap("brand", "brand-3"),
              spheres: ["wayfarer-seal", "emberheart"],
              second_sphere_slot: true,
            },
          ],
          ally: null,
        },
      }),
    );
    if (!result.ok) throw new Error(result.message);
    expect(result.battle.setup.squad[0]?.spheres?.map((s) => s.id)).toEqual([
      "wayfarer-seal",
      "emberheart",
    ]);
    expect(
      createBattle(result.battle.setup, result.battle.seed).party[0]?.effects.filter(
        (e) => e.source === "sphere",
      ),
    ).toHaveLength(7);
  });
  it("refuses unknown sphere IDs, a locked second slot, and two all-stat spheres", () => {
    for (const gear of [
      { spheres: ["missing"] },
      { spheres: ["wayfarer-seal", "emberheart"] },
      { spheres: ["wayfarer-seal", "vanguard-seal"], second_sphere_slot: true },
    ]) {
      expect(
        sessionBattle(
          row({
            squad: {
              leader_index: 0,
              units: [{ ...snap("brand", "brand-omni"), ...gear }],
              ally: null,
            },
          }),
        ).ok,
      ).toBe(false);
    }
  });
  it("uses the frozen burst levels for playback and replay", () => {
    const result = sessionBattle(
      row({
        squad: {
          leader_index: 0,
          units: [{ ...snap("brand", "brand-omni"), bb_level: 10, sbb_level: 2 }],
          ally: { ...snap("maren", "maren-omni"), bb_level: 10, sbb_level: 10 },
        },
      }),
    );
    if (!result.ok) throw new Error(result.message);
    expect(result.battle.setup.squad[0]?.burstLevels).toEqual({ bb: 10, sbb: 2 });
    const state = createBattle(result.battle.setup, result.battle.seed);
    expect(state.party[0]?.form.bursts.ubb).toBeUndefined();
    expect(state.party[1]?.form.bursts.ubb).toBeDefined();
  });
  it("rejects corrupt persisted burst levels before playback", () => {
    for (const value of [0, 11, 1.5]) {
      expect(
        sessionBattle(
          row({
            squad: {
              leader_index: 0,
              units: [{ ...snap("brand", "brand-3"), bb_level: value }],
              ally: null,
            },
          }),
        ).ok,
      ).toBe(false);
    }
  });
  it("plays the server's scaled guest snapshot as a guest with Lord stats", () => {
    const result = sessionBattle(
      row({
        squad: {
          leader_index: 0,
          units: [snap("brand", "brand-3")],
          ally: {
            owned_unit_id: null,
            unit_id: "aurelle",
            form_id: "aurelle-6",
            level: 100,
            unit_type: null,
            kind: "guest",
          },
        },
      }),
    );
    if (!result.ok) throw new Error(result.message);
    expect(result.battle.setup.ally).toMatchObject({
      kind: "guest",
      formId: "aurelle-6",
      level: 100,
    });
    expect(createBattle(result.battle.setup, result.battle.seed).party[1]?.stats).toEqual(
      unitContent("aurelle")?.forms.find((form) => form.id === "aurelle-6")?.stats.max,
    );
  });
  it("builds the stage's waves and the snapshotted squad at level-1 stats", () => {
    const result = sessionBattle(row());
    if (!result.ok) throw new Error(result.message);
    const { setup, seed, stage, partyArt, partyArtForms } = result.battle;
    expect(stage.id).toBe(STORY_STAGES[0]?.id);
    expect(seed).toBe(4294967295);
    expect(setup.squad.map((m) => m.formId)).toEqual(["maren-3", "brand-3"]);
    expect(setup.leaderIndex).toBe(1);
    expect(setup.ally).toMatchObject({ formId: "rook-3", kind: "duplicate" });
    const maren = unitContent("maren")?.forms.find((f) => f.id === "maren-3");
    expect(setup.squad[0]).toMatchObject({ level: 1 });
    expect(createBattle(setup, seed).party[0]?.stats).toEqual(maren?.stats.base);
    expect(setup.waves.map((w) => w.map((e) => e.id))).toEqual(
      STORY_STAGES[0]?.waves.map((w) => w.enemies.map((e) => e.enemy)),
    );
    expect(partyArt).toEqual(["maren", "brand", "rook"]);
    expect(partyArtForms).toEqual(["3star", "3star", "3star"]);
    // The engine accepts the setup and the session seed.
    expect(createBattle(setup, seed).party).toHaveLength(3);
  });

  it("builds every story stage in both chapters", () => {
    for (const stage of STORY_STAGES) {
      expect(sessionBattle(row({ stage_id: stage.id })).ok).toBe(true);
    }
  });

  it("builds a trial session with trial: true and story sessions without it (M6-01A_1)", () => {
    const trial = sessionBattle(row({ stage_id: "trial-01-captain-locke" }));
    if (!trial.ok) throw new Error(trial.message);
    expect(trial.battle.setup.trial).toBe(true);
    expect(trial.battle.setup.waves.map((wave) => wave.map((enemy) => enemy.id))).toEqual([
      ["trial1-locke"],
      ["trial1-locke-p2"],
    ]);
    expect(createBattle(trial.battle.setup, trial.battle.seed).trial).toBe(true);

    const story = sessionBattle(row());
    if (!story.ok) throw new Error(story.message);
    expect(story.battle.setup.trial).toBeUndefined();
    expect(createBattle(story.battle.setup, story.battle.seed).trial).toBe(false);
  });

  it("builds Trial 2 with its turn-triggered form change (M6-01B_2)", () => {
    const trial = sessionBattle(row({ stage_id: "trial-02-master-ozric" }));
    if (!trial.ok) throw new Error(trial.message);
    expect(trial.battle.setup.trial).toBe(true);
    expect(trial.battle.setup.waves.map((wave) => wave.map((enemy) => enemy.id))).toEqual([
      ["trial2-ozric"],
      ["trial2-ozric-p2"],
    ]);
    expect(trial.battle.setup.formChanges).toEqual([{ wave: 0, afterTurns: 5 }]);
    expect(createBattle(trial.battle.setup, trial.battle.seed).formChanges).toHaveLength(1);
  });

  it("omits the ally when the squad has none", () => {
    const result = sessionBattle(
      row({ squad: { leader_index: 0, units: [snap("brand", "brand-3")], ally: null } }),
    );
    expect(result.ok && result.battle.setup.ally).toBeUndefined();
  });

  it("rejects stages and units this build does not have", () => {
    expect(sessionBattle(row({ stage_id: "demo-stage" })).ok).toBe(false);
    const unknown = row({
      squad: { leader_index: 0, units: [snap("nobody", "nobody-3")], ally: null },
    });
    expect(sessionBattle(unknown).ok).toBe(false);
  });

  it("accepts mid-level units with their persisted type roll (M1-08D)", () => {
    const anima = { type: "anima" as const, gains: { hp: 7, atk: 0, def: 0, rec: -2 } };
    const mid = row({
      squad: {
        leader_index: 0,
        units: [{ ...snap("brand", "brand-3", 20), unit_type: anima }, snap("maren", "maren-3", 7)],
        ally: null,
      },
    });
    const result = sessionBattle(mid);
    if (!result.ok) throw new Error(result.message);
    expect(result.battle.setup.squad[0]).toMatchObject({ level: 20, unitType: anima });
    expect(result.battle.setup.squad[1]).not.toHaveProperty("unitType");
    // The engine applies the roll once: the Brand 3★ Anima level-20 worked example.
    const party = createBattle(result.battle.setup, result.battle.seed).party;
    expect(party[0]?.stats).toEqual({ hp: 2120, atk: 769, def: 657, rec: 511 });
  });

  it("rejects levels outside the form and invalid type rolls", () => {
    const over = row({
      squad: { leader_index: 0, units: [snap("brand", "brand-3", 41)], ally: null },
    });
    expect(sessionBattle(over)).toMatchObject({ ok: false });
    const bad = row({
      squad: {
        leader_index: 0,
        units: [
          {
            ...snap("brand", "brand-3", 5),
            unit_type: { type: "guardian", gains: { hp: 0, atk: 0, def: 4, rec: 0 } },
          },
        ],
        ally: null,
      },
    });
    expect(sessionBattle(bad)).toMatchObject({ ok: false });
  });

  it("refuses finished, expired, and other-content sessions", () => {
    expect(sessionProblem(row(), NOW)).toBeNull();
    expect(sessionProblem(row({ finished_at: "2026-09-28T12:10:00Z" }), NOW)).toMatch(/finished/);
    expect(sessionProblem(row({ expires_at: "2026-09-28T12:00:00Z" }), NOW)).toMatch(/expired/);
    expect(sessionProblem(row({ content_version: "0000000000000000" }), NOW)).toMatch(/updated/);
  });

  it("accepts only uuid session ids", () => {
    expect(isBattleSessionId("00000000-0000-0000-0000-000000000001")).toBe(true);
    expect(isBattleSessionId("1; drop table")).toBe(false);
  });
});
