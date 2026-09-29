import type {
  ActionRejectedReason,
  BattleEvent,
  BurstTier,
  EnemySlotId,
  HitLandedEvent,
  PlayerSlotId,
} from "@bfr/engine";
import type { BattleUiPiece } from "../assets/ui.ts";

/** How a damage number is drawn. Both flags come straight from `HitLanded`. */
export type DamageStyle = "normal" | "spark" | "crit" | "spark-crit";

export interface DamageStyleSpec {
  /** Text colour (CSS hex). */
  readonly color: string;
  /** Font size in logical px. */
  readonly size: number;
  /** Suffix after the number. */
  readonly suffix: string;
}

export const DAMAGE_STYLES: Readonly<Record<DamageStyle, DamageStyleSpec>> = {
  normal: { color: "#f4f1e8", size: 28, suffix: "" },
  spark: { color: "#7fe3ff", size: 32, suffix: "" },
  crit: { color: "#ffcf4a", size: 36, suffix: "!" },
  "spark-crit": { color: "#ff8a3d", size: 39, suffix: "!" },
};

export function damageStyle(hit: Pick<HitLandedEvent, "sparked" | "critical">): DamageStyle {
  if (hit.sparked && hit.critical) return "spark-crit";
  if (hit.sparked) return "spark";
  if (hit.critical) return "crit";
  return "normal";
}

/** A flash image played on a struck target (ART_GUIDE.md → Battle HUD art). */
export type FlashPiece = Extract<BattleUiPiece, "fx-hit" | "fx-spark" | "fx-crit">;

/** Every hit flashes `fx-hit`; a sparked hit adds `fx-spark` and a critical one `fx-crit`. */
export function hitFlashes(hit: Pick<HitLandedEvent, "sparked" | "critical">): FlashPiece[] {
  return [
    "fx-hit",
    ...(hit.sparked ? (["fx-spark"] as const) : []),
    ...(hit.critical ? (["fx-crit"] as const) : []),
  ];
}

/** A weakness/resist arrow shown on a struck target (ART_GUIDE.md → Battle HUD art). */
export type ElementArrow = Extract<BattleUiPiece, "icon-weak" | "icon-resist">;

/**
 * The arrow for a hit's `element` relation, copied from the engine event (which decided it with the
 * damage): `icon-weak` for a weakness hit, `icon-resist` for a resisted one, none when neutral.
 */
export function elementArrow(hit: {
  readonly element?: HitLandedEvent["element"];
}): ElementArrow | undefined {
  if (hit.element === "weak") return "icon-weak";
  if (hit.element === "resist") return "icon-resist";
  return undefined;
}

/** The "SPARK!!" popup (ART_GUIDE.md → Effects): green, or red on a Spark Critical. */
export const SPARK_POPUP = { text: "SPARK!!", color: "#72e05a", critColor: "#ff4a3d" } as const;

/** One drop kind flying to a card: its crystal art and how many dropped. */
export interface CrystalDrop {
  readonly piece: Extract<BattleUiPiece, "crystal-bc" | "crystal-hc">;
  readonly count: number;
}

/** A banner plate with its app-rendered title. */
export interface Banner {
  readonly piece: Extract<BattleUiPiece, "banner-wave" | "banner-boss">;
  readonly title: string;
}

/** What the cues need to know about the battle beyond one event: its wave count and boss waves. */
export interface CueContext {
  readonly waveCount: number;
  /** 0-based waves that hold a stage boss (from stage data; `stageBossWaves`). */
  readonly bossWaves: readonly number[];
}

const NO_CONTEXT: CueContext = { waveCount: 1, bossWaves: [] };

/** 0-based indexes of a stage's waves with a `boss: true` enemy. */
export function stageBossWaves(stage: {
  readonly waves: readonly { readonly enemies: readonly { readonly boss?: true }[] }[];
}): number[] {
  return stage.waves.flatMap((wave, i) => (wave.enemies.some((e) => e.boss === true) ? [i] : []));
}

/** The banners for the start of 0-based `wave`: "Battle n/N", then "Boss" on a boss wave. */
export function waveBanners(wave: number, context: CueContext): Banner[] {
  return [
    { piece: "banner-wave", title: `Battle ${wave + 1}/${Math.max(context.waveCount, wave + 1)}` },
    ...(context.bossWaves.includes(wave)
      ? [{ piece: "banner-boss", title: "Boss Battle" } as const]
      : []),
  ];
}

