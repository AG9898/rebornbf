import { AUTO_UNIT_MODES, type AutoUnitMode } from "@bfr/engine";

/** The saved per-player settings (M7-01_1, `public.player_settings` / `get_settings`). */
export interface PlayerSettings {
  readonly sparkAssist: boolean;
  /** Default battle playback speed. */
  readonly battleSpeed: 1 | 2;
  /** 0–100 percent. */
  readonly musicVolume: number;
  /** 0–100 percent. */
  readonly sfxVolume: number;
  readonly reducedMotion: boolean;
  /** Auto Battle Advance Settings per-unit modes, keyed by owned unit id (unset = Auto). */
  readonly unitAutoModes: Readonly<Record<string, AutoUnitMode>>;
  readonly sbbPriority: boolean;
  readonly forcedBbPriority: boolean;
  readonly odUbbPriority: boolean;
}

/** The documented defaults: what a player with no settings row gets (same as the SQL defaults). */
export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  sparkAssist: false,
  battleSpeed: 1,
  musicVolume: 50,
  sfxVolume: 70,
  reducedMotion: false,
  unitAutoModes: {},
  sbbPriority: false,
  forcedBbPriority: false,
  odUbbPriority: false,
};

/** Columns read from `get_settings` / `player_settings`. */
export interface PlayerSettingsRow {
  spark_assist?: unknown;
  battle_speed?: unknown;
  music_volume?: unknown;
  sfx_volume?: unknown;
  reduced_motion?: unknown;
  unit_auto_modes?: unknown;
  sbb_priority?: unknown;
  forced_bb_priority?: unknown;
  od_ubb_priority?: unknown;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function percent(value: unknown, fallback: number): number {
  return isPercent(value) ? value : fallback;
}

function isAutoMode(value: unknown): value is AutoUnitMode {
  return typeof value === "string" && (AUTO_UNIT_MODES as readonly string[]).includes(value);
}

function modes(value: unknown): Record<string, AutoUnitMode> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, AutoUnitMode> = {};
  for (const [unitId, mode] of Object.entries(value)) if (isAutoMode(mode)) out[unitId] = mode;
  return out;
}

/** Reads a settings row; a missing row or any malformed field falls back to the defaults. */
export function parsePlayerSettings(row: PlayerSettingsRow | null | undefined): PlayerSettings {
  const d = DEFAULT_PLAYER_SETTINGS;
  if (!row) return d;
  return {
    sparkAssist: bool(row.spark_assist, d.sparkAssist),
    battleSpeed: row.battle_speed === 2 ? 2 : row.battle_speed === 1 ? 1 : d.battleSpeed,
    musicVolume: percent(row.music_volume, d.musicVolume),
    sfxVolume: percent(row.sfx_volume, d.sfxVolume),
    reducedMotion: bool(row.reduced_motion, d.reducedMotion),
    unitAutoModes: modes(row.unit_auto_modes),
    sbbPriority: bool(row.sbb_priority, d.sbbPriority),
    forcedBbPriority: bool(row.forced_bb_priority, d.forcedBbPriority),
    odUbbPriority: bool(row.od_ubb_priority, d.odUbbPriority),
  };
}

/** The saved volumes as the audio system's 0–1 levels (M7-03A `AudioVolume`). */
export function audioLevels(settings: Pick<PlayerSettings, "musicVolume" | "sfxVolume">): {
  music: number;
  sfx: number;
} {
  return { music: settings.musicVolume / 100, sfx: settings.sfxVolume / 100 };
}

/** The fields the settings screen edits (M7-01_2), with the music and SFX volumes (M7-01_4). */
export type BattleSettingsDraft = Pick<
  PlayerSettings,
  "sparkAssist" | "battleSpeed" | "reducedMotion" | "musicVolume" | "sfxVolume"
>;

function isPercent(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
}

