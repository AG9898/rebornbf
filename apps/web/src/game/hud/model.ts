import type { EffectId, Element, Form } from "@bfr/data";
import {
  type ActiveEffect,
  type BattleEvent,
  type BattleResult,
  type BattleState,
  type BurstTier,
  canBurst,
  type EnemySlotId,
  gaugeMax,
  isPassiveSource,
  type PlayerSlotId,
} from "@bfr/engine";

/**
 * What the battle HUD shows, kept in step with the event log. The engine's `BattleState` can run
 * ahead of what is on screen (a whole enemy phase is computed at once and played back by tick), so
 * the HUD copies HP, gauges, and the OD gauge from events as they play instead of reading state.
 */
export interface HudUnit {
  readonly slot: PlayerSlotId;
  readonly name: string;
  readonly element: Element;
  readonly form: Form;
  readonly leader: boolean;
  readonly hp: number;
  readonly maxHp: number;
  readonly bc: number;
  readonly overdrive: boolean;
  readonly guarding: boolean;
  readonly acted: boolean;
  /** Active effect IDs from apply events, until their `EffectEnded` (drawn as status badges). */
  readonly effects: readonly EffectId[];
}

export interface HudEnemy {
  readonly slot: EnemySlotId;
  readonly name: string;
  readonly element: Element;
  readonly hp: number;
  readonly maxHp: number;
  /** Active effect IDs from apply events, until their `EffectEnded`. */
  readonly effects: readonly EffectId[];
}

/** One battle item on the item bar (M2-02D): its count follows `ItemUsed.remaining`. */
export interface HudItem {
  readonly id: string;
  readonly name: string;
  /** `single`: tap the item, then the unit to use it on; `party`: used on tap. */
  readonly target: "single" | "party";
  readonly count: number;
}

export interface HudState {
  readonly units: readonly HudUnit[];
  readonly enemies: readonly HudEnemy[];
  readonly od: { readonly points: number; readonly limit: number };
  /** 0-based wave index. */
  readonly wave: number;
  readonly waveCount: number;
  readonly turn: number;
  /**
   * The top counters: damage dealt by party hits and the number of sparked hits in `turn`, the
   * last turn a party hit landed (they stay up until the next turn's first hit).
   */
  readonly counters: { readonly damage: number; readonly sparks: number; readonly turn: number };
  readonly result?: BattleResult;
  /** The battle's item inventory, in setup order. */
  readonly items: readonly HudItem[];
  /** Enemy wave rosters (names, elements, and max HP), for `WaveStarted`. */
  readonly waves: readonly (readonly {
    readonly name: string;
    readonly element: Element;
    readonly hp: number;
  }[])[];
}

/** The HUD for a battle state (normally a fresh battle). */
export function initHud(state: BattleState): HudState {
  return {
    units: state.party.map((unit) => ({
      slot: unit.slot,
      name: unit.name,
      element: unit.element,
      form: unit.form,
      leader: unit.isLeader,
      hp: unit.hp,
      maxHp: unit.stats.hp,
      bc: unit.bc,
      overdrive: unit.overdrive,
      guarding: unit.guarding,
      acted: state.acted.includes(unit.slot),
      effects: appliedIds(unit.effects),
    })),
    enemies: state.enemies.map((enemy) => ({
      slot: enemy.slot,
      name: enemy.name,
      element: enemy.element,
      hp: enemy.hp,
      maxHp: enemy.stats.hp,
      effects: appliedIds(enemy.effects),
    })),
    od: { points: state.od.points, limit: state.od.limit },
    wave: state.waveIndex,
    waveCount: state.waves.length,
    turn: state.turn,
    counters: { damage: 0, sparks: 0, turn: state.turn },
    ...(state.result ? { result: state.result } : {}),
    items: state.items.map(({ item, count }) => ({
      id: item.id,
      name: item.name,
      target: item.target,
      count,
    })),
    waves: state.waves.map((wave) =>
      wave.map((enemy) => ({ name: enemy.name, element: enemy.element, hp: enemy.stats.hp })),
    ),
  };
}

