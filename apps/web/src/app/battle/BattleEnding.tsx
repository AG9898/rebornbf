"use client";

import type { Stage } from "@bfr/data";
import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { UiImage } from "../../components/menu/UiImage.tsx";
import { THUMB_ART_SIZE } from "../../components/menu/ui-assets.ts";
import {
  type AcquiredUnit,
  endingStage,
  type QuestResultView,
  type ResultStep,
  type RewardSlot,
  resultSteps,
} from "../../lib/battle/result-screen.ts";
import type { Submission } from "../../lib/battle/submit-session.ts";
import styles from "./battle-result.module.css";

/** How long the clear beat (streak, CONGRATULATIONS, fade) holds the field before the rewards. */
const CLEAR_MS = 2400;
const CLEAR_REDUCED_MS = 1400;
/** GAME OVER's hold before the Continue / give-up dialog. */
const GAME_OVER_MS = 1200;
const COUNT_UP_MS = 700;

/** True when the player's setting or the OS asks for reduced motion. */
function useReducedMotion(setting: boolean): boolean {
  const [system, setSystem] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    setSystem(query.matches);
    const change = (): void => setSystem(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return setting || system;
}

/** Counts from 0 up to `target`; reduced motion shows the final amount at once. */
function useCountUp(target: number, reduced: boolean): number {
  const [value, setValue] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced || target <= 0) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      setValue(Math.round(target * t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, reduced]);
  return value;
}

export type ContinueState = {
  /** The server-authorized gem continue; absent when the battle cannot continue (a trial). */
  action?: () => Promise<void>;
  busy: boolean;
  error?: string;
};

/**
 * The quest completion flow over the battle (M2-07H; ART_GUIDE → Battle result screens). A win
 * plays the clear beat while the server verifies the log, then (only for a verified submission)
 * the Quest Clear Reward screen, the starter reveal, and the first-clear bonus. A loss shows GAME
 * OVER, then the Continue dialog. It only presents `ending`; settlement happened once upstream.
 */
export function BattleEnding({
  ending,
  stage,
  back,
  continueState,
  reducedMotion,
}: {
  ending: "pending" | "lost" | Submission;
  stage: Pick<Stage, "name" | "story" | "trial">;
  back: { href: string; label: string };
  continueState: ContinueState;
  reducedMotion: boolean;
}): ReactNode {
  const reduced = useReducedMotion(reducedMotion);
  const current = endingStage(ending, stage);
  const motion = reduced ? "reduced" : "full";

  if (current.kind === "defeat") {
    return (
      <div className={styles.layer} data-motion={motion}>
        <GameOver back={back} continueState={continueState} reduced={reduced} />
      </div>
    );
  }
  return (
    <div className={styles.layer} data-motion={motion}>
      <Victory current={current} back={back} reduced={reduced} />
    </div>
  );
}

function Victory({
  current,
  back,
  reduced,
}: {
  current: Exclude<ReturnType<typeof endingStage>, { kind: "defeat" }>;
  back: { href: string; label: string };
  reduced: boolean;
}): ReactNode {
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setCleared(true), reduced ? CLEAR_REDUCED_MS : CLEAR_MS);
    return () => window.clearTimeout(timer);
  }, [reduced]);

  if (!cleared) {
    return (
      <button
        type="button"
        className={styles.clearBeat}
        onClick={() => setCleared(true)}
        aria-label="Quest cleared. Tap to continue."
      >
        <UiImage name="cutin-streaks" className={styles.streak} />
        <span className={styles.congrats}>CONGRATULATIONS</span>
        <span className={styles.areaCleared}>AREA CLEARED</span>
      </button>
    );
  }
  if (current.kind === "verifying") {
    return (
      <div className={styles.status} role="status" aria-live="polite">
        <p className={styles.outline}>Verifying battle…</p>
      </div>
    );
  }
  if (current.kind === "error") {
    return (
      <div className={styles.status}>
        <p role="alert" className={styles.outline}>
          {current.message}
        </p>
        <Link href={back.href} className={`${styles.pill} ${styles.wide}`}>
          <span className={styles.outline}>{back.label}</span>
        </Link>
      </div>
    );
  }
  return <Rewards view={current.view} back={back} reduced={reduced} />;
}

