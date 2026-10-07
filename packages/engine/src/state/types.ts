import type {
  Ailment,
  AiRule,
  Attack,
  Effect,
  Element,
  EnemySkill,
  Form,
  Item,
  LeaderSkill,
  Sphere,
  Stats,
  Unit,
} from "@bfr/data";
import type { EnemyAiMemory } from "../ai/evaluate.ts";
import type { ActiveEffect } from "../effects/buffs.ts";
import type { OdGauge } from "../gauge/overdrive.ts";
import type { RngState } from "../rng.ts";
import type { SparkMark } from "../timeline/spark.ts";
import type { ScheduledHit } from "../timeline/types.ts";
import type { BurstLevels } from "./burst-levels.ts";
import type { EnhancementSelection } from "./enhancements.ts";
import type { UnitTypeRoll } from "./unit-stats.ts";

/** Squad size limit (GAME_DESIGN §2 Battle Structure): 5 units plus one optional ally. */
export const MAX_SQUAD_UNITS = 5;

interface SquadMemberBase {
  readonly unit: Unit;
  readonly formId: string;
  /**
   * BB and SBB levels, 1–10 (GAME_DESIGN §6 → Burst levels); omitted levels are 10, the kit
   * values. Below 10 the bursts scale down, and the UBB is unavailable.
   */
  readonly burstLevels?: BurstLevels;
  readonly spheres?: readonly Sphere[];
  /** Unit-specific persisted unlock, never inferred from rarity. */
  readonly secondSphereSlot?: boolean;
  /** Optional SP snapshot; only unlocked level-150 Omni members may activate selections. */
  readonly selectedEnhancements?: EnhancementSelection;
}

/** A member whose base stats are given as-is (guests, tests). */
export interface ResolvedStatsMember extends SquadMemberBase {
  readonly stats: Stats;
  readonly level?: never;
  readonly unitType?: never;
  readonly imps?: never;
}

/**
 * A member at a level with its persisted type roll (GAME_DESIGN §6 → Stat growth and unit types):
 * `createBattle` computes its stats once with `formStatsAtLevel`, so the type gains are applied
 * exactly once and never re-rolled on replay. Omni forms ignore the gains.
 */
export interface LeveledMember extends SquadMemberBase {
  readonly stats?: never;
  /** Integer 1…the form's `maxLevel`. */
  readonly level: number;
  /** Omitted means Lord (no gains). */
  readonly unitType?: UnitTypeRoll;
  /** Frozen persisted hob gains; applied after the level/type curve exactly once. */
  readonly imps?: Stats;
}

/**
 * One player unit as snapshotted into a battle: either explicit base stats, or a level plus the
 * unit's persisted type roll from which the engine derives them.
 */
export type SquadMemberSetup = ResolvedStatsMember | LeveledMember;

/** The 6th slot: a guest from the guest pool or a duplicate of one of the player's own units. */
export type AllySetup = SquadMemberSetup & {
  readonly kind: "guest" | "duplicate";
};

/**
 * One enemy in a wave. Enemies use the same stat model as units (GAME_DESIGN §5); `normalAttack`,
 * `skills`, and the `ai` script follow the content `Enemy` schema.
 */
export interface EnemySetup {
  readonly id: string;
  readonly name: string;
  readonly element: Element;
  readonly stats: Stats;
  readonly normalAttack: Attack;
  readonly skills: readonly EnemySkill[];
  /** AI rules tried in order each enemy turn; the last is the `default` rule. */
  readonly ai: readonly AiRule[];
  /**
   * Base BC drop resistance as a fraction (GAME_DESIGN §2 BC drop rate); omitted means 0. Moves to
   * the enemy drop table with M1-01B.
   */
  readonly bcResistance?: number;
}

/** Reserve squads a three-squad trial may carry after the first (GAME_DESIGN §7, RESOLVED-95). */
export const MAX_RESERVE_SQUADS = 2;

/**
 * One reserve squad (GAME_DESIGN §7 → Trials flow and three squads): its own 1–5 units, leader,
 * and optional ally. It enters, in order, when the squad before it is wiped.
 */
export interface ReserveSquadSetup {
  readonly squad: readonly SquadMemberSetup[];
  readonly leaderIndex: number;
  readonly ally?: AllySetup;
}