/** IDs of a combatant's non-passive effects: the ones that have apply and `EffectEnded` events. */
function appliedIds(effects: readonly ActiveEffect[]): EffectId[] {
  return [...new Set(effects.filter((e) => !isPassiveSource(e.source)).map((e) => e.id))];
}

/** Adds or removes one effect ID on a unit or enemy (the list keeps application order). */
function patchEffects(hud: HudState, slot: string, id: EffectId, active: boolean): HudState {
  const next = (effects: readonly EffectId[]) =>
    active
      ? effects.includes(id)
        ? effects
        : [...effects, id]
      : effects.filter((effect) => effect !== id);
  if (isEnemySlot(slot)) {
    const enemy = hud.enemies.find((e) => e.slot === slot);
    return enemy ? patchEnemy(hud, slot, { effects: next(enemy.effects) }) : hud;
  }
  const unit = hud.units.find((u) => u.slot === slot);
  return unit ? patchUnit(hud, slot, { effects: next(unit.effects) }) : hud;
}

function patchUnit(hud: HudState, slot: string, patch: Partial<HudUnit>): HudState {
  return {
    ...hud,
    units: hud.units.map((unit) => (unit.slot === slot ? { ...unit, ...patch } : unit)),
  };
}

function patchEnemy(hud: HudState, slot: string, patch: Partial<HudEnemy>): HudState {
  return {
    ...hud,
    enemies: hud.enemies.map((enemy) => (enemy.slot === slot ? { ...enemy, ...patch } : enemy)),
  };
}

function isEnemySlot(slot: string): slot is EnemySlotId {
  return slot.startsWith("e");
}

function patchSide(hud: HudState, slot: string, hp: number): HudState {
  return isEnemySlot(slot) ? patchEnemy(hud, slot, { hp }) : patchUnit(hud, slot, { hp });
}

/**
 * Applies one event. Every value is copied from the event; the top counters only tally the damage
 * and sparked flags of `HitLanded` events. Nothing about the battle is computed.
 */
export function applyHudEvent(hud: HudState, event: BattleEvent): HudState {
  switch (event.type) {
    case "ActionStarted":
      return patchUnit(hud, event.actor, { acted: true });
    case "Guarded":
      return patchUnit(hud, event.actor, { acted: true, guarding: true });
    case "BurstUsed":
      return patchUnit(hud, event.actor, { bc: event.gaugeAfter });
    case "GaugeFilled":
      return patchUnit(hud, event.target, { bc: event.gauge });
    case "CrystalDropped":
      return patchUnit(hud, event.collector, { bc: event.gauge, hp: event.hp });
    case "Healed":
      return patchUnit(hud, event.target, { hp: event.hp });
    case "HpRestored":
    case "TurnDamaged":
      return patchSide(hud, event.target, event.hp);
    case "HitLanded": {
      const same = hud.counters.turn === hud.turn;
      return {
        ...patchEnemy(hud, event.target, { hp: event.targetHp }),
        counters: {
          damage: (same ? hud.counters.damage : 0) + event.damage,
          sparks: (same ? hud.counters.sparks : 0) + (event.sparked ? 1 : 0),
          turn: hud.turn,
        },
      };
    }
    case "CounterDamaged":
      return patchEnemy(hud, event.target, { hp: event.hp });
    case "EnemyDefeated":
      return patchEnemy(hud, event.target, { hp: 0 });
    case "EnemyHitLanded":
      return patchUnit(hud, event.target, { hp: event.unitHp });
    case "UnitDefeated":
      return patchUnit(hud, event.target, { hp: 0 });
    case "UnitRevived":
      return patchUnit(hud, event.target, { hp: event.hp });
    case "OdGained":
      return { ...hud, od: { points: event.points, limit: event.limit } };
    case "OverdriveActivated":
      return {
        ...patchUnit(hud, event.actor, { overdrive: true }),
        od: { points: 0, limit: event.limitAfter },
      };
    case "OverdriveEnded":
      // The engine empties the BB gauge when Overdrive Mode ends.
      return patchUnit(hud, event.actor, { overdrive: false, bc: 0 });
    case "WaveStarted": {
      const roster = hud.waves[event.wave] ?? [];
      return {
        ...hud,
        wave: event.wave,
        enemies: roster.map((enemy, i) => ({
          slot: `e${i}`,
          name: enemy.name,
          element: enemy.element,
          hp: enemy.hp,
          maxHp: enemy.hp,
          effects: [],
        })),
      };
    }
    case "TurnStarted":
      return {
        ...hud,
        turn: event.turn,
        units: hud.units.map((unit) => ({ ...unit, acted: false, guarding: false })),
      };
    case "BattleEnded":
      return { ...hud, result: event.result };
    case "BattleContinued": {
      // The continue UI arrives with M3-04E; the HUD only drops the defeat result here.
      const { result: _lost, ...rest } = hud;
      return rest;
    }
    case "EffectApplied":
    case "EnemyEffectApplied":
      return patchEffects(hud, event.target, event.effect.id, true);
    case "EffectTriggered":
      // A `mitigation_after_damage` threshold grants the unit `mitigation`.
      return patchEffects(hud, event.target, "mitigation", true);
    case "EffectEnded":
      return patchEffects(hud, event.target, event.effect, false);
    case "ActionRejected":
    case "Sparked":
    case "EnemyActionStarted":
    case "WaveCleared":
    case "ContinueRejected":
      return hud;
    case "ItemUsed":
      return {
        ...hud,
        items: hud.items.map((item) =>
          item.id === event.item ? { ...item, count: event.remaining } : item,
        ),
      };
  }
}