/** `save_settings` arguments for a draft, or null when the draft is malformed. */
export function battleSettingsArgs(draft: unknown): {
  p_spark_assist: boolean;
  p_battle_speed: 1 | 2;
  p_reduced_motion: boolean;
  p_music_volume: number;
  p_sfx_volume: number;
} | null {
  if (typeof draft !== "object" || draft === null) return null;
  const { sparkAssist, battleSpeed, reducedMotion, musicVolume, sfxVolume } = draft as Record<
    string,
    unknown
  >;
  if (typeof sparkAssist !== "boolean" || typeof reducedMotion !== "boolean") return null;
  if (battleSpeed !== 1 && battleSpeed !== 2) return null;
  if (!isPercent(musicVolume) || !isPercent(sfxVolume)) return null;
  return {
    p_spark_assist: sparkAssist,
    p_battle_speed: battleSpeed,
    p_reduced_motion: reducedMotion,
    p_music_volume: musicVolume,
    p_sfx_volume: sfxVolume,
  };
}

/** The auto-battle advanced settings the settings screen edits (M7-01_3). */
export type AutoSettingsDraft = Pick<
  PlayerSettings,
  "unitAutoModes" | "sbbPriority" | "forcedBbPriority" | "odUbbPriority"
>;

/**
 * `save_settings` arguments for an auto-settings draft, or null when it is malformed. The mode map
 * replaces the saved one whole, so Auto entries (the default) are dropped rather than stored.
 */
export function autoSettingsArgs(draft: unknown): {
  p_unit_auto_modes: Record<string, AutoUnitMode>;
  p_sbb_priority: boolean;
  p_forced_bb_priority: boolean;
  p_od_ubb_priority: boolean;
} | null {
  if (typeof draft !== "object" || draft === null) return null;
  const { unitAutoModes, sbbPriority, forcedBbPriority, odUbbPriority } = draft as Record<
    string,
    unknown
  >;
  if (
    typeof sbbPriority !== "boolean" ||
    typeof forcedBbPriority !== "boolean" ||
    typeof odUbbPriority !== "boolean"
  )
    return null;
  if (typeof unitAutoModes !== "object" || unitAutoModes === null || Array.isArray(unitAutoModes))
    return null;
  const modes: Record<string, AutoUnitMode> = {};
  for (const [unitId, mode] of Object.entries(unitAutoModes)) {
    if (!isAutoMode(mode)) return null;
    if (mode !== "auto") modes[unitId] = mode;
  }
  return {
    p_unit_auto_modes: modes,
    p_sbb_priority: sbbPriority,
    p_forced_bb_priority: forcedBbPriority,
    p_od_ubb_priority: odUbbPriority,
  };
}

/** One saved squad member as the auto-settings list shows it (M7-01_3). */
export interface AutoSettingsUnit {
  readonly id: string;
  readonly name: string;
  readonly rarityLabel: string;
  readonly level: number;
  /** The saved squads (1-based numbers) the unit is in. */
  readonly squads: readonly number[];
}

/**
 * The units the auto-settings list edits: every member of a saved squad, once each, in squad then
 * position order, with the squads it belongs to. Units missing from `owned` are skipped. Also
 * returns the saved modes limited to units the player still owns, so a save never sends a key
 * `save_settings` would reject (a unit since sold or fused away).
 */
export function autoSettingsUnits(
  squads: readonly { slot: number; unit_ids: readonly string[] }[],
  owned: readonly { id: string; name: string; rarityLabel: string; level: number }[],
  savedModes: Readonly<Record<string, AutoUnitMode>>,
): { units: AutoSettingsUnit[]; modes: Record<string, AutoUnitMode> } {
  const byId = new Map(owned.map((unit) => [unit.id, unit]));
  const units = new Map<string, AutoSettingsUnit>();
  for (const squad of [...squads].sort((a, b) => a.slot - b.slot)) {
    for (const id of squad.unit_ids) {
      const unit = byId.get(id);
      if (!unit) continue;
      const seen = units.get(id);
      const number = squad.slot + 1;
      units.set(id, {
        id,
        name: unit.name,
        rarityLabel: unit.rarityLabel,
        level: unit.level,
        squads: seen ? [...seen.squads, number] : [number],
      });
    }
  }
  const modes: Record<string, AutoUnitMode> = {};
  for (const [id, mode] of Object.entries(savedModes)) if (byId.has(id)) modes[id] = mode;
  return { units: [...units.values()], modes };
}
