import {
  CONTENT_VERSION,
  type Enemy,
  EnemySchema,
  type Sphere,
  type Stage,
  type Stats,
  sphereContent,
  stageFormChanges,
} from "@bfr/data";
import ashboundSentry from "@bfr/data/content/enemies/ch1-ashbound-sentry.json";
import bramblePup from "@bfr/data/content/enemies/ch1-bramble-pup.json";
import cinderMoth from "@bfr/data/content/enemies/ch1-cinder-moth.json";
import gravemaw from "@bfr/data/content/enemies/ch1-gravemaw.json";
import puddleWisp from "@bfr/data/content/enemies/ch1-puddle-wisp.json";
import sparkBeetle from "@bfr/data/content/enemies/ch1-spark-beetle.json";
import glassward from "@bfr/data/content/enemies/ch2-glassward.json";
import kilnCrab from "@bfr/data/content/enemies/ch2-kiln-crab.json";
import reedStalker from "@bfr/data/content/enemies/ch2-reed-stalker.json";
import saltfin from "@bfr/data/content/enemies/ch2-saltfin.json";
import stormRay from "@bfr/data/content/enemies/ch2-storm-ray.json";
import tidewright from "@bfr/data/content/enemies/ch2-tidewright.json";
import locke from "@bfr/data/content/enemies/trial1-locke.json";
import lockeP2 from "@bfr/data/content/enemies/trial1-locke-p2.json";
import ozric from "@bfr/data/content/enemies/trial2-ozric.json";
import ozricP2 from "@bfr/data/content/enemies/trial2-ozric-p2.json";
import {
  AUTO_UNIT_MODES,
  type AutoSettings,
  type AutoUnitMode,
  type BattleSetup,
  type EnemySetup,
  type PlayerSlotId,
  type SquadMemberSetup,
  type UnitTypeRoll,
} from "@bfr/engine";
import { BATTLE_ITEMS } from "../quests/item-loadout.ts";
import { STORY_STAGES } from "../quests/quest-map.ts";
import { trialStage } from "../quests/trials.ts";
import { formArtFile, statsAtLevel, unitContent } from "../units/owned-units.ts";

/**
 * Battle sessions (M3-04B): `start_battle` records a `battle_sessions` row with the stage, a
 * server-rolled seed, and a snapshot of the squad. This turns that row into the engine setup the
 * battle page plays, so the client never picks its own seed or squad. Pure and testable; the
 * finish route (M3-04C) replays against the same setup.
 */

/** The `battle_sessions` columns the battle page selects. */
export const BATTLE_SESSION_COLUMNS =
  "id, stage_id, seed, squad, items, spark_assist, auto_settings, content_version, expires_at, finished_at";

export type SnapshotUnit = {
  owned_unit_id: string | null;
  kind?: "guest";
  unit_id: string;
  form_id: string;
  level: number;
  bb_level?: number;
  sbb_level?: number;
  imps?: Stats;
  spheres?: string[];
  second_sphere_slot?: boolean;
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
  items?: { item: string; count: number }[];
  /** Spark assist frozen from the player's settings when the session was issued (M7-01_2). */
  spark_assist?: boolean;
  /**
   * Auto Battle Advance Settings frozen from the player's settings when the session was issued
   * (M7-01_3): per-unit modes keyed by owned unit id and the three toggles. `{}` is the default.
   */
  auto_settings?: SessionAutoSettingsRow | null;
  content_version: string;
  expires_at: string;
  finished_at: string | null;
  continued_turn?: number | null;
};

/** `battle_sessions.auto_settings` as the session trigger writes it (M7-01_3). */
export type SessionAutoSettingsRow = {
  unit_auto_modes?: unknown;
  sbb_priority?: unknown;
  forced_bb_priority?: unknown;
  od_ubb_priority?: unknown;
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
  [
    ashboundSentry,
    bramblePup,
    cinderMoth,
    gravemaw,
    puddleWisp,
    sparkBeetle,
    saltfin,
    kilnCrab,
    reedStalker,
    stormRay,
    glassward,
    tidewright,
    locke,
    lockeP2,
    ozric,
    ozricP2,
  ].map((json) => {
    const enemy = EnemySchema.parse(json);
    return [enemy.id, enemy];
  }),
);

const ITEMS = new Map(BATTLE_ITEMS.map((item) => [item.id, item]));

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a `?session=` value can be a `battle_sessions.id`; others are rejected without a query. */
export function isBattleSessionId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function storyStage(stageId: string): Stage | undefined {
  return STORY_STAGES.find((stage) => stage.id === stageId);
}