function Rewards({
  view,
  back,
  reduced,
}: {
  view: QuestResultView;
  back: { href: string; label: string };
  reduced: boolean;
}): ReactNode {
  const steps = resultSteps(view);
  const [index, setIndex] = useState(0);
  const step: ResultStep = steps[Math.min(index, steps.length - 1)] ?? "rewards";
  const last = index >= steps.length - 1;
  const next = last ? (
    <Link href={back.href} className={`${styles.pill} ${styles.wide} ${styles.lit}`}>
      <span className={styles.outline}>{back.label}</span>
    </Link>
  ) : (
    <button
      type="button"
      className={`${styles.pill} ${styles.pillButton} ${styles.lit}`}
      onClick={() => setIndex((i) => i + 1)}
    >
      <span className={styles.outline}>Next</span>
    </button>
  );

  return (
    <section className={styles.rewardScreen} aria-label="Quest Clear Reward">
      <header className={styles.topBar} aria-hidden>
        <UiImage name="top-crest" className={styles.crest} />
      </header>
      <div className={styles.titleRow}>
        <UiImage name="result-tab" className={styles.resultTab} />
        <h2 className={`${styles.resultTitle} ${styles.outline}`}>Quest Clear Reward</h2>
      </div>
      <p className={`${styles.area} ${styles.outline}`}>{view.areaName}</p>
      <p className={`${styles.questName} ${styles.outline}`}>“{view.stageName}”</p>

      {step === "rewards" ? <RewardBody view={view} reduced={reduced} /> : null}
      {step === "starter" && view.starter ? (
        <section className={styles.starter} aria-label="Starter unlocked">
          <p className={styles.bonusTitle}>NEW UNIT!!</p>
          <div className={styles.starterStage}>
            <UiImage name="result-halo" className={styles.starterHalo} />
            {view.starter.illustration ? (
              <Image
                src={view.starter.illustration}
                alt=""
                width={512}
                height={512}
                className={styles.starterArt}
                unoptimized
                draggable={false}
              />
            ) : null}
          </div>
          <h3 className={`${styles.starterName} ${styles.outline}`}>
            {view.starter.name} · {view.starter.rarity}★
          </h3>
          {view.starter.quote ? <p className={styles.quote}>{view.starter.quote}</p> : null}
          <Link href={view.starter.href} className={`${styles.pill} ${styles.wide}`}>
            <span className={styles.outline}>View unit</span>
          </Link>
        </section>
      ) : null}
      {step === "bonus" ? (
        <section className={styles.bonus} aria-label="First Clear Bonus">
          <UiImage name="summon-panel" className={styles.panelArt} />
          <div className={styles.panelBody}>
            <p className={styles.bonusTitle}>BONUS GET!!</p>
            <p className={`${styles.bonusLabel} ${styles.outline}`}>First Clear Bonus</p>
            <p className={`${styles.bonusAmount} ${styles.outline}`}>
              <UiImage name="icon-gem" alt="Gems" className={styles.rowIcon} />
              {view.gems}
            </p>
          </div>
        </section>
      ) : null}

      <div className={styles.actions}>{next}</div>
    </section>
  );
}