export interface BattleSetup {
  /** 1–5 squad units in squad order. */
  readonly squad: readonly SquadMemberSetup[];
  /** Index into `squad` of the Leader. */
  readonly leaderIndex: number;
  readonly ally?: AllySetup;
  /** 1..N waves, each with at least one enemy. */
  readonly waves: readonly (readonly EnemySetup[])[];
  /**
   * Spark assist (GAME_DESIGN §2 Sparks, RESOLVED-17): widens the spark window by
   * `SPARK_ASSIST_FACTOR`. Omitted means off. Part of the setup so replays use the same window.
   */
  readonly sparkAssist?: boolean;
  /**
   * The per-battle item inventory (GAME_DESIGN §2 → Battle items): each item at most once, with a
   * positive count. Omitted means no items.
   */
  readonly items?: readonly BattleItemStack[];
  /**
   * A trial battle (GAME_DESIGN §2 → Continue, RESOLVED-17): continues are refused. Omitted means
   * not a trial.
   */
  readonly trial?: boolean;
  /**
   * Auto Battle Advance Settings (GAME_DESIGN §2 → Auto-battle advanced settings, M1-08E): per-unit
   * modes and the three global toggles `autoInputs` follows. Omitted means the original default
   * (every unit Auto, every toggle off). Part of the setup so replays use the same settings.
   */
  readonly autoSettings?: AutoSettings;
  /**
   * Turn-triggered form changes (GAME_DESIGN §2 → Form changes, M6-01B_1): after `afterTurns`
   * turns in wave `wave`, its surviving enemy changes into the next wave's enemy through the wave
   * transition, keeping its HP fraction. Each wave at most once; omitted means none.
   */
  readonly formChanges?: readonly FormChangeSetup[];
  /**
   * Up to `MAX_RESERVE_SQUADS` squads that enter in order when the active one is wiped (GAME_DESIGN
   * §7 → Trials flow and three squads, RESOLVED-97). Omitted or empty means one squad.
   */
  readonly reserveSquads?: readonly ReserveSquadSetup[];
}

/** A reserve squad snapshotted at battle start: its party (slots `p0`…, `ally`) and leader skills. */
export interface ReserveSquad {
  readonly party: readonly BattleUnit[];
  readonly leaderSkills: BattleState["leaderSkills"];
}

/**
 * One turn-triggered form change: wave `wave` (0-based, not the last) and the next wave each hold
 * exactly one enemy; after `afterTurns` turns in that wave the wave advances without a kill.
 */
export interface FormChangeSetup {
  readonly wave: number;
  readonly afterTurns: number;
}

/** Auto Battle Advance Settings per-unit modes, in the original menu's order. */
export const AUTO_UNIT_MODES = ["auto", "bb", "sbb", "ubb", "guard", "attack"] as const;
export type AutoUnitMode = (typeof AUTO_UNIT_MODES)[number];

/** Auto Battle Advance Settings: a mode per party slot (omitted slots are Auto) and three toggles. */
export interface AutoSettings {
  readonly modes?: { readonly [slot in PlayerSlotId]?: AutoUnitMode };
  /** Super Brave Burst Priority: Auto units hold their gauge for the SBB instead of firing BB. */
  readonly sbbPriority?: boolean;
  /** Forced Brave Burst Priority: BB/SBB/UBB-mode units use only their chosen tier. */
  readonly forcedBbPriority?: boolean;
  /** OD & UBB Priority: the first Auto unit to act with the OD gauge full enters Overdrive and UBBs. */
  readonly odUbbPriority?: boolean;
}

/** One item in the battle inventory and how many are left (never negative). */
export interface BattleItemStack {
  readonly item: Item;
  readonly count: number;
}

/** Battle slot IDs: `p0`–`p4` squad, `ally` for the 6th slot, `e0`… for the current wave. */
export type PlayerSlotId = `p${number}` | "ally";
export type EnemySlotId = `e${number}`;

export interface BattleUnit {
  readonly slot: PlayerSlotId;
  readonly unitId: string;
  readonly name: string;
  readonly element: Element;
  /** The unit's form with its bursts resolved at the setup's burst levels. */
  readonly form: Form;
  readonly stats: Stats;
  readonly hp: number;
  readonly effects: readonly ActiveEffect[];
  /** Current BB gauge in BC (crystals). */
  readonly bc: number;
  /** Whether Overdrive Mode is active (GAME_DESIGN §2 Overdrive). */
  readonly overdrive: boolean;
  /** Turns left in Overdrive Mode, counting the current one; 0 outside the mode. */
  readonly overdriveTurns: number;
  /** Guarding this turn: incoming damage ×`guardMultiplier` (cleared at end of turn by `endTurn`). */
  readonly guarding: boolean;
  /**
   * HP damage taken from enemy hits since battle start (after barriers; not capped by HP left).
   * Its threshold crossings trigger `bb.fill_on_damage_taken` and `mitigation_after_damage`.
   */
  readonly damageTaken: number;
  /**
   * HP damage this unit's landed hits dealt since battle start (including overkill on a 0-HP
   * enemy). Its threshold crossings trigger `bb.fill_on_damage_dealt`.
   */
  readonly damageDealt: number;
  readonly isLeader: boolean;
  /** Set only on the 6th-slot unit. */
  readonly allyKind?: AllySetup["kind"];
  readonly spheres?: readonly Sphere[];
  /** Resolved SP grants, separate from canonical form content and rebuilt as source `sp`. */
  readonly enhancementPassives?: readonly Effect[];
  /** Self-only ATK cap from validated selected SP, separate from catalog effects. */
  readonly enhancementAtkCap?: number;
  /** Self-only final SP ATK bonus against a target afflicted at action scheduling. */
  readonly enhancementAfflictedDamage?: number;
  /** Additive per-ailment SP counter chances, capped and ordered by AILMENTS. */
  readonly enhancementAilmentCounters?: readonly {
    readonly ailment: Ailment;
    readonly chance: number;
  }[];
  /** SP-only allowance and turn-local no-zero-HP protection (RESOLVED-76). */
  readonly passiveAngelIdol?: {
    readonly chance: number;
    readonly consumed: boolean;
    readonly protected: boolean;
  };
}

