import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BattleEvent, HitLandedEvent } from "@bfr/engine";
import { describe, expect, it } from "vitest";
import { hitTest } from "../input/index.ts";
import {
  damageLabel,
  damageStyle,
  elementArrow,
  eventCues,
  stageBossWaves,
  toCues,
  waveBanners,
} from "./cues.ts";
import { DEMO_STAGE } from "./demo-battle.ts";
import {
  BANDS,
  bossEnemyRect,
  enemyRect,
  hitRegions,
  OD_BUTTON,
  PARTY_SLOTS,
  type Rect,
  SPRITE_SIZE,
  unitCardRect,
  unitSpriteRect,
  unitTouchRect,
} from "./layout.ts";
import {
  acceptsInput,
  advanceLive,
  isPlayerPhaseDone,
  type LiveBattle,
  queueInput,
  startLive,
} from "./live.ts";
import { createTestBattle, DEMO_INPUTS } from "./test-battle.ts";

const FRAME_MS = 1000 / 60;
const BATTLE_HALF = 320;

/**
 * Plays a live battle frame by frame (up to `forMs`) until the turn ends (`endTurn` ran, so its
 * events are pending), collecting every event released so far.
 */
function playOut(start: LiveBattle, forMs = 10_000): { live: LiveBattle; events: BattleEvent[] } {
  let live = start;
  const events: BattleEvent[] = [];
  const from = (start.state.tick * 1000) / 60;
  for (let ms = from; ms <= from + forMs; ms += FRAME_MS) {
    const result = advanceLive(live, ms);
    live = result.live;
    events.push(...result.events);
    if (live.pending.length > 0 || live.state.result !== undefined) break;
  }
  return { live, events };
}

function hits(events: readonly BattleEvent[]): HitLandedEvent[] {
  return events.filter((e): e is HitLandedEvent => e.type === "HitLanded");
}

const HIT: HitLandedEvent = {
  type: "HitLanded",
  tick: 80,
  actionId: 0,
  actor: "p0",
  target: "e0",
  attackIndex: 0,
  hitIndex: 2,
  critical: false,
  sparked: false,
  damage: 1234,
  targetHp: 500,
};

describe("damage number styles", () => {
  it("take the spark and crit flags from the event", () => {
    expect(damageStyle({ sparked: false, critical: false })).toBe("normal");
    expect(damageStyle({ sparked: true, critical: false })).toBe("spark");
    expect(damageStyle({ sparked: false, critical: true })).toBe("crit");
    expect(damageStyle({ sparked: true, critical: true })).toBe("spark-crit");
  });

  it("label the event's damage, marking crits", () => {
    const [normal] = eventCues(HIT);
    const [crit] = eventCues({ ...HIT, critical: true });
    expect(normal?.kind === "damage" && damageLabel(normal)).toBe("1234");
    expect(crit?.kind === "damage" && damageLabel(crit)).toBe("1234!");
  });
});

