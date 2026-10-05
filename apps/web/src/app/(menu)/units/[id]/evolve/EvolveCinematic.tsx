"use client";

import Image from "next/image";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { UiImage } from "../../../../../components/menu/UiImage.tsx";
import type { UiAsset } from "../../../../../components/menu/ui-assets.ts";
import {
  type EvolveStep,
  type EvolveTheme,
  evolveStepMs,
  firstEvolveStep,
  nextEvolveStep,
} from "../../../../../lib/units/evolve-cinematic.ts";
import styles from "./evolve-cinematic.module.css";

/** One material pedestal: a unit's thumb, an item's icon, or the name's initial. */
export type CinematicMaterial = {
  key: string;
  name: string;
  thumb: string | null;
  icon: UiAsset | null;
};

export type EvolveCinematicView = {
  name: string;
  baseSprite: string | null;
  materials: CinematicMaterial[];
  nextSprite: string | null;
  /** The new form's rarity label and name, e.g. "5★ Ember Knight". */
  nextLabel: string;
  quote: string | null;
  word: string;
  theme: EvolveTheme;
};

/** The material pedestals' spots around the base, in need order (at most five shown). */
const SPOTS = ["tl", "tr", "bl", "br", "bc"] as const;

/** Steps at or after which each layer shows (by index in the full sequence). */
const ORDER: readonly EvolveStep[] = [
  "pedestals",
  "circles",
  "join",
  "pillars",
  "beam",
  "starburst",
  "flash",
  "reveal",
];
function reached(step: EvolveStep, from: EvolveStep): boolean {
  return ORDER.indexOf(step) >= ORDER.indexOf(from);
}

/** True when the player's saved setting or the OS asks for reduced motion. */
function useReducedMotion(setting: boolean): boolean | null {
  const [system, setSystem] = useState<boolean | null>(null);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    setSystem(query?.matches ?? false);
    if (!query) return;
    const change = (): void => setSystem(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return system === null ? null : setting || system;
}

/**
 * The evolve cinematic (M4-06M; ART_GUIDE → UI → Evolve cinematic), played over the menu column
 * after `evolve` succeeds: a black stage with the base and material pedestals, their circles
 * lighting and joining into one, pillars and falling sparks, a beam, a starburst, a white flash,
 * then the new form on its halo with the quote and the rarity word dropping in letter by letter.
 * Reduced motion swaps the sequence for one short fade. A tap or Skip at any step calls `onDone`
 * (the new form's unit page). CSS stand-ins draw the circle, pillars, and starburst until M4-06K.
 */
export function EvolveCinematic({
  view,
  reducedMotion,
  onDone,
}: {
  view: EvolveCinematicView;
  reducedMotion: boolean;
  onDone: () => void;
}): ReactNode {
  const reduced = useReducedMotion(reducedMotion);
  const [step, setStep] = useState<EvolveStep | null>(null);

  useEffect(() => {
    if (reduced !== null) setStep((current) => current ?? firstEvolveStep(reduced));
  }, [reduced]);

  useEffect(() => {
    if (!step) return;
    const ms = evolveStepMs(step);
    const next = nextEvolveStep(step);
    if (ms === null || !next) return;
    const id = window.setTimeout(() => setStep(next), ms);
    return () => window.clearTimeout(id);
  }, [step]);

  // Until the motion preference is known, the stage stays black.
  const shown: EvolveStep = step ?? "pedestals";
  const isReveal = step === "reveal";
  const staging = step !== null && !isReveal && step !== "fade";
  const materials = view.materials.slice(0, SPOTS.length);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the Skip button is the keyboard path.
    <div
      className={styles.cinematic}
      data-step={step ?? undefined}
      data-theme={view.theme}
      data-reduced={reduced || undefined}
      role="dialog"
      aria-modal="true"
      aria-label={`${view.name} evolves`}
      onClick={onDone}
    >
      {staging ? (
        <div className={styles.stage} aria-hidden>
          <div className={styles.circleJoined} data-on={reached(shown, "join") || undefined} />
          <Pedestal spot="centre" lit={reached(shown, "circles")}>
            <Sprite src={view.baseSprite} name={view.name} />
          </Pedestal>
          {materials.map((m, i) => (
            <Pedestal key={m.key} spot={SPOTS[i] ?? "bc"} lit={reached(shown, "circles")}>
              {m.thumb ? (
                <Image
                  src={m.thumb}
                  alt=""
                  width={96}
                  height={96}
                  className={styles.materialThumb}
                  unoptimized
                  draggable={false}
                />
              ) : m.icon ? (
                <UiImage name={m.icon} className={styles.materialThumb} />
              ) : (
                <span className={styles.initial}>{m.name.charAt(0)}</span>
              )}
              {reached(shown, "pillars") ? <span className={styles.pillar} /> : null}
            </Pedestal>
          ))}
          {reached(shown, "pillars") ? <Sparks /> : null}
          {reached(shown, "beam") ? <div className={styles.beam} /> : null}
          {reached(shown, "starburst") ? <div className={styles.starburst} /> : null}
          {shown === "flash" ? <div className={styles.flash} /> : null}
        </div>
      ) : null}

      {shown === "fade" ? <div className={styles.fade} aria-hidden /> : null}

      {isReveal ? (
        <div className={styles.reveal}>
          <RarityWord word={view.word} />
          <div className={styles.haloWrap}>
            <span className={styles.halo} aria-hidden />
            <Sprite src={view.nextSprite} name={view.name} large />
          </div>
          <p className={styles.revealName}>
            {view.name}
            <span className={styles.revealForm}>{view.nextLabel}</span>
          </p>
          {view.quote ? <p className={styles.quote}>{view.quote}</p> : null}
          <span className={styles.tapHint}>Tap to continue</span>
        </div>
      ) : null}

      <div className={styles.skipBar}>
        <button
          type="button"
          className={styles.skip}
          onClick={(event) => {
            event.stopPropagation();
            onDone();
          }}
        >
          {isReveal ? "OK" : "Skip"}
        </button>
      </div>
    </div>
  );
}