/** One visual beat derived from one engine event. Values are copied from events, never computed. */
export type Cue =
  | {
      readonly kind: "action";
      readonly actor: PlayerSlotId;
      readonly target: EnemySlotId;
      readonly tier?: BurstTier;
    }
  | { readonly kind: "guard"; readonly actor: PlayerSlotId }
  | { readonly kind: "cutin"; readonly actor: PlayerSlotId; readonly tier: BurstTier }
  | {
      readonly kind: "rejected";
      readonly actor: PlayerSlotId;
      readonly reason: ActionRejectedReason;
    }
  | {
      readonly kind: "spark";
      readonly target: EnemySlotId;
      readonly hits: number;
      /** A hit in this spark was a Spark Critical: the popup is red. */
      readonly critical: boolean;
    }
  | {
      readonly kind: "damage";
      readonly actor: PlayerSlotId;
      readonly target: EnemySlotId;
      readonly amount: number;
      readonly style: DamageStyle;
      /** Target HP after the hit, from the event. */
      readonly targetHp: number;
      /** The hit's index within its attack, for staggering numbers. */
      readonly hitIndex: number;
      /** Flash images on the target, from the hit's flags. */
      readonly flashes: readonly FlashPiece[];
      /** Weakness/resist arrow from the hit's `element`; absent when neutral. */
      readonly arrow?: ElementArrow;
    }
  | {
      readonly kind: "crystals";
      readonly collector: PlayerSlotId;
      readonly target: EnemySlotId;
      readonly drops: readonly CrystalDrop[];
    }
  | { readonly kind: "overdrive"; readonly actor: PlayerSlotId }
  | { readonly kind: "death"; readonly target: EnemySlotId }
  | { readonly kind: "enemy-action"; readonly actor: EnemySlotId; readonly paralyzed: boolean }
  | {
      readonly kind: "unit-damage";
      readonly target: PlayerSlotId;
      readonly amount: number;
      readonly critical: boolean;
      readonly hitIndex: number;
      readonly flashes: readonly FlashPiece[];
      readonly arrow?: ElementArrow;
    }
  | {
      readonly kind: "heal";
      readonly target: PlayerSlotId | EnemySlotId;
      readonly amount: number;
    }
  | { readonly kind: "unit-death"; readonly target: PlayerSlotId }
  | { readonly kind: "wave"; readonly wave: number; readonly banners: readonly Banner[] }
  | { readonly kind: "turn"; readonly turn: number }
  | { readonly kind: "result"; readonly result: "win" | "lose"; readonly turn: number };

/**
 * Maps an event to its cues, in order. Events with nothing to draw yield none. `sparkCritical`
 * tells a `Sparked` event whether one of its hits (the same tick's `HitLanded`s) was a Spark
 * Critical; `toCues` reads it from those events.
 */
export function eventCues(event: BattleEvent, context = NO_CONTEXT, sparkCritical = false): Cue[] {
  switch (event.type) {
    case "ActionStarted":
      return [
        {
          kind: "action",
          actor: event.actor,
          target: event.target,
          ...(event.tier ? { tier: event.tier } : {}),
        },
      ];
    case "Guarded":
      return [{ kind: "guard", actor: event.actor }];
    case "BurstUsed":
      return [{ kind: "cutin", actor: event.actor, tier: event.tier }];
    case "ActionRejected":
      return [{ kind: "rejected", actor: event.actor, reason: event.reason }];
    case "Sparked":
      return [{ kind: "spark", target: event.target, hits: event.hits, critical: sparkCritical }];
    case "HitLanded": {
      const arrow = elementArrow(event);
      return [
        {
          kind: "damage",
          actor: event.actor,
          target: event.target,
          amount: event.damage,
          style: damageStyle(event),
          targetHp: event.targetHp,
          hitIndex: event.hitIndex,
          flashes: hitFlashes(event),
          ...(arrow ? { arrow } : {}),
        },
      ];
    }
    case "CounterDamaged":
      // A `damage_reflect` counter: a plain damage number on the attacking enemy.
      return [
        {
          kind: "damage",
          actor: event.actor,
          target: event.target,
          amount: event.damage,
          style: "normal",
          targetHp: event.hp,
          hitIndex: 0,
          flashes: ["fx-hit"],
        },
      ];
    case "CrystalDropped":
      return [
        {
          kind: "crystals",
          collector: event.collector,
          target: event.target,
          drops: [
            ...(event.bc > 0 ? [{ piece: "crystal-bc", count: event.bc } as const] : []),
            ...(event.hc > 0 ? [{ piece: "crystal-hc", count: event.hc } as const] : []),
          ],
        },
      ];
    case "OverdriveActivated":
      return [{ kind: "overdrive", actor: event.actor }];
    case "EnemyDefeated":
      return [{ kind: "death", target: event.target }];
    case "EnemyActionStarted":
      return [{ kind: "enemy-action", actor: event.actor, paralyzed: event.paralyzed === true }];
    case "EnemyHitLanded": {
      const arrow = elementArrow(event);
      return [
        {
          kind: "unit-damage",
          target: event.target,
          amount: event.damage,
          critical: event.critical,
          hitIndex: event.hitIndex,
          flashes: hitFlashes({ sparked: false, critical: event.critical }),
          ...(arrow ? { arrow } : {}),
        },
      ];
    }
    case "Healed":
    case "HpRestored":
      return event.amount > 0 ? [{ kind: "heal", target: event.target, amount: event.amount }] : [];
    case "UnitDefeated":
      return [{ kind: "unit-death", target: event.target }];
    case "WaveStarted":
      return [{ kind: "wave", wave: event.wave, banners: waveBanners(event.wave, context) }];
    case "TurnStarted":
      return [{ kind: "turn", turn: event.turn }];
    case "BattleEnded":
      return [{ kind: "result", result: event.result, turn: event.turn }];
    // Gauge, HP, OD, guard, and status badges reach the screen through the HUD model
    // (`hud/model.ts`).
    case "GaugeFilled":
    case "OdGained":
    case "EffectApplied":
    case "EnemyEffectApplied":
    case "EffectTriggered":
    case "EffectEnded":
    case "TurnDamaged":
    case "OverdriveEnded":
    case "WaveCleared":
      return [];
  }
}

/** Cues for a batch of events (the batch holds each spark's same-tick hits). */
export function toCues(events: readonly BattleEvent[], context = NO_CONTEXT): Cue[] {
  return events.flatMap((event) =>
    eventCues(
      event,
      context,
      event.type === "Sparked" &&
        events.some(
          (e) =>
            e.type === "HitLanded" &&
            e.tick === event.tick &&
            e.target === event.target &&
            e.sparkCritical === true,
        ),
    ),
  );
}

/** The text of a damage number. */
export function damageLabel(cue: Extract<Cue, { kind: "damage" }>): string {
  return `${cue.amount}${DAMAGE_STYLES[cue.style].suffix}`;
}