export interface BattleEnemy {
  readonly slot: EnemySlotId;
  readonly enemyId: string;
  readonly name: string;
  readonly element: Element;
  readonly stats: Stats;
  readonly hp: number;
  readonly effects: readonly ActiveEffect[];
  /** Base BC drop resistance (fraction); omitted means 0. */
  readonly bcResistance?: number;
  readonly normalAttack: Attack;
  readonly skills: readonly EnemySkill[];
  readonly ai: readonly AiRule[];
  /** AI memory carried between this enemy's turns (fired once-only rules). */
  readonly aiMemory: EnemyAiMemory;
  /** Enemy phases this enemy has taken part in (its AI turn count; the next turn is this + 1). */
  readonly turnsTaken: number;
}

/** How a finished battle ended. */
export type BattleResult = "win" | "lose";

export interface BattleState {
  readonly seed: number;
  readonly rng: RngState;
  /** Battle clock in integer ticks (60/s). */
  readonly tick: number;
  /** 1-based turn number. */
  readonly turn: number;
  readonly phase: "player" | "enemy";
  /** Squad units in squad order, followed by the ally if present. */
  readonly party: readonly BattleUnit[];
  /** Leader skills in force: the leader's and the ally's (GAME_DESIGN §2, §3 stat_mods). */
  readonly leaderSkills: {
    readonly leader?: LeaderSkill;
    readonly ally?: LeaderSkill;
  };
  /** Every wave's enemy setup, in order. */
  readonly waves: readonly (readonly EnemySetup[])[];
  /** 0-based index of the current wave. */
  readonly waveIndex: number;
  /** The turn on which the current wave started (1 for the first wave). */
  readonly waveStartTurn: number;
  /** The setup's turn-triggered form changes (see `BattleSetup.formChanges`). */
  readonly formChanges: readonly FormChangeSetup[];
  /** The current wave's enemies. */
  readonly enemies: readonly BattleEnemy[];
  /** Pending hits in resolution order (see `compareHits`). */
  readonly timeline: readonly ScheduledHit[];
  /** Spark window in ticks, fixed at setup: 1, or wider with spark assist (`sparkWindowTicks`). */
  readonly sparkWindowTicks: number;
  /**
   * Resolved player hits still inside a widened spark window (empty when the window is one tick);
   * cleared at the end of each turn, so sparks never cross turns.
   */
  readonly recentHits: readonly SparkMark[];
  /** ID given to the next accepted action; action IDs order same-tick hits. */
  readonly nextActionId: number;
  /** The squad-wide OD gauge (GAME_DESIGN §2 Overdrive). */
  readonly od: OdGauge;
  /** Party slots that have acted this player phase (cleared by `endTurn`). */
  readonly acted: readonly PlayerSlotId[];
  /** The battle item inventory; a used item's count drops by one (entries stay at 0). */
  readonly items: readonly BattleItemStack[];
  /** Whether this is a trial battle (no continues). */
  readonly trial: boolean;
  /** The setup's auto-battle settings; absent means the original default (see `AutoSettings`). */
  readonly autoSettings?: AutoSettings;
  /**
   * Reserve squads still waiting to enter, in order (set only when the setup has reserve squads);
   * the first enters when the active party is wiped (`endTurn`, `SquadEntered`).
   */
  readonly reserveSquads?: readonly ReserveSquad[];
  /** 0-based index of the active squad; set only when the setup has reserve squads. */
  readonly squadIndex?: number;
  /** Whether the one continue per battle has been used. */
  readonly continued: boolean;
  /**
   * Set once the battle is over (GAME_DESIGN §2 Battle end); no further inputs are accepted unless
   * a continue (`continueBattle`) clears a `lose`.
   */
  readonly result?: BattleResult;
}
