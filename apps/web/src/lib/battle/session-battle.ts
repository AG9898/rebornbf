import { CONTENT_VERSION, type Enemy, EnemySchema, type Stage } from "@bfr/data";
import ashboundSentry from "@bfr/data/content/enemies/ch1-ashbound-sentry.json";
import bramblePup from "@bfr/data/content/enemies/ch1-bramble-pup.json";
import cinderMoth from "@bfr/data/content/enemies/ch1-cinder-moth.json";
import gravemaw from "@bfr/data/content/enemies/ch1-gravemaw.json";
import puddleWisp from "@bfr/data/content/enemies/ch1-puddle-wisp.json";
import sparkBeetle from "@bfr/data/content/enemies/ch1-spark-beetle.json";
import type { BattleSetup, EnemySetup, SquadMemberSetup, UnitTypeRoll } from "@bfr/engine";
import { STORY_STAGES } from "../quests/quest-map.ts";
import { formArtFile, statsAtLevel, unitContent } from "../units/owned-units.ts";

/**
 * Battle sessions (M3-04B): `start_battle` records a `battle_sessions` row with the stage, a
 * server-rolled seed, and a snapshot of the squad. This turns that row into the engine setup the
 * battle page plays, so the client never picks its own seed or squad. Pure and testable; the
 * finish route (M3-04C) replays against the same setup.
 */

/** The `battle_sessions` columns the battle page selects. */
export const BATTLE_SESSION_COLUMNS =
  "id, stage_id, seed, squad, content_version, expires_at, finished_at";

export type SnapshotUnit = {
  owned_unit_id: string;
  unit_id: string;
  form_id: string;
  level: number;
  /** The owned unit's persisted type roll (snapshotted since M3-01D); null or absent means Lord. */
  unit_type?: UnitTypeRoll | null;
};

/** `battle_sessions.squad`: the squad as it stood when the battle started. */
export type SquadSnapshot = {
  leader_index: number;
  units: SnapshotUnit[];
  ally: SnapshotUnit | null;
};

export type BattleSessionRow = {
  id: string;
  stage_id: string;
  seed: number;
  squad: SquadSnapshot;
  content_version: string;
  expires_at: string;
  finished_at: string | null;
};

export type SessionBattle = {
  stage: Stage;
  setup: BattleSetup;
  seed: number;
  /** `art/units/<id>` per party slot ("" when the unit has no exported art). */
  partyArt: string[];
  /** Idle form per party slot (`3star`…`omni`). */
  partyArtForms: (string | undefined)[];
};

export type SessionBattleResult =
  | { ok: true; battle: SessionBattle }
  | { ok: false; message: string };

const ENEMIES: ReadonlyMap<string, Enemy> = new Map(
  [ashboundSentry, bramblePup, cinderMoth, gravemaw, puddleWisp, sparkBeetle].map((json) => {
    const enemy = EnemySchema.parse(json);
    return [enemy.id, enemy];
  }),
);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a `?session=` value can be a `battle_sessions.id`; others are rejected without a query. */
export function isBattleSessionId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function storyStage(stageId: string): Stage | undefined {
  return STORY_STAGES.find((stage) => stage.id === stageId);
}

function enemySetup(id: string): EnemySetup | null {
  const enemy = ENEMIES.get(id);
  if (!enemy) return null;
  const { drops, ...rest } = enemy;
  return drops.bcResistance === undefined ? rest : { ...rest, bcResistance: drops.bcResistance };
}

type Member = { setup: SquadMemberSetup; art: string; artForm: string | undefined };

function member(row: SnapshotUnit): Member | string {
  const unit = unitContent(row.unit_id);
  const form = unit?.forms.find((f) => f.id === row.form_id);
  if (!unit || !form) return `${row.unit_id} is not in this version of the game.`;
  const level = Number(row.level);
  // The engine derives the stats from level + roll (GAME_DESIGN §6), so the gains are applied
  // once, here and in the server replay alike; this check only turns a bad row into a message.
  if (!statsAtLevel(form, level, row.unit_type)) {
    return `${unit.name}'s level or type is not valid in this version of the game.`;
  }
  const art = formArtFile(unit.id, form.rarity);
  return {
    setup: {
      unit,
      formId: form.id,
      level,
      ...(row.unit_type ? { unitType: row.unit_type } : {}),
    },
    art: art ? unit.id : "",
    artForm: art ?? undefined,
  };
}

/** Why a session cannot be played now, or null when it can. */
export function sessionProblem(row: BattleSessionRow, now: Date): string | null {
  if (row.finished_at !== null) return "This battle is already finished.";
  if (Date.parse(row.expires_at) <= now.getTime()) return "This battle has expired.";
  if (row.content_version !== CONTENT_VERSION) {
    return "The game was updated since this battle started. Start it again from the quest map.";
  }
  return null;
}

/** The engine setup and art for a session: its story stage fought by the snapshotted squad. */
export function sessionBattle(row: BattleSessionRow): SessionBattleResult {
  const stage = storyStage(row.stage_id);
  if (!stage) return { ok: false, message: "This stage is not in this version of the game." };

  const waves: EnemySetup[][] = [];
  for (const wave of stage.waves) {
    const enemies: EnemySetup[] = [];
    for (const slot of wave.enemies) {
      const enemy = enemySetup(slot.enemy);
      if (!enemy) return { ok: false, message: "This stage is not in this version of the game." };
      enemies.push(enemy);
    }
    waves.push(enemies);
  }

  const { units, ally, leader_index: leaderIndex } = row.squad;
  const members: Member[] = [];
  for (const unit of [...units, ...(ally ? [ally] : [])]) {
    const result = member(unit);
    if (typeof result === "string") return { ok: false, message: result };
    members.push(result);
  }
  const squad = members.slice(0, units.length);
  const allyMember = ally ? members[units.length] : undefined;

  const setup: BattleSetup = {
    squad: squad.map((m) => m.setup),
    leaderIndex,
    ...(allyMember ? { ally: { ...allyMember.setup, kind: "duplicate" as const } } : {}),
    waves,
  };
  return {
    ok: true,
    battle: {
      stage,
      setup,
      seed: Number(row.seed),
      partyArt: members.map((m) => m.art),
      partyArtForms: members.map((m) => m.artForm),
    },
  };
}
