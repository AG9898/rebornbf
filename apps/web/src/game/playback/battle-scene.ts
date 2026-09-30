import {
  type BattleEvent,
  type BattleState,
  type BurstTier,
  isOdFull,
  type PlayerSlotId,
} from "@bfr/engine";
import Phaser from "phaser";
import { type UnitSpriteSheet, unitIdleSprite } from "../assets/sprites.ts";
import { backgroundUrl } from "../assets/stage-art.ts";
import {
  battleUiTextureKeys,
  preloadBattleUi,
  type UiTexture,
  uiPiece,
  uiPieceSize,
  unitCutinPortrait,
  unitPortrait,
} from "../assets/ui.ts";
import type { BattleBridge } from "../bridge.ts";
import { BATTLE_HEIGHT, BATTLE_WIDTH, CANVAS_ZOOM } from "../bridge.ts";
import {
  type BattleControls,
  dueAutoInputs,
  INITIAL_CONTROLS,
  playbackSteps,
  toggleAuto,
  toggleSpeed,
} from "../hud/controls.ts";
import { applyHudEvents, type HudState, initHud } from "../hud/model.ts";
import { FALLBACK_FONT, HudView, hudTextStyle } from "../hud/view.ts";
import {
  classifyGesture,
  hitTest,
  INITIAL_INPUT_UI,
  type InputUiState,
  type PointerSample,
  toEngineInput,
} from "../input/index.ts";
import {
  type Banner,
  type Cue,
  type CueContext,
  DAMAGE_STYLES,
  damageLabel,
  type ElementArrow,
  eventCues,
  type FlashPiece,
  SPARK_POPUP,
  waveBanners,
} from "./cues.ts";
import {
  ART_SCALE,
  BANDS,
  bossEnemyRect,
  enemyRect,
  hitRegions,
  type Rect,
  SPRITE_SIZE,
  unitSpriteRect,
} from "./layout.ts";
import {
  acceptsInput,
  advanceLive,
  isOver,
  type LiveBattle,
  queueInput,
  startLive,
} from "./live.ts";
import { FieldOverlay } from "./overlay.ts";

/** Longest frame delta fed to the battle clock, so a backgrounded tab does not skip ahead. */
const MAX_FRAME_MS = 100;
/** Pause after the result screen appears before a tap restarts the battle. */
const REPLAY_DELAY_MS = 800;
/** At most this many crystals of each kind fly per drop, so big drops stay readable. */
const MAX_FLYING_CRYSTALS = 6;
/** How far (logical px) a still sprite lunges toward the enemies when it acts. */
const LUNGE_PX = 24;
/** Flash size (logical px) per piece: ART_GUIDE.md → Battle HUD art (96–128 px). */
const FLASH_PX: Readonly<Record<FlashPiece, number>> = {
  "fx-hit": 96,
  "fx-spark": 128,
  "fx-crit": 128,
};
/** How long a weakness/resist arrow holds after its target's latest hit, then its fade (ms). */
const ARROW_HOLD_MS = 450;
const ARROW_FADE_MS = 250;
/** Drawn above the field and HUD: flying crystals and banners. */
const TOP_DEPTH = 20;
/** How long one banner stays up, and the gap before the next one starts (ms). */
const BANNER_MS = 1100;
/** The field freezes while this purely visual beat plays; engine hit ticks stay unchanged. */
const CUTIN_MS = 850;
const CUTIN_COLORS: Record<BurstTier, number> = {
  bb: 0x459bff,
  sbb: 0xffc94e,
  ubb: 0xe1495b,
};

const COLORS = {
  sky: 0x253453,
  ground: 0x29334a,
  horizon: 0x3a4c68,
  panel: 0x0e1326,
  enemy: 0x6f8f4e,
  enemyAct: 0xd05a4a,
  unit: 0x8b8cba,
  unitAct: 0xf5e4b2,
  unitHit: 0xe05050,
} as const;

