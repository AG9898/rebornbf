/**
 * The parts of the `cheahjs/bravefrontier_data` Global export the unit importer reads
 * (UNIT_ROADMAP → Data sources). Only the fields used are typed; the export carries many more.
 * Every shape here is the export's own, keys and all.
 */

/** One entry of a `damage frames` list: the frames and per-hit share of one attack or proc. */
export interface SourceDamageFrames {
  "frame times": number[];
  "hit dmg% distribution": number[];
  hits: number;
  /** `"<ms>/<frames>"`, e.g. `"33.3/2"`: the proc's delay before its first frame. */
  "effect delay time(ms)/frame"?: string;
  "proc id"?: string;
}

/** One burst or skill effect: a proc (`proc id`) or passive (`passive id`) with named params. */
export type SourceEffect = Record<string, unknown>;

export interface SourceBurstLevel {
  "bc cost": number;
  effects: SourceEffect[];
}

export interface SourceBurst {
  id: string;
  name: string;
  desc: string;
  "drop check count": number;
  "damage frames": SourceDamageFrames[];
  levels: SourceBurstLevel[];
}

export interface SourceSkill {
  id: string;
  name: string;
  desc: string;
  effects: SourceEffect[];
}

export interface SourceStats {
  hp: number;
  atk: number;
  def: number;
  rec: number;
}

export interface SourceUnit {
  id: number;
  name: string;
  category: number;
  rarity: number;
  element: string;
  kind: string | null;
  exp_pattern: number;
  "drop check count": number;
  "damage frames": SourceDamageFrames;
  movement: { attack: { "move type": string }; skill: { "move type": string } };
  stats: { _base: SourceStats; _lord: SourceStats };
  imp?: { "max hp": string; "max atk": string; "max def": string; "max rec": string };
  bb?: SourceBurst;
  sbb?: SourceBurst;
  ubb?: SourceBurst;
  "leader skill"?: SourceSkill;
  "extra skill"?: SourceSkill;
}

/** `evo_list.json`: the recipe that evolves a unit into the next form of its line. */
export interface SourceEvolution {
  amount: number;
  evo: { id: number; name: string; rarity: number };
  mats: Array<{ id: string; name: string; type: "unit" | "item" }>;
}

/** `items.json`: an item (only evolution materials are imported). */
export interface SourceItem {
  id: number;
  name: string;
  desc: string;
  type: string;
}

/**
 * What the importer reads, keyed by source ID string: the three export files, plus each unit's
 * max level from the archive's `F_UNIT_MST` (`unitMaxLevel`), which the export lacks.
 */
export interface SourceData {
  units: Readonly<Record<string, SourceUnit>>;
  evolutions: Readonly<Record<string, SourceEvolution>>;
  items: Readonly<Record<string, SourceItem>>;
  maxLevels: Readonly<Record<string, number>>;
}