describe("eventCues", () => {
  it("plays a cut-in only for an accepted BB, SBB, or UBB", () => {
    for (const tier of ["bb", "sbb", "ubb"] as const) {
      expect(
        eventCues({
          type: "BurstUsed",
          tick: 10,
          actionId: 1,
          actor: "p2",
          tier,
          gaugeBefore: 100,
          gaugeAfter: 0,
        }),
      ).toEqual([{ kind: "cutin", actor: "p2", tier }]);
    }
    expect(
      eventCues({
        type: "ActionStarted",
        tick: 10,
        actionId: 1,
        actor: "p2",
        action: "attack",
        target: "e0",
        hits: 4,
      }),
    ).toEqual([{ kind: "action", actor: "p2", target: "e0" }]);
  });
  it("copies hit values into a damage cue", () => {
    expect(eventCues(HIT)).toEqual([
      {
        kind: "damage",
        actor: "p0",
        target: "e0",
        amount: 1234,
        style: "normal",
        targetHp: 500,
        hitIndex: 2,
        flashes: ["fx-hit"],
      },
    ]);
  });

  it("flashes every hit, adding spark and crit flashes from the hit's flags", () => {
    const flashes = (hit: HitLandedEvent) => {
      const [cue] = eventCues(hit);
      return cue?.kind === "damage" ? cue.flashes : undefined;
    };
    expect(flashes({ ...HIT, sparked: true })).toEqual(["fx-hit", "fx-spark"]);
    expect(flashes({ ...HIT, critical: true })).toEqual(["fx-hit", "fx-crit"]);
    expect(flashes({ ...HIT, sparked: true, critical: true })).toEqual([
      "fx-hit",
      "fx-spark",
      "fx-crit",
    ]);
    const [enemyHit] = eventCues({
      type: "EnemyHitLanded",
      tick: 5,
      actor: "e0",
      target: "p1",
      attackIndex: 0,
      hitIndex: 0,
      critical: true,
      damage: 300,
      unitHp: 900,
    });
    expect(enemyHit).toMatchObject({ kind: "unit-damage", flashes: ["fx-hit", "fx-crit"] });
  });

  it("shows the weakness or resist arrow from the hit's element relation, none when neutral", () => {
    expect(elementArrow({ element: "weak" })).toBe("icon-weak");
    expect(elementArrow({ element: "resist" })).toBe("icon-resist");
    expect(elementArrow({})).toBeUndefined();
    expect(eventCues({ ...HIT, element: "weak" })[0]).toMatchObject({ arrow: "icon-weak" });
    expect(eventCues({ ...HIT, element: "resist" })[0]).toMatchObject({ arrow: "icon-resist" });
    expect(eventCues(HIT)[0]).not.toHaveProperty("arrow");
    const enemyHit: BattleEvent = {
      type: "EnemyHitLanded",
      tick: 5,
      actor: "e0",
      target: "p1",
      attackIndex: 0,
      hitIndex: 0,
      critical: false,
      damage: 300,
      unitHp: 900,
    };
    expect(eventCues({ ...enemyHit, element: "weak" })[0]).toMatchObject({
      kind: "unit-damage",
      arrow: "icon-weak",
    });
    expect(eventCues(enemyHit)[0]).not.toHaveProperty("arrow");
    // A damage_reflect counter goes through no element math: no arrow.
    const [counter] = eventCues({
      type: "CounterDamaged",
      tick: 5,
      actor: "p1",
      target: "e0",
      effect: "damage_reflect",
      damage: 40,
      hp: 100,
    });
    expect(counter).not.toHaveProperty("arrow");
  });

  it("turns the SPARK!! popup red when a same-tick hit on the target is a Spark Critical", () => {
    const spark: BattleEvent = {
      type: "Sparked",
      tick: 80,
      target: "e0",
      hits: 2,
      actors: ["p0", "p1"],
    };
    const sparked = { ...HIT, sparked: true };
    expect(toCues([spark, sparked, sparked])[0]).toMatchObject({ kind: "spark", critical: false });
    const crit = toCues([spark, sparked, { ...sparked, sparkCritical: true }]);
    expect(crit[0]).toMatchObject({ kind: "spark", critical: true });
    // A Spark Critical on another target or tick does not count.
    const other = toCues([spark, { ...sparked, target: "e1", sparkCritical: true }]);
    expect(other[0]).toMatchObject({ critical: false });
  });

  it("flies each dropped crystal kind to the collector with its art", () => {
    const [cue] = eventCues({
      type: "CrystalDropped",
      tick: 40,
      actionId: 0,
      collector: "p1",
      target: "e0",
      attackIndex: 0,
      hitIndex: 0,
      bc: 3,
      hc: 1,
      bcGained: 3,
      healed: 50,
      gauge: 9,
      hp: 4000,
    });
    expect(cue).toEqual({
      kind: "crystals",
      collector: "p1",
      target: "e0",
      drops: [
        { piece: "crystal-bc", count: 3 },
        { piece: "crystal-hc", count: 1 },
      ],
    });
  });

  it("shows the wave banner at each wave and the boss banner on stage boss waves", () => {
    const context = { waveCount: 3, bossWaves: [2] };
    expect(eventCues({ type: "WaveStarted", tick: 9, wave: 1 }, context)).toEqual([
      { kind: "wave", wave: 1, banners: [{ piece: "banner-wave", title: "Battle 2/3" }] },
    ]);
    expect(waveBanners(2, context)).toEqual([
      { piece: "banner-wave", title: "Battle 3/3" },
      { piece: "banner-boss", title: "Boss Battle" },
    ]);
    expect(stageBossWaves(DEMO_STAGE)).toEqual([]);
    expect(
      stageBossWaves({
        waves: [{ enemies: [{}] }, { enemies: [{}, { boss: true }] }],
      }),
    ).toEqual([1]);
  });

  it("has no cues for status changes, which the HUD model tracks", () => {
    expect(eventCues({ type: "EffectEnded", tick: 90, target: "p0", effect: "buff.atk" })).toEqual(
      [],
    );
  });

  it("maps actions, sparks, crystals, and deaths", () => {
    const cues = toCues([
      {
        type: "ActionStarted",
        tick: 10,
        actionId: 0,
        actor: "p2",
        action: "burst",
        tier: "bb",
        target: "e1",
        hits: 8,
      },
      { type: "Sparked", tick: 40, target: "e1", hits: 2, actors: ["p2", "p2"] },
      {
        type: "CrystalDropped",
        tick: 40,
        actionId: 0,
        collector: "p2",
        target: "e1",
        attackIndex: 0,
        hitIndex: 0,
        bc: 2,
        hc: 0,
        bcGained: 2,
        healed: 0,
        gauge: 7,
        hp: 4000,
      },
      { type: "EnemyDefeated", tick: 41, target: "e1" },
    ]);
    expect(cues).toEqual([
      { kind: "action", actor: "p2", target: "e1", tier: "bb" },
      { kind: "spark", target: "e1", hits: 2, critical: false },
      {
        kind: "crystals",
        collector: "p2",
        target: "e1",
        drops: [{ piece: "crystal-bc", count: 2 }],
      },
      { kind: "death", target: "e1" },
    ]);
  });
});