function Pedestal({
  spot,
  lit,
  children,
}: {
  spot: (typeof SPOTS)[number] | "centre";
  lit: boolean;
  children: ReactNode;
}): ReactNode {
  return (
    <div className={styles.pedestal} data-spot={spot}>
      <span className={styles.circle} data-on={lit || undefined} />
      <UiImage name="squad-pedestal" className={styles.stone} />
      <span className={styles.occupant}>{children}</span>
    </div>
  );
}

function Sprite({
  src,
  name,
  large,
}: {
  src: string | null;
  name: string;
  large?: boolean;
}): ReactNode {
  const className = large ? styles.revealSprite : styles.baseSprite;
  return src ? (
    <Image
      src={src}
      alt=""
      width={128}
      height={128}
      className={className}
      unoptimized
      draggable={false}
    />
  ) : (
    <span className={`${className} ${styles.initial}`}>{name.charAt(0)}</span>
  );
}

/** Sparks raining from the top: fixed columns and delays, so renders are stable. */
const SPARKS = [6, 14, 23, 31, 40, 48, 57, 65, 74, 82, 91, 97];
function Sparks(): ReactNode {
  return (
    <div className={styles.sparks}>
      {SPARKS.map((x, i) => (
        <span
          key={x}
          className={styles.spark}
          style={{ "--x": `${x}%`, "--d": `${(i * 137) % 600}ms` } as CSSProperties}
        />
      ))}
    </div>
  );
}

/** The rarity word dropping in letter by letter in the theme's fill. */
function RarityWord({ word }: { word: string }): ReactNode {
  return (
    <span className={styles.word} role="img" aria-label={word}>
      {[...word].map((ch, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: letters repeat; position is the identity.
          key={i}
          className={styles.letter}
          style={{ "--i": i } as CSSProperties}
          aria-hidden="true"
        >
          {ch === " " ? " " : ch}
        </span>
      ))}
    </span>
  );
}