export function applyHudEvents(hud: HudState, events: readonly BattleEvent[]): HudState {
  return events.reduce(applyHudEvent, hud);
}

/** How a unit's BB gauge is drawn: fill fraction, tier marks, and the tier a swipe would use. */
export interface GaugeView {
  /** Gauge capacity in BC (BB + SBB costs, or the UBB cost in Overdrive Mode if larger). */
  readonly max: number;
  /** Fill as a fraction of `max`. */
  readonly fill: number;
  /** Where each tier's threshold sits, as fractions of `max`. */
  readonly marks: readonly { readonly tier: BurstTier; readonly at: number }[];
  /** The highest tier charged now (UBB, SBB, BB), if any. */
  readonly ready?: BurstTier;
}

/** The gauge drawing for one unit, using the engine's `gaugeMax` and `canBurst` rules. */
export function gaugeView(unit: HudUnit): GaugeView {
  const { form } = unit;
  const max = gaugeMax(form, unit.overdrive);
  const bb = form.bursts.bb.cost;
  const marks: { tier: BurstTier; at: number }[] = [{ tier: "bb", at: bb / max }];
  if (form.bursts.sbb) marks.push({ tier: "sbb", at: (bb + form.bursts.sbb.cost) / max });
  if (unit.overdrive && form.bursts.ubb)
    marks.push({ tier: "ubb", at: form.bursts.ubb.cost / max });
  const ready = (["ubb", "sbb", "bb"] as const).find((tier) =>
    canBurst(form, tier, unit.bc, unit.overdrive),
  );
  return {
    max,
    fill: max > 0 ? Math.min(1, unit.bc / max) : 0,
    marks,
    ...(ready ? { ready } : {}),
  };
}

/** HUD text for the battle end screen. */
export function resultTitle(result: BattleResult): string {
  return result === "win" ? "VICTORY" : "DEFEAT";
}

/**
 * The enemy named in the boss bar: the wave's highest max-HP enemy (first on ties) until quest
 * data marks bosses. Undefined for an empty wave.
 */
export function bossEnemy(hud: HudState): HudEnemy | undefined {
  return hud.enemies.reduce<HudEnemy | undefined>(
    (best, enemy) => (best === undefined || enemy.maxHp > best.maxHp ? enemy : best),
    undefined,
  );
}