/** What the scene plays: a battle factory and the art each party slot wears. */
export interface BattleSpec {
  /** Top-bar title. */
  readonly title: string;
  create(seed: number): BattleState;
  /** `art/units/<id>` export for each party slot, in party order; missing slots draw a box. */
  readonly partyArt: readonly string[];
  /** Locked background id selected by the stage's chapter or explicit stage mapping. */
  readonly background?: string;
  /** Enemy art in stage wave order, sized by the locked export's canvas. */
  readonly enemyWaves?: readonly (readonly { readonly id: string; readonly size: number }[])[];
  /** Exported idle form each unit wears (default 6★). */
  readonly artForm?: string;
  /** Per-slot idle form, in party order; a slot without one wears `artForm`. */
  readonly partyArtForms?: readonly (string | undefined)[];
  /** 0-based waves holding a stage boss, which get the boss banner (`stageBossWaves`). */
  readonly bossWaves?: readonly number[];
  /** First seed (default 1). */
  readonly seed?: number;
  /**
   * A server-issued battle (M3-04B): one run with the session's seed, so the end screen does not
   * restart with the next seed.
   */
  readonly singleRun?: boolean;
  /**
   * An art id drawn from an animated sheet instead of its still idle sprite. Only for battles whose
   * unit data takes its attack timing from that sheet (the M2-03 test battle).
   */
  readonly sheet?: { readonly art: string; readonly sheet: UnitSpriteSheet };
}

interface EnemyView {
  readonly body: Body;
  readonly rect: Rect;
  readonly shadows: readonly Phaser.GameObjects.Ellipse[];
}

type Body = Phaser.GameObjects.Rectangle | Phaser.GameObjects.Sprite;

interface UnitView {
  readonly sprite: Body;
  readonly sprite0: Rect;
  /** Set when the unit is drawn from a sprite sheet. */
  readonly sheet?: UnitSpriteSheet;
}

/** Registers a sheet's `idle` (looping) and `attack` animations with per-frame durations. */
function createSheetAnimations(scene: Phaser.Scene, { key, sheet }: UnitSpriteSheet): void {
  const names = Object.keys(sheet.frames);
  for (const tag of sheet.meta.frameTags) {
    if (tag.name !== "idle" && tag.name !== "attack") continue;
    const animKey = `${key}-${tag.name}`;
    if (scene.anims.exists(animKey)) continue;
    const frames = names.slice(tag.from, tag.to + 1).map((frame) => ({
      key,
      frame,
      duration: sheet.frames[frame]?.duration ?? 0,
    }));
    scene.anims.create({
      key: animKey,
      frames,
      duration: frames.reduce((total, frame) => total + frame.duration, 0),
      repeat: tag.name === "idle" ? -1 : 0,
    });
  }
}

/** Converts a DOM pointer event to the 640×1136 logical grid, whatever CSS size the canvas has. */
function logicalPoint(canvas: HTMLCanvasElement, event: Event): { x: number; y: number } {
  const source =
    "changedTouches" in event ? (event as TouchEvent).changedTouches[0] : (event as MouseEvent);
  const rect = canvas.getBoundingClientRect();
  if (!source || rect.width === 0 || rect.height === 0) return { x: -1, y: -1 };
  return {
    x: ((source.clientX - rect.left) * BATTLE_WIDTH) / rect.width,
    y: ((source.clientY - rect.top) * BATTLE_HEIGHT) / rect.height,
  };
}

/**
 * The battle scene: runs a `BattleSpec`'s battle on a real-time clock through `advanceLive` (which also
 * runs the engine's turn loop), animates each engine event on the Battle Screen bands (party from
 * locked idle sprites and enemy art), and keeps
 * the HUD in step through the event-built `HudState`. It never computes damage, sparks, crits,
 * drops, or turn outcomes.
 */
export class BattleScene extends Phaser.Scene {
  private seed = 1;
  private live!: LiveBattle;
  private hud!: HudState;
  private hudView!: HudView;
  private ui: InputUiState = INITIAL_INPUT_UI;
  /** Auto and Speed; kept across replays (`scene.restart`) like a player's setting. */
  private controls: BattleControls = INITIAL_CONTROLS;
  private clockMs = 0;
  private playbackMs = 0;
  private cutinRemainingMs = 0;
  private heldEvents: readonly BattleEvent[] = [];
  private overAtMs: number | undefined;
  private down: PointerSample | undefined;
  private enemies: EnemyView[] = [];
  private units: UnitView[] = [];
  private overlay!: FieldOverlay;
  /** The weakness/resist arrow up on each combatant slot: one per target, refreshed per hit. */
  private arrows = new Map<string, Phaser.GameObjects.Image>();
  private status!: Phaser.GameObjects.Text;

  /**
   * `fontFamily` is the loaded Lilita One webfont's CSS family (`mountBattle` waits for it), used by
   * every label, name, and number.
   */
  constructor(
    private readonly bridge: BattleBridge,
    private readonly spec: BattleSpec,
    private readonly fontFamily: string = FALLBACK_FONT,
  ) {
    super("battle");
  }