describe("live battle clock", () => {
  it("holds inputs until their tick, then passes them to the engine", () => {
    const live = startLive(createTestBattle(1), [{ type: "attack", tick: 30, actor: "p0" }]);
    const early = advanceLive(live, 400); // tick 24
    expect(early.events).toEqual([]);
    expect(early.live.queued).toHaveLength(1);
    expect(early.live.state.tick).toBe(24);
    const due = advanceLive(early.live, 500); // tick 30
    expect(due.live.queued).toEqual([]);
    expect(due.events[0]).toMatchObject({ type: "ActionStarted", tick: 30, actor: "p0" });
  });

  it("runs an input stamped before a stepped tick on the next tick", () => {
    const ahead = advanceLive(startLive(createTestBattle(1)), 1000).live; // tick 60
    const late = queueInput(ahead, { type: "guard", tick: 12, actor: "p3" });
    // Tick 60 is already stepped, so the guard waits for tick 61 (the replay order, M3-04C).
    const held = advanceLive(late, 1000);
    expect(held.events).toEqual([]);
    const { live, events } = advanceLive(held.live, 1020); // tick 61
    expect(events).toEqual([{ type: "Guarded", tick: 61, actor: "p3" }]);
    expect(live.turnInputs).toEqual([{ type: "guard", tick: 61, actor: "p3" }]);
  });
});

describe("test battle demo", () => {
  const { live, events } = playOut(startLive(createTestBattle(1, { charged: true }), DEMO_INPUTS));
  const landed = hits(events);

  it("plays taps that spark each other", () => {
    const taps = landed.filter((h) => h.actor === "p0" || h.actor === "p1");
    expect(taps.length).toBeGreaterThan(0);
    expect(taps.every((h) => h.sparked && !h.critical)).toBe(true);
    expect(events.some((e) => e.type === "Sparked" && e.actors.includes("p0"))).toBe(true);
  });

  it("plays a burst whose hits self-spark and crit", () => {
    const burst = landed.filter((h) => h.actor === "p2");
    expect(burst.length).toBe(8);
    expect(burst.every((h) => h.critical && h.sparked)).toBe(true);
  });

  it("defeats the first enemy, and leaves the last two units for the player", () => {
    expect(events.some((e) => e.type === "EnemyDefeated" && e.target === "e0")).toBe(true);
    expect(live.state.acted).not.toContain("p3");
    expect(live.state.acted).not.toContain("p4");
  });

  it("is deterministic for a seed", () => {
    expect(playOut(startLive(createTestBattle(1, { charged: true }), DEMO_INPUTS)).events).toEqual(
      events,
    );
  });

  it("ends the turn once the last unit acts", () => {
    expect(isPlayerPhaseDone(live)).toBe(false);
    expect(acceptsInput(live)).toBe(true);
    const fourth = playOut(
      queueInput(live, { type: "attack", tick: live.state.tick, actor: "p3" }),
    );
    expect(hits(fourth.events).some((h) => h.actor === "p3" && !h.sparked)).toBe(true);
    expect(fourth.live.pending).toHaveLength(0);
    expect(isPlayerPhaseDone(fourth.live)).toBe(false);
    const tick = fourth.live.state.tick;
    const after = playOut(queueInput(fourth.live, { type: "attack", tick, actor: "p4" }));
    expect(hits(after.events).some((h) => h.actor === "p4")).toBe(true);
    expect(after.live.pending.length).toBeGreaterThan(0);
    expect(acceptsInput(after.live)).toBe(false);
  });
});

