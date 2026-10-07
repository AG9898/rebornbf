"use client";

import Image from "next/image";
import { type ReactNode, useEffect, useState } from "react";
import { UiImage } from "../../../components/menu/UiImage.tsx";
import type { FusionResultRow, FusionResultView } from "../../../lib/units/fusion-result.ts";
import type { FODDER_SPOTS } from "../../../lib/units/fusion-stage.ts";
import squad from "../squad/squad.module.css";
import units from "../units/units.module.css";
import styles from "./fusion.module.css";

/** One fodder pedestal's sprite as it flies into the base. */
export type FlyingFodder = {
  spot: (typeof FODDER_SPOTS)[number];
  name: string;
  sprite: string | null;
};

/** Longest the fly-in may hold the screen if no `animationend` arrives (animations disabled). */
const ANIMATION_FALLBACK_MS = 2500;

/**
 * The fusion animation and result screen (M4-06E; legacy/ART_GUIDE_BFR.md → UI → Fusion stage and Fusion
 * result). First the fodder sprites fly from their pedestals into the base and a flash covers it;
 * the flash's end opens the result: element orb and name, the before ▶ after table, Next Lv. with
 * the EXP bar, the Great/Super Success line when rolled, LEVEL UP!! when the level rose, the idle
 * sprite on `result-halo`, and the quote. Skip, in either phase, returns to the stage.
 */
export function FusionResult({
  baseSprite,
  baseName,
  fodder,
  result,
  onSkip,
}: {
  baseSprite: string | null;
  baseName: string;
  fodder: FlyingFodder[];
  result: FusionResultView;
  onSkip: () => void;
}): ReactNode {
  const [phase, setPhase] = useState<"animation" | "result">("animation");

  useEffect(() => {
    if (phase !== "animation") return;
    const timer = window.setTimeout(() => setPhase("result"), ANIMATION_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const skip = (
    <button
      type="button"
      className={`${units.pill} ${units.pillButton} ${styles.skipPill}`}
      onClick={onSkip}
    >
      <span className={units.outline}>Skip</span>
    </button>
  );

  if (phase === "animation") {
    return (
      <div className={`${squad.page} ${styles.fusingPage}`}>
        <section className={styles.stage} aria-label={`Fusing into ${baseName}`}>
          <div className={`${squad.pedestal} ${styles.base}`}>
            <UiImage name="squad-pedestal" className={squad.pedestalArt} />
            <Sprite src={baseSprite} name={baseName} className={styles.fusingBase} />
          </div>
          {fodder.map((unit) => (
            <div
              key={unit.spot}
              className={`${squad.pedestal} ${styles.fodder}`}
              data-spot={unit.spot}
            >
              <UiImage
                name="squad-pedestal"
                className={`${squad.pedestalArt} ${styles.fodderStone}`}
              />
              <Sprite
                src={unit.sprite}
                name={unit.name}
                className={`${styles.fodderSprite} ${styles.flyIn}`}
              />
            </div>
          ))}
          <div className={styles.flash} aria-hidden onAnimationEnd={() => setPhase("result")} />
        </section>
        <div className={styles.skipRow}>{skip}</div>
      </div>
    );
  }

  return (
    <div className={styles.resultPage}>
      <header className={styles.resultHeader}>
        {result.element ? (
          <UiImage name={`orb-${result.element}`} className={styles.resultOrb} />
        ) : null}
        <h1 className={`${styles.resultName} ${units.outline}`}>{result.name}</h1>
      </header>

      <div className={styles.resultTable}>
        <ResultColumn rows={result.left} />
        <ResultColumn rows={result.right} />
      </div>

      <div className={styles.nextLevel}>
        <span className={units.outline}>Next Lv.</span>
        <span className={units.outline}>
          {result.expToNext !== null ? result.expToNext.toLocaleString("en-US") : "MAX"}
        </span>
      </div>
      <div className={`${units.expBar} ${styles.resultExpBar}`} aria-hidden>
        <span style={{ width: `${result.expProgress * 100}%` }} />
      </div>

      {result.successText ? (
        <p className={`${styles.successText} ${units.outline}`} role="status">
          {result.successText}
        </p>
      ) : null}
      {result.levelUp ? <p className={styles.levelUp}>LEVEL UP!!</p> : null}

      <div className={styles.haloStage}>
        <UiImage name="result-halo" className={styles.halo} />
        <Sprite src={result.sprite} name={result.name} className={styles.resultSprite} />
      </div>

      {result.quote ? <p className={styles.quote}>{result.quote}</p> : null}

      <div className={styles.skipRow}>{skip}</div>
    </div>
  );
}

function ResultColumn({ rows }: { rows: FusionResultRow[] }): ReactNode {
  return (
    <dl className={styles.resultColumn}>
      {rows.map((row) => (
        <div key={row.label} className={styles.resultRow}>
          <dt className={units.outline}>{row.label}</dt>
          <dd className={units.outline}>
            <span>{row.before}</span>
            <span className={styles.resultArrow}>
              <span aria-hidden>▶</span>
              <span className={styles.srOnly}> to </span>
            </span>
            <span className={row.rose ? styles.risen : undefined}>{row.after}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Sprite({
  src,
  name,
  className,
}: {
  src: string | null;
  name: string;
  className?: string;
}): ReactNode {
  return src ? (
    <Image
      src={src}
      alt=""
      width={128}
      height={128}
      className={`${squad.sprite} ${className ?? ""}`}
      unoptimized
      draggable={false}
    />
  ) : (
    <span className={`${squad.noSprite} ${units.outline} ${className ?? ""}`}>
      {name.charAt(0)}
    </span>
  );
}