  init(data: { seed?: number }): void {
    this.seed = data.seed ?? this.spec.seed ?? 1;
    this.live = startLive(this.spec.create(this.seed));
    this.hud = initHud(this.live.state);
    this.ui = INITIAL_INPUT_UI;
    this.clockMs = 0;
    this.playbackMs = 0;
    this.cutinRemainingMs = 0;
    this.heldEvents = [];
    this.overAtMs = undefined;
    this.down = undefined;
    this.enemies = [];
    this.units = [];
    this.arrows = new Map();
  }

  preload(): void {
    const animated = this.spec.sheet;
    if (animated && !this.textures.exists(animated.sheet.key)) {
      const { key, imageUrl, sheet } = animated.sheet;
      this.load.atlas(key, imageUrl, sheet);
    }
    this.spec.partyArt.forEach((art, i) => {
      if (!art || art === animated?.art) return;
      const idle = unitIdleSprite(art, this.artForm(i));
      if (!this.textures.exists(idle.key)) this.load.image(idle.key, idle.imageUrl);
    });
    for (const id of new Set(this.spec.enemyWaves?.flat().map((enemy) => enemy.id) ?? [])) {
      if (!this.textures.exists(id)) this.load.image(id, `/assets/enemies/${id}/battle-idle.png`);
    }
    if (this.spec.background && !this.textures.exists(this.spec.background)) {
      this.load.image(this.spec.background, backgroundUrl(this.spec.background));
    }
    preloadBattleUi(this.load, this.textures, [...this.portraits(), ...this.cutinPortraits()]);
  }

  /** Each party slot's battle portrait: the same art id and form as its idle sprite. */
  private portraits(): (UiTexture | undefined)[] {
    return this.live.state.party.map((_, i) =>
      unitPortrait(this.spec.partyArt[i], this.artForm(i) ?? "6star"),
    );
  }

  private cutinPortraits(): (UiTexture | undefined)[] {
    return this.live.state.party.map((_, i) =>
      unitCutinPortrait(this.spec.partyArt[i], this.artForm(i) ?? "6star"),
    );
  }

  private artForm(slot: number): string | undefined {
    return this.spec.partyArtForms?.[slot] ?? this.spec.artForm;
  }