describe("hit regions", () => {
  const state = createTestBattle(1);
  const regions = hitRegions(state);
  const center = (r: { x: number; y: number; width: number; height: number }) =>
    [r.x + r.width / 2, r.y + r.height / 2] as const;

  it("map unit sprites and cards, enemies, and the OD button to targets", () => {
    expect(hitTest(regions, ...center(unitCardRect(2)))).toEqual({ kind: "unit", slot: "p2" });
    expect(hitTest(regions, ...center(unitSpriteRect(1)))).toEqual({ kind: "unit", slot: "p1" });
    expect(hitTest(regions, ...center(unitSpriteRect(4)))).toEqual({ kind: "unit", slot: "p4" });
    expect(hitTest(regions, ...center(enemyRect(1)))).toEqual({ kind: "enemy", slot: "e1" });
    expect(hitTest(regions, ...center(OD_BUTTON))).toEqual({ kind: "od" });
  });
});

describe("battle screen bands (M2-03C)", () => {
  const slots = Array.from({ length: PARTY_SLOTS }, (_, i) => i);
  const inside = (r: Rect, band: Rect) =>
    r.x >= band.x &&
    r.y >= band.y &&
    r.x + r.width <= band.x + band.width &&
    r.y + r.height <= band.y + band.height;
  const overlaps = (a: Rect, b: Rect) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  it("stacks the bands down the 640×1136 grid", () => {
    const order = [
      BANDS.topBar,
      BANDS.field,
      BANDS.bossBar,
      BANDS.cards,
      BANDS.odBar,
      BANDS.itemBar,
    ];
    expect(BANDS.field).toMatchObject({ y: 88, width: 640, height: 432 });
    let y = 0;
    for (const band of order) {
      expect(band.y).toBe(y);
      y += band.height;
    }
    expect(y).toBe(1136);
  });

  it("puts the party on the right of the field and enemies on the left", () => {
    for (const i of slots) {
      const sprite = unitSpriteRect(i);
      expect([sprite.width, sprite.height]).toEqual([SPRITE_SIZE, SPRITE_SIZE]);
      expect(inside(sprite, BANDS.field)).toBe(true);
      expect(inside(unitTouchRect(i), sprite)).toBe(true);
      expect(sprite.x).toBeGreaterThanOrEqual(BATTLE_HALF - 8);
    }
    for (const i of [0, 1, 2]) {
      const enemy = enemyRect(i);
      expect(inside(enemy, BANDS.field)).toBe(true);
      expect(enemy.x + enemy.width).toBeLessThanOrEqual(BATTLE_HALF);
    }
  });

  it("keeps every party foot clear of the boss rocks and sizes boss hit regions to its sprite", () => {
    expect(Math.max(...slots.map((i) => unitSpriteRect(i).y + SPRITE_SIZE))).toBeLessThan(470);
    const boss = bossEnemyRect();
    expect([boss.width, boss.height]).toEqual([256, 256]);
    expect(
      hitTest(
        hitRegions(createTestBattle(1), (i) => (i === 0 ? boss : enemyRect(i))),
        boss.x + 60,
        boss.y + 60,
      ),
    ).toEqual({
      kind: "enemy",
      slot: "e0",
    });
  });

  it("keeps sprite touch regions apart and cards in a 2×3 grid", () => {
    for (const i of slots) {
      for (const j of slots) {
        if (i < j) expect(overlaps(unitTouchRect(i), unitTouchRect(j))).toBe(false);
      }
      const card = unitCardRect(i);
      expect(inside(card, BANDS.cards)).toBe(true);
      expect(card.x < 320).toBe(i % 2 === 0);
    }
    expect(inside(OD_BUTTON, BANDS.odBar)).toBe(true);
  });
});

describe("no combat math in apps/web", () => {
  const FORMULA_NAMES = [
    "attackCore",
    "hitDamage",
    "rollAttack",
    "rollCrit",
    "critMultiplier",
    "sparkMultiplier",
    "elementMultiplier",
    "elementOutcome",
    "isStrongAgainst",
    "detectSparks",
    "rollHitDrops",
    "collectCrystals",
  ];

  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sources(path);
      return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [path] : [];
    });
  }

  it("never calls engine formulas from the web app", () => {
    const root = join(import.meta.dirname, "..", "..");
    for (const file of sources(root)) {
      const text = readFileSync(file, "utf8");
      for (const name of FORMULA_NAMES) {
        expect(text.includes(name), `${file} uses ${name}`).toBe(false);
      }
    }
  });
});