function RewardBody({ view, reduced }: { view: QuestResultView; reduced: boolean }): ReactNode {
  const zel = useCountUp(view.zel, reduced);
  const gems = useCountUp(view.gems, reduced);
  return (
    <div className={styles.rewardBody}>
      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt className={styles.outline}>
            <UiImage name="icon-zel" className={styles.rowIcon} />
            Zel Obtained
          </dt>
          <dd className={styles.outline}>
            <span aria-hidden>{zel.toLocaleString("en-US")}</span>
            <span className={styles.srOnly}>{view.zel.toLocaleString("en-US")}</span>
          </dd>
        </div>
        {view.gems > 0 ? (
          <div className={styles.row} style={{ animationDelay: "120ms" }}>
            <dt className={styles.outline}>
              <UiImage name="icon-gem" className={styles.rowIcon} />
              Gems
            </dt>
            <dd className={styles.outline}>
              <span aria-hidden>{gems.toLocaleString("en-US")}</span>
              <span className={styles.srOnly}>{view.gems.toLocaleString("en-US")}</span>
            </dd>
          </div>
        ) : null}
      </dl>

      {view.materials.length > 0 ? (
        <section aria-label="Materials">
          <SectionTab label="Materials" />
          <ul className={styles.slots}>
            {view.materials.map((slot, i) => (
              <MaterialSlot key={slot.itemId} slot={slot} index={i} />
            ))}
          </ul>
        </section>
      ) : null}

      {view.units.length > 0 ? (
        <section aria-label="Units Acquired">
          <SectionTab label="Units Acquired" />
          <ul className={styles.slots}>
            {view.units.map((unit, i) => (
              <UnitSlot key={unit.key} unit={unit} index={i} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function SectionTab({ label }: { label: string }): ReactNode {
  return (
    <div className={styles.sectionTab}>
      <UiImage name="section-tab" className={styles.sectionArt} />
      <h3 className={styles.outline}>{label}</h3>
    </div>
  );
}

/** A `reward-slot-hidden` "?" tile that flips, in order, to the item on `reward-slot`. */
function MaterialSlot({ slot, index }: { slot: RewardSlot; index: number }): ReactNode {
  const delay = { animationDelay: `${400 + index * 180}ms` };
  return (
    <li className={styles.slotCell} aria-label={`${slot.name} ×${slot.count}`}>
      <div className={styles.slot}>
        <div className={styles.slotFace} style={delay}>
          <UiImage name="reward-slot" className={styles.slotArt} />
          {slot.icon ? (
            <span className={styles.slotIcon}>
              <UiImage name={slot.icon} />
            </span>
          ) : (
            <span className={`${styles.slotInitial} ${styles.outline}`}>{slot.name.charAt(0)}</span>
          )}
          <span className={`${styles.slotCount} ${styles.outline}`}>×{slot.count}</span>
        </div>
        <div className={styles.slotHidden} style={delay} aria-hidden>
          <UiImage name="reward-slot-hidden" className={styles.slotArt} />
          <span className={`${styles.slotQuestion} ${styles.outline}`}>?</span>
        </div>
      </div>
      <span className={`${styles.slotName} ${styles.outline}`}>{slot.name}</span>
    </li>
  );
}

/** A unit thumbnail in its element frame, flashing white before it shows. */
function UnitSlot({ unit, index }: { unit: AcquiredUnit; index: number }): ReactNode {
  const face = (
    <>
      <span className={styles.unitArt}>
        {unit.thumb ? (
          <Image
            src={unit.thumb}
            alt=""
            width={THUMB_ART_SIZE.width}
            height={THUMB_ART_SIZE.height}
            unoptimized
            draggable={false}
          />
        ) : (
          <span className={styles.outline}>{unit.name.charAt(0)}</span>
        )}
      </span>
      {unit.element ? (
        <UiImage name={`unit-frame-${unit.element}`} className={styles.slotArt} />
      ) : null}
      {unit.count > 1 ? (
        <span className={`${styles.slotCount} ${styles.outline}`}>×{unit.count}</span>
      ) : null}
      <span
        className={styles.unitFlash}
        style={{ animationDelay: `${300 + index * 160}ms` }}
        aria-hidden
      />
    </>
  );
  const label = unit.count > 1 ? `${unit.name} ×${unit.count}` : unit.name;
  return (
    <li className={styles.slotCell}>
      {unit.href ? (
        <Link href={unit.href} className={styles.slot} aria-label={`${label}: view unit`}>
          {face}
        </Link>
      ) : (
        <div className={styles.slot} role="img" aria-label={label}>
          {face}
        </div>
      )}
      <span className={`${styles.slotName} ${styles.outline}`}>{unit.name}</span>
    </li>
  );
}

function GameOver({
  back,
  continueState,
  reduced,
}: {
  back: { href: string; label: string };
  continueState: ContinueState;
  reduced: boolean;
}): ReactNode {
  const [dialog, setDialog] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setDialog(true), reduced ? 0 : GAME_OVER_MS);
    return () => window.clearTimeout(timer);
  }, [reduced]);
  return (
    <div className={styles.defeat}>
      <p className={styles.gameOver} role="status">
        GAME OVER
      </p>
      {dialog ? (
        <section className={styles.continuePanel} aria-label="Continue">
          <UiImage name="summon-panel" className={styles.panelArt} />
          <div className={styles.panelBody}>
            {continueState.action ? (
              <>
                <p className={`${styles.bonusLabel} ${styles.outline}`}>Continue the battle?</p>
                <p className={styles.panelNote}>Spend 5 gems to continue this battle.</p>
              </>
            ) : (
              <>
                <p className={`${styles.bonusLabel} ${styles.outline}`}>Battle lost</p>
                <p className={styles.panelNote}>No rewards were claimed.</p>
              </>
            )}
            {continueState.error ? (
              <p role="alert" className={styles.panelError}>
                {continueState.error}
              </p>
            ) : null}
            <div className={styles.panelActions}>
              {continueState.action ? (
                <button
                  type="button"
                  disabled={continueState.busy}
                  onClick={() => void continueState.action?.()}
                  className={`${styles.pill} ${styles.pillButton} ${styles.lit}`}
                >
                  <span className={styles.outline}>
                    {continueState.busy ? "Continuing…" : "Continue · 5 gems"}
                  </span>
                </button>
              ) : null}
              <Link href={back.href} className={`${styles.pill} ${styles.wide}`}>
                <span className={styles.outline}>Give up</span>
              </Link>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