  create(): void {
    // The 640×1136 grid fills the 1280×2272 canvas: one logical pixel is 2×2 canvas pixels.
    this.cameras.main.setZoom(CANVAS_ZOOM).centerOn(BATTLE_WIDTH / 2, BATTLE_HEIGHT / 2);
    if (this.spec.sheet) createSheetAnimations(this, this.spec.sheet.sheet);
    // HUD art is drawn at non-integer scales, so it is filtered smoothly; sprites stay nearest.
    for (const key of battleUiTextureKeys([...this.portraits(), ...this.cutinPortraits()])) {
      if (this.textures.exists(key)) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
    }
    this.drawBands();

    this.buildEnemyBodies();
    this.live.state.party.forEach((_, i) => {
      const spriteRect = unitSpriteRect(i);
      this.groundShadow(spriteRect);
      const art = this.spec.partyArt[i];
      if (art && art === this.spec.sheet?.art) {
        this.units.push(this.sheetUnit(spriteRect, this.spec.sheet.sheet));
      } else if (art) {
        this.units.push(this.idleUnit(spriteRect, unitIdleSprite(art, this.artForm(i)).key));
      } else {
        this.units.push({ sprite: this.box(spriteRect, COLORS.unit), sprite0: spriteRect });
      }
    });
    this.hudView = new HudView(
      this,
      {
        fontFamily: this.fontFamily,
        title: this.spec.singleRun ? this.spec.title : `${this.spec.title}  #${this.seed}`,
        portraits: this.portraits().map((texture) => texture?.key),
      },
      (i) => this.enemyBounds(i),
    );
    this.hudView.build(this.hud);
    this.hudView.setControls(this.controls);
    this.applySpeed();
    this.overlay = new FieldOverlay(this, (i) => this.enemyBounds(i));
    this.overlay.build(this.hud);
    this.overlay.render(this.hud);
    this.status = this.text(BATTLE_WIDTH / 2, 124, "", "#e8ecff", 17).setOrigin(0.5, 0);
    this.banners(waveBanners(this.hud.wave, this.cueContext()));

    this.setStatus("Tap: attack  Swipe up: burst  Down: guard");

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.down = { ...logicalPoint(this.game.canvas, pointer.event), timeMs: this.clockMs };
    });
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      this.onRelease({ ...logicalPoint(this.game.canvas, pointer.event), timeMs: this.clockMs });
    });
    this.bridge.onReady();
  }

  override update(_time: number, delta: number): void {
    const elapsed = Math.min(delta, MAX_FRAME_MS);
    this.clockMs += elapsed;
    // Speed is presentation only: at x2 each frame runs two x1 steps, so engine ticks are unchanged.
    for (const stepMs of playbackSteps(elapsed, this.controls.speed)) {
      if (this.cutinRemainingMs > 0) {
        this.cutinRemainingMs = Math.max(0, this.cutinRemainingMs - stepMs);
        continue;
      }
      if (this.heldEvents.length > 0) {
        this.showEvents(this.heldEvents);
        continue;
      }
      this.playbackMs += stepMs;
      for (const input of dueAutoInputs(this.controls, this.live, this.ui.selectedTarget)) {
        this.live = queueInput(this.live, input);
      }
      const { live, events } = advanceLive(this.live, this.playbackMs);
      this.live = live;
      this.showEvents(events);
    }
  }

  /** Stop at a cut-in even when the engine released later events in the same frame. */
  private showEvents(events: readonly BattleEvent[]): void {
    this.heldEvents = [];
    if (events.length === 0) return;
    let shown = events.length;
    for (const [index, event] of events.entries()) {
      this.hud = applyHudEvents(this.hud, [event]);
      const sparkCritical =
        event.type === "Sparked" &&
        events.some(
          (hit) =>
            hit.type === "HitLanded" &&
            hit.tick === event.tick &&
            hit.target === event.target &&
            hit.sparkCritical === true,
        );
      for (const cue of eventCues(event, this.cueContext(), sparkCritical)) this.play(cue);
      if (event.type === "BurstUsed") {
        this.heldEvents = events.slice(index + 1);
        shown = index + 1;
        break;
      }
    }
    this.bridge.onEvents?.(shown === events.length ? events : events.slice(0, shown));
    this.hudView.render(this.hud);
    this.overlay.render(this.hud);
    if (isOver(this.live) && this.heldEvents.length === 0 && this.overAtMs === undefined) {
      this.overAtMs = this.clockMs;
      if (this.live.state.result) this.bridge.onComplete?.(this.live.state.result, this.live.log);
    }
  }

  private cueContext(): CueContext {
    return { waveCount: this.hud.waveCount, bossWaves: this.spec.bossWaves ?? [] };
  }

  private onRelease(up: PointerSample): void {
    const down = this.down;
    this.down = undefined;
    if (!down) return;
    const gesture = classifyGesture(down, up);
    if (this.overAtMs === undefined && gesture.kind === "tap" && this.onControl(gesture)) return;
    if (this.overAtMs !== undefined) {
      if (
        !this.spec.singleRun &&
        gesture.kind === "tap" &&
        this.clockMs - this.overAtMs >= REPLAY_DELAY_MS
      ) {
        this.scene.restart({ seed: this.seed + 1 });
      }
      return;
    }
    if (
      gesture.kind === "none" ||
      this.cutinRemainingMs > 0 ||
      this.heldEvents.length > 0 ||
      !acceptsInput(this.live)
    )
      return;
    const state = this.live.state;
    const target = hitTest(
      hitRegions(state, (i) => this.enemyBounds(i)),
      gesture.x,
      gesture.y,
    );
    // Gesture duration uses wall time; the input tick uses the paused presentation clock.
    const result = toEngineInput(this.ui, state, { ...gesture, timeMs: this.playbackMs }, target);
    this.ui = result.ui;
    if (result.input) this.live = queueInput(this.live, result.input);
    this.showSelection(state);
  }

  /** Auto and Speed pills: they work at any point of the battle, enemy phase and cut-ins included. */
  private onControl(point: { x: number; y: number }): boolean {
    const target = hitTest(
      hitRegions(this.live.state, (i) => this.enemyBounds(i)),
      point.x,
      point.y,
    );
    if (target?.kind === "auto") this.controls = toggleAuto(this.controls);
    else if (target?.kind === "speed") this.controls = toggleSpeed(this.controls);
    else return false;
    this.hudView.setControls(this.controls);
    this.applySpeed();
    return true;
  }

  /** Tweens, timers, and sprite animations run at the playback speed too. */
  private applySpeed(): void {
    const { speed } = this.controls;
    this.tweens.timeScale = speed;
    this.time.timeScale = speed;
    this.anims.globalTimeScale = speed;
  }

  /** Plays one cue. Every number and flag drawn here was copied from an engine event. */
  private play(cue: Cue): void {
    switch (cue.kind) {
      case "action": {
        const view = this.unitView(cue.actor);
        if (!view) return;
        this.flash(view.sprite, COLORS.unitAct, COLORS.unit, 160);
        if (view.sheet?.attackTiming && view.sprite instanceof Phaser.GameObjects.Sprite) {
          // The attack animation's hit frames are the engine's hit ticks (M2-03). Idle-only
          // sheets have no attack and lunge like still sprites.
          view.sprite.play(`${view.sheet.key}-attack`).chain(`${view.sheet.key}-idle`);
        } else {
          // The party faces left, toward the enemies.
          this.tweens.add({ targets: view.sprite, x: `-=${LUNGE_PX}`, duration: 90, yoyo: true });
        }
        if (cue.tier) {
          const { x, y } = view.sprite0;
          this.floatText(x + 24, y - 8, cue.tier.toUpperCase(), "#ffcf4a", 28);
        }
        return;
      }
      case "guard":
        // The guard shield follows `HudUnit.guarding` (FieldOverlay).
        return;
      case "cutin":
        this.playCutin(cue.actor, cue.tier);
        return;
      case "rejected": {
        this.setStatus(`${this.unitName(cue.actor)}: ${cue.reason.replaceAll("_", " ")}`);
        return;
      }
      case "spark": {
        const view = this.enemyView(cue.target);
        if (!view) return;
        const { x, y, width } = view.rect;
        const color = cue.critical ? SPARK_POPUP.critColor : SPARK_POPUP.color;
        this.floatText(x + width - 40, y - 43, SPARK_POPUP.text, color, 30);
        return;
      }
      case "damage": {
        const view = this.enemyView(cue.target);
        if (!view) return;
        const spec = DAMAGE_STYLES[cue.style];
        const dx = ((cue.hitIndex % 3) - 1) * 32;
        const { x, y, width, height } = view.rect;
        this.flashes(cue.flashes, x + width / 2 + dx / 2, y + height / 2 - (cue.hitIndex % 4) * 9);
        this.floatText(
          view.rect.x + view.rect.width / 2 - 36 + dx,
          view.rect.y + view.rect.height / 2 - (cue.hitIndex % 4) * 18,
          damageLabel(cue),
          spec.color,
          spec.size,
        );
        if (cue.arrow) this.arrow(cue.target, cue.arrow, x + width / 2 + 64, y + height / 2 - 20);
        return;
      }
      case "crystals": {
        for (const drop of cue.drops) {
          this.flyCrystals(cue.target, cue.collector, drop.count, drop.piece);
        }
        return;
      }
      case "overdrive": {
        this.setStatus(`${this.unitName(cue.actor)}: Overdrive`);
        return;
      }
      case "death": {
        const view = this.enemyView(cue.target);
        if (!view) return;
        this.tweens.add({ targets: view.body, alpha: 0, scaleY: 0.2, duration: 400 });
        this.showSelection(this.live.state);
        return;
      }
      case "enemy-action": {
        const view = this.enemyView(cue.actor);
        if (!view) return;
        if (cue.paralyzed) {
          this.floatText(view.rect.x, view.rect.y - 43, "PARALYZED", "#f5e4b2", 21);
          return;
        }
        this.flash(view.body, COLORS.enemyAct, COLORS.enemy, 160);
        this.tweens.add({ targets: view.body, y: view.body.y + 36, duration: 90, yoyo: true });
        return;
      }
      case "unit-damage": {
        const view = this.unitView(cue.target);
        if (!view) return;
        this.flash(view.sprite, COLORS.unitHit, COLORS.unit, 80);
        const dx = ((cue.hitIndex % 3) - 1) * 21;
        const frame = view.sprite0;
        this.flashes(cue.flashes, frame.x + frame.width / 2 + dx, frame.y + frame.height * 0.6);
        const label = `${cue.amount}${cue.critical ? "!" : ""}`;
        this.floatText(view.sprite0.x + 40 + dx, view.sprite0.y + 16, label, "#ff7a7a", 25);
        if (cue.arrow) this.arrow(cue.target, cue.arrow, frame.x + 20, frame.y + 30);
        return;
      }
      case "heal": {
        const rect = cue.target.startsWith("e")
          ? this.enemyView(cue.target)?.rect
          : this.unitView(cue.target as PlayerSlotId)?.sprite0;
        if (rect) this.floatText(rect.x + 24, rect.y, `+${cue.amount}`, "#7fe08a", 25);
        return;
      }
      case "unit-death": {
        const view = this.unitView(cue.target);
        if (view) this.tweens.add({ targets: view.sprite, alpha: 0.2, duration: 300 });
        return;
      }
      case "wave": {
        this.buildEnemyBodies();
        this.hudView.buildEnemies(this.hud);
        this.overlay.resetEnemies();
        this.ui = {
          odArmed: this.ui.odArmed,
          ...(this.ui.selectedItem === undefined ? {} : { selectedItem: this.ui.selectedItem }),
        };
        this.showSelection(this.live.state);
        this.banners(cue.banners);
        return;
      }
      case "turn": {
        for (const view of this.units) this.paint(view.sprite, COLORS.unit, COLORS.unit);
        this.setStatus(`Turn ${cue.turn}: your move`);
        return;
      }
      case "result": {
        this.overlay.target(undefined);
        this.setStatus("");
        this.hudView.showResult(cue.result, cue.turn, !this.spec.singleRun);
        return;
      }
    }
  }

  /** A tier-coloured presentation beat over a blurred capture of the upper battle field. */
  private playCutin(actor: PlayerSlotId, tier: BurstTier): void {
    const slot = this.live.state.party.findIndex((unit) => unit.slot === actor);
    if (slot < 0) return;
    const unit = this.live.state.party[slot];
    const portrait = this.cutinPortraits()[slot];
    if (!unit || !portrait || !this.textures.exists(portrait.key)) return;
    const name = unit.form.bursts[tier]?.name;
    if (!name) return;
    this.cutinRemainingMs = CUTIN_MS;
    const tint = CUTIN_COLORS[tier];
    const field = this.add
      .renderTexture(0, 0, BATTLE_WIDTH, BANDS.field.y + BANDS.field.height)
      .setOrigin(0)
      .setDepth(TOP_DEPTH + 1);
    field.draw(this.children.list.filter((child) => child !== field));
    field.postFX.addBlur(1, 2, 2, 1.5);
    field.setTint(tint);
    const shade = this.add
      .rectangle(0, 0, BATTLE_WIDTH, 520, 0x070b1b, 0.55)
      .setOrigin(0)
      .setDepth(TOP_DEPTH + 2);
    const streaks = this.add
      .image(0, 22, uiPiece("cutin-streaks").key)
      .setOrigin(0)
      .setDisplaySize(640, 426)
      .setTint(tint);
    const portraitImage = this.add.image(0, 0, portrait.key).setOrigin(0).setDisplaySize(640, 520);
    const ribbonPiece = `cutin-ribbon-${tier}` as const;
    const ribbon = this.add
      .image(0, 337, uiPiece(ribbonPiece).key)
      .setOrigin(0)
      .setDisplaySize(570, uiPieceSize(ribbonPiece).height / 2);
    const label = this.text(51, 371, name, "#ffffff", 28).setOrigin(0, 0.5);
    label.setWordWrapWidth(425);
    const card = this.add
      .container(BATTLE_WIDTH, 0, [streaks, portraitImage, ribbon, label])
      .setDepth(TOP_DEPTH + 3);
    this.tweens.add({ targets: card, x: 0, duration: 190, ease: "Cubic.Out" });
    this.tweens.add({
      targets: card,
      x: -BATTLE_WIDTH,
      delay: 610,
      duration: 240,
      ease: "Cubic.In",
      onComplete: () => {
        card.destroy();
        shade.destroy();
        field.destroy();
      },
    });
  }

  /**
   * The stage painting fills the canvas. A dark panel anchors the card area below the boss band.
   */
  private drawBands(): void {
    const g = this.add.graphics();
    const fill = (color: number, r: Rect) =>
      g.fillStyle(color).fillRect(r.x, r.y, r.width, r.height);
    const { topBar, field, bossBar } = BANDS;
    if (this.spec.background) {
      this.add
        .image(0, 0, this.spec.background)
        .setOrigin(0)
        .setDisplaySize(BATTLE_WIDTH, BATTLE_HEIGHT)
        .setDepth(-1);
    } else {
      fill(COLORS.sky, field);
      const horizon = field.y + Math.round(field.height * 0.4);
      fill(COLORS.horizon, { ...field, y: horizon, height: 8 });
      fill(COLORS.ground, {
        ...field,
        y: horizon + 8,
        height: field.y + field.height - horizon - 8,
      });
    }
    fill(COLORS.panel, topBar);
    fill(COLORS.panel, {
      x: 0,
      y: bossBar.y,
      width: BATTLE_WIDTH,
      height: BATTLE_HEIGHT - bossBar.y,
    });
  }

  private enemyBounds(index: number): Rect {
    return this.spec.enemyWaves?.[this.hud.wave]?.[index]?.size === 256
      ? bossEnemyRect()
      : enemyRect(index);
  }

  /** Enemy sprites and their feet shadows for the wave now on screen. */
  private buildEnemyBodies(): void {
    for (const view of this.enemies) {
      view.body.destroy();
      for (const shadow of view.shadows) shadow.destroy();
    }
    this.enemies = this.hud.enemies.map((_, i) => {
      const rect = this.enemyBounds(i);
      const shadows = this.groundShadow(rect, rect.width > SPRITE_SIZE ? 112 : 80);
      const id = this.spec.enemyWaves?.[this.hud.wave]?.[i]?.id;
      const body = id
        ? this.add
            .sprite(rect.x + rect.width / 2, rect.y + rect.height, id)
            .setOrigin(0.5, 1)
            .setDisplaySize(rect.width, rect.height)
        : this.box(rect, COLORS.enemy);
      return { body, rect, shadows };
    });
  }

  /** Two translucent ovals make a soft contact shadow without baking it into character art. */
  private groundShadow(rect: Rect, width = 80): Phaser.GameObjects.Ellipse[] {
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height - 3;
    return [
      this.add.ellipse(x, y, width + 20, 20, 0x10131b, 0.12),
      this.add.ellipse(x, y, width, 12, 0x10131b, 0.3),
    ];
  }

  /**
   * Crystal pickup: up to `MAX_FLYING_CRYSTALS` crystals burst from the enemy and fly to the
   * collector's card.
   */
  private flyCrystals(
    from: `e${number}`,
    collector: PlayerSlotId,
    count: number,
    piece: "crystal-bc" | "crystal-hc",
  ): void {
    const enemy = this.enemyView(from);
    const index = this.hud.units.findIndex((unit) => unit.slot === collector);
    if (!enemy || index < 0 || count <= 0) return;
    const to = this.hudView.cardCenter(index);
    const cx = enemy.rect.x + enemy.rect.width / 2;
    const cy = enemy.rect.y + enemy.rect.height / 2;
    const { width, height } = uiPieceSize(piece);
    for (let i = 0; i < Math.min(count, MAX_FLYING_CRYSTALS); i++) {
      const crystal = this.add
        .image(cx, cy, uiPiece(piece).key)
        .setDisplaySize(width * ART_SCALE, height * ART_SCALE)
        .setDepth(TOP_DEPTH);
      // A short pop outward, then the flight to the card.
      this.tweens.chain({
        targets: crystal,
        tweens: [
          {
            x: cx + ((i % 3) - 1) * 26,
            y: cy - 20 - Math.floor(i / 3) * 18,
            duration: 140,
            ease: "Quad.easeOut",
          },
          {
            x: to.x,
            y: to.y,
            delay: i * 30,
            duration: 380,
            ease: "Quad.easeIn",
            onComplete: () => crystal.destroy(),
          },
        ],
      });
    }
  }

  private showSelection(state: BattleState): void {
    const index =
      this.ui.selectedTarget === undefined
        ? -1
        : this.hud.enemies.findIndex((enemy) => enemy.slot === this.ui.selectedTarget);
    const enemy = this.hud.enemies[index];
    this.overlay.target(enemy && enemy.hp > 0 ? index : undefined);
    this.hudView.setOdArmed(this.ui.odArmed && isOdFull(state.od));
    this.hudView.setSelectedItem(this.ui.selectedItem);
  }

  private unitView(slot: PlayerSlotId): UnitView | undefined {
    return this.units[this.hud.units.findIndex((unit) => unit.slot === slot)];
  }

  private enemyView(slot: string): EnemyView | undefined {
    return this.enemies[this.hud.enemies.findIndex((enemy) => enemy.slot === slot)];
  }

  /**
   * A unit drawn from a sprite sheet, feet on the bottom centre of its field rectangle, at scale 1
   * on the grid: exactly 2× on the canvas with nearest-neighbour filtering (RESOLVED-40).
   */
  private sheetUnit(rect: Rect, sheet: UnitSpriteSheet): UnitView {
    const sprite = this.add
      .sprite(rect.x + rect.width / 2, rect.y + rect.height, sheet.key)
      .setOrigin(0.5, 1)
      .play(`${sheet.key}-idle`);
    return { sprite, sprite0: rect, sheet };
  }

  /**
   * A unit drawn from a locked still idle sprite (M2-03C), feet on the bottom centre of its frame.
   * Exports face left, toward the enemies, so no flip is needed.
   */
  private idleUnit(rect: Rect, key: string): UnitView {
    const sprite = this.add
      .sprite(rect.x + rect.width / 2, rect.y + rect.height, key)
      .setOrigin(0.5, 1);
    return { sprite, sprite0: rect };
  }

  private box(rect: Rect, color: number): Phaser.GameObjects.Rectangle {
    return this.add.rectangle(rect.x, rect.y, rect.width, rect.height, color).setOrigin(0);
  }

  private text(
    x: number,
    y: number,
    value: string,
    color: string,
    size: number,
  ): Phaser.GameObjects.Text {
    // Outlined Lilita One at the canvas resolution, so the 2× camera draws it 1:1 and sharp.
    return this.add.text(x, y, value, hudTextStyle(this.fontFamily, size, color));
  }

  private floatText(x: number, y: number, value: string, color: string, size: number): void {
    const label = this.text(x, y, value, color, size);
    this.tweens.add({
      targets: label,
      y: y - 50,
      alpha: 0,
      delay: 250,
      duration: 550,
      onComplete: () => label.destroy(),
    });
  }

  /**
   * Hit feedback: each flash image blooms and fades over the target with additive blending, so
   * stacked flashes brighten rather than cover the sprite.
   */
  private flashes(pieces: readonly FlashPiece[], x: number, y: number): void {
    for (const piece of pieces) {
      const size = FLASH_PX[piece];
      const flash = this.add
        .image(x, y, uiPiece(piece).key)
        .setDisplaySize(size, size)
        .setBlendMode(Phaser.BlendModes.ADD);
      const scale = flash.scaleX;
      flash.setScale(scale * 0.6);
      this.tweens.add({
        targets: flash,
        scale: scale * 1.15,
        alpha: { from: 1, to: 0 },
        duration: piece === "fx-hit" ? 180 : 260,
        ease: "Quad.easeOut",
        onComplete: () => flash.destroy(),
      });
    }
  }

  /**
   * Shows `piece` beside a struck target's damage numbers. A target keeps one arrow: each later hit
   * (every hit of a multi-hit attack) refreshes it in place, swapping the art if the relation
   * changed, and it fades `ARROW_HOLD_MS` after the last one.
   */
  private arrow(slot: string, piece: ElementArrow, x: number, y: number): void {
    const { width, height } = uiPieceSize(piece);
    let arrow = this.arrows.get(slot);
    if (arrow) {
      this.tweens.killTweensOf(arrow);
      arrow.setTexture(uiPiece(piece).key);
    } else {
      arrow = this.add.image(x, y, uiPiece(piece).key).setDepth(TOP_DEPTH - 1);
      this.arrows.set(slot, arrow);
    }
    const shown = arrow;
    shown
      .setPosition(x, y)
      .setDisplaySize(width * ART_SCALE, height * ART_SCALE)
      .setAlpha(1);
    this.tweens.add({ targets: shown, y: y - 6, duration: 140, yoyo: true, ease: "Quad.easeOut" });
    this.tweens.add({
      targets: shown,
      alpha: 0,
      delay: ARROW_HOLD_MS,
      duration: ARROW_FADE_MS,
      onComplete: () => {
        if (this.arrows.get(slot) === shown) this.arrows.delete(slot);
        shown.destroy();
      },
    });
  }

  /**
   * Wave and boss banners, one after another: each plate slides in across the field with its
   * outlined title, holds, and slides out.
   */
  private banners(banners: readonly Banner[]): void {
    banners.forEach((banner, i) => {
      const { width, height } = uiPieceSize(banner.piece);
      const y = 300;
      const plate = this.add
        .image(0, 0, uiPiece(banner.piece).key)
        .setDisplaySize(width * ART_SCALE, height * ART_SCALE);
      const title = this.text(0, 0, banner.title, "#fff4d6", 44).setOrigin(0.5);
      const group = this.add
        .container(BATTLE_WIDTH * 1.5, y, [plate, title])
        .setDepth(TOP_DEPTH)
        .setAlpha(0);
      this.tweens.chain({
        targets: group,
        delay: i * BANNER_MS,
        tweens: [
          { x: BATTLE_WIDTH / 2, alpha: 1, duration: 220, ease: "Cubic.easeOut" },
          {
            x: -BATTLE_WIDTH / 2,
            alpha: 0,
            delay: 650,
            duration: 220,
            ease: "Cubic.easeIn",
            onComplete: () => group.destroy(),
          },
        ],
      });
    });
  }

  private flash(target: Body, color: number, restore: number, ms: number): void {
    this.paint(target, color, restore);
    this.time.delayedCall(ms, () => this.paint(target, restore, restore));
  }

  /** Fills a placeholder rectangle, or tints a sprite (no tint when `color` is its rest colour). */
  private paint(target: Body, color: number, rest: number): void {
    if (target instanceof Phaser.GameObjects.Sprite) {
      if (color === rest) target.clearTint();
      else target.setTint(color);
      return;
    }
    target.setFillStyle(color);
  }

  private unitName(slot: PlayerSlotId): string {
    return this.hud.units.find((unit) => unit.slot === slot)?.name ?? slot;
  }

  private setStatus(value: string): void {
    this.status.setText(value);
  }
}