/** The story or trial stage a session can play (M6-01A_1); dungeons are not playable yet. */
export function sessionStage(stageId: string): Stage | undefined {
  return storyStage(stageId) ?? trialStage(stageId);
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
  if (!statsAtLevel(form, level, row.unit_type, row.imps)) {
    return `${unit.name}'s level or type is not valid in this version of the game.`;
  }
  if (
    [row.bb_level, row.sbb_level].some(
      (value) => value !== undefined && (!Number.isInteger(value) || value < 1 || value > 10),
    )
  )
    return `${unit.name}'s burst levels are not valid in this version of the game.`;
  const art = formArtFile(unit.id, form.rarity);
  const spheres: Sphere[] = [];
  for (const id of row.spheres ?? []) {
    const sphere = sphereContent(id);
    if (!sphere) return `${unit.name}'s sphere is not in this version of the game.`;
    spheres.push(sphere);
  }
  if (
    spheres.length > (row.second_sphere_slot === true ? 2 : 1) ||
    spheres.filter((sphere) => sphere.kind === "all-stat").length > 1
  ) {
    return `${unit.name}'s sphere slots are not valid in this version of the game.`;
  }
  return {
    setup: {
      unit,
      formId: form.id,
      level,
      ...(row.bb_level !== undefined || row.sbb_level !== undefined
        ? { burstLevels: { bb: row.bb_level, sbb: row.sbb_level } }
        : {}),
      ...(row.unit_type ? { unitType: row.unit_type } : {}),
      ...(row.imps ? { imps: row.imps } : {}),
      ...(spheres.length ? { spheres, secondSphereSlot: row.second_sphere_slot === true } : {}),
    },
    art: art ? unit.id : "",
    artForm: art ?? undefined,
  };
}

function isAutoMode(value: unknown): value is AutoUnitMode {
  return typeof value === "string" && (AUTO_UNIT_MODES as readonly string[]).includes(value);
}

/**
 * The engine's `autoSettings` for a session (M7-01_3): the frozen per-unit modes move from owned
 * unit ids to the squad's party slots (`p0`…, by snapshot order), and the toggles carry over. The
 * ally slot and units no longer in the squad stay Auto; malformed values are ignored. Undefined
 * when everything is the default, so a default player's setup is unchanged.
 */
export function sessionAutoSettings(
  row: Pick<BattleSessionRow, "auto_settings" | "squad">,
): AutoSettings | undefined {
  const frozen = row.auto_settings;
  if (typeof frozen !== "object" || frozen === null) return undefined;
  const saved =
    typeof frozen.unit_auto_modes === "object" &&
    frozen.unit_auto_modes !== null &&
    !Array.isArray(frozen.unit_auto_modes)
      ? (frozen.unit_auto_modes as Record<string, unknown>)
      : {};
  const modes: Partial<Record<PlayerSlotId, AutoUnitMode>> = {};
  row.squad.units.forEach((unit, index) => {
    const mode = unit.owned_unit_id === null ? undefined : saved[unit.owned_unit_id];
    if (isAutoMode(mode) && mode !== "auto") modes[`p${index}`] = mode;
  });
  const settings: AutoSettings = {
    ...(Object.keys(modes).length > 0 ? { modes } : {}),
    ...(frozen.sbb_priority === true ? { sbbPriority: true } : {}),
    ...(frozen.forced_bb_priority === true ? { forcedBbPriority: true } : {}),
    ...(frozen.od_ubb_priority === true ? { odUbbPriority: true } : {}),
  };
  return Object.keys(settings).length > 0 ? settings : undefined;
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

/**
 * The engine setup and art for a session: its story or trial stage fought by the snapshotted
 * squad. A trial's setup carries `trial: true`, so the engine refuses continues (RESOLVED-17).
 */
export function sessionBattle(row: BattleSessionRow): SessionBattleResult {
  const stage = sessionStage(row.stage_id);
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

  const items: NonNullable<BattleSetup["items"]>[number][] = [];
  for (const entry of row.items ?? []) {
    const item = ITEMS.get(entry.item);
    if (
      !item ||
      !Number.isInteger(entry.count) ||
      entry.count < 1 ||
      entry.count > 10 ||
      items.some((stack) => stack.item.id === entry.item)
    )
      return { ok: false, message: "This battle's item loadout is invalid." };
    items.push({ item, count: entry.count });
  }
  if (items.length > 5) return { ok: false, message: "This battle's item loadout is invalid." };

  let setup: BattleSetup = {
    squad: squad.map((m) => m.setup),
    leaderIndex,
    ...(allyMember ? { ally: { ...allyMember.setup, kind: ally?.kind ?? "duplicate" } } : {}),
    waves,
    items,
    ...(stage.trial ? { trial: true } : {}),
    // The session's frozen copy, so the battle page and the server replay use one spark window.
    ...(row.spark_assist === true ? { sparkAssist: true } : {}),
  };
  // Likewise the frozen auto-battle settings, which `autoInputs` reads from the battle state.
  const autoSettings = sessionAutoSettings(row);
  if (autoSettings) setup = { ...setup, autoSettings };
  const formChanges = stageFormChanges(stage);
  if (formChanges.length > 0) setup = { ...setup, formChanges };
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
