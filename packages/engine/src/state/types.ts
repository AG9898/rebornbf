import type {
  AiRule,
  Attack,
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
}

/** A member whose base stats are given as-is (demo squads, guests, tests). */
export interface ResolvedStatsMember extends SquadMemberBase {
  readonly stats: Stats;
  readonly level?: never;
  readonly unitType?: never;
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
  /** Whether the one continue per battle has been used. */
  readonly continued: boolean;
  /**
   * Set once the battle is over (GAME_DESIGN §2 Battle end); no further inputs are accepted unless
   * a continue (`continueBattle`) clears a `lose`.
   */
  readonly result?: BattleResult;
}
