"use client";

import Image from "next/image";
import { type ReactNode, useEffect, useState } from "react";
import { OriginalImage } from "../../../components/menu/OriginalImage.tsx";
import { UiImage } from "../../../components/menu/UiImage.tsx";
import type { FusionResultRow, FusionResultView } from "../../../lib/units/fusion-result.ts";
import { FUSION_ASSETS as art } from "../../../lib/units/fusion-screen.ts";
import type { FODDER_SPOTS } from "../../../lib/units/fusion-stage.ts";
import squad from "../squad/squad.module.css";
import units from "../units/units.module.css";
import { FusionButton, FusionGauge } from "./FusionPieces.tsx";
import styles from "./fusion.module.css";
import screen from "./original-fusion.module.css";

/** One fodder pedestal's sprite as it flies into the base. */
export type FlyingFodder = {
  spot: (typeof FODDER_SPOTS)[number];
  name: string;
  sprite: string | null;
};

/** Longest the fly-in may hold the screen if no `animationend` arrives (animations disabled). */
const ANIMATION_FALLBACK_MS = 2500;

/** BFR fly-in retained until SAM playback; original result pieces display the returned outcome. */
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
    <FusionButton
      label="Skip"
      normal={art.skipNormal}
      pressed={art.skipPressed}
      className={screen.skipButton}
      onClick={onSkip}
    />
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
    <div className={screen.resultPage}>
      <header className={screen.resultHeader}>
        {result.element ? (
          <OriginalImage asset={`common/attribute_mark_M/${result.element}.png`} />
        ) : null}
        <h1 className={screen.resultName}>{result.name}</h1>
      </header>
      <div className={screen.resultTable}>
        <OriginalImage asset={art.resultWindow} className={screen.resultWindow} />
        <ResultColumn rows={result.left} />
        <ResultColumn rows={result.right} />
      </div>
      <p className={screen.nextLevel}>
        Next Lv. {result.expToNext?.toLocaleString("en-US") ?? "MAX"}
      </p>
      <FusionGauge progress={result.expProgress} className={screen.resultGauge} />
      {result.successText ? (
        <p className={screen.successText} role="status">
          {result.successText}
        </p>
      ) : null}
      {result.levelUp ? <p className={screen.levelUp}>LEVEL UP!!</p> : null}
      <div className={screen.resultStage}>
        <OriginalImage asset={art.table} className={screen.resultTableArt} />
        {result.sprite ? (
          <Image
            src={result.sprite}
            alt=""
            width={128}
            height={128}
            className={screen.resultSprite}
            unoptimized
            draggable={false}
          />
        ) : null}
      </div>
      {result.quote ? <p className={screen.quote}>{result.quote}</p> : null}
      {skip}
    </div>
  );
}

function ResultColumn({ rows }: { rows: FusionResultRow[] }): ReactNode {
  return (
    <dl className={screen.resultColumn}>
      {rows.map((row) => (
        <div key={row.label} className={screen.resultRow}>
          <dt>{row.label}</dt>
          <dd>
            <span>{row.before}</span>
            <span className={screen.resultArrow}>
              <span aria-hidden>▶</span>
              <span className={styles.srOnly}> to </span>
            </span>
            <span className={row.rose ? screen.risen : undefined}>{row.after}</span>
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
