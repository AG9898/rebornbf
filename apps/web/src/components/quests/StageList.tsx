import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { StageState } from "../../lib/quests/quest-map.ts";
import { textBoxStyle } from "../menu/text-box.ts";
import { UiImage } from "../menu/UiImage.tsx";
import { UI_ASSETS } from "../menu/ui-assets.ts";
import styles from "./stage-list.module.css";

export type StageListEntry = {
  id: string;
  name: string;
  text: string;
  waves: number;
  state: StageState;
  leftToday?: number;
  /** Dungeon captures and drops; placed below the panel so longer lists stay readable. */
  rewards?: string;
};

/**
 * Measured off the `stage-panel` export (2x px; ART_GUIDE.md → Stage list): its inner face runs
 * x 10–1269, y 30–310 with the divider at y 161–165. The name sits above the divider (clear of
 * the corner ribbon), the flavour below it, and "Left N today" in the stepped right slot
 * (x 969–1240, y 6–36). The wave count uses the piece's `textBox`, the centre slot.
 */
const PANEL_BOXES = {
  name: { x: 40, y: 64, width: 1200, height: 90 },
  flavour: { x: 40, y: 174, width: 1200, height: 124 },
  daily: { x: 974, y: 8, width: 262, height: 26 },
} as const;

function panelBox(box: { x: number; y: number; width: number; height: number }): CSSProperties {
  const { width, height } = UI_ASSETS["stage-panel"];
  const pct = (value: number, of: number) => `${((value / of) * 100).toFixed(3)}%`;
  return {
    left: pct(box.x, width),
    top: pct(box.y, height),
    width: pct(box.width, width),
    height: pct(box.height, height),
  };
}

/**
 * Shared story/dungeon presentation; unlock and daily-limit authority stays on the server. Story
 * areas pass `mapSrc` to draw over their region map darkened (RESOLVED-93); dungeon series keep the
 * vortex backdrop.
 */
export function StageList({
  title,
  backHref,
  stages,
  playable,
  mapSrc,
  children,
}: {
  title: string;
  backHref: string;
  stages: readonly StageListEntry[];
  playable: boolean;
  mapSrc?: string;
  children?: ReactNode;
}): ReactNode {
  return (
    <div
      className={`${styles.page} ${mapSrc ? styles.region : styles.vortex}`}
      data-backdrop={mapSrc ? "region" : "vortex"}
      style={mapSrc ? ({ "--map": `url("${mapSrc}")` } as CSSProperties) : undefined}
    >
      <header className={styles.header}>
        <Link href={backHref} className={`${styles.pill} ${styles.back}`}>
          Back
        </Link>
        <div className={styles.titlePlate}>
          <UiImage name="title-plate" className={styles.art} />
          <h1 className={styles.boxText} style={textBoxStyle("title-plate")}>
            {title}
          </h1>
        </div>
        <Link href="/home" className={`${styles.pill} ${styles.home}`}>
          Home
        </Link>
      </header>
      {children}
      <ol className={styles.stages}>
        {stages.map((stage) => {
          const available = playable && stage.state !== "locked" && stage.leftToday !== 0;
          const ribbon =
            stage.state === "cleared"
              ? "ribbon-clear"
              : stage.state === "open"
                ? "ribbon-new"
                : null;
          const content = (
            <>
              <UiImage name="stage-panel" className={styles.art} />
              {ribbon ? (
                <span className={styles.ribbon}>
                  <UiImage name={ribbon} className={styles.art} />
                  <span className={styles.boxText} style={textBoxStyle(ribbon)}>
                    {ribbon === "ribbon-clear" ? "CLEAR" : "NEW"}
                  </span>
                </span>
              ) : (
                <span className={styles.srOnly}>Locked</span>
              )}
              <span
                className={`${styles.boxText} ${styles.waves}`}
                style={textBoxStyle("stage-panel")}
              >
                {stage.waves} {stage.waves === 1 ? "wave" : "waves"}
              </span>
              {stage.leftToday !== undefined ? (
                <span
                  className={`${styles.boxText} ${styles.daily}`}
                  style={panelBox(PANEL_BOXES.daily)}
                >
                  Left {stage.leftToday} today
                </span>
              ) : null}
              <strong
                className={`${styles.boxText} ${styles.name}`}
                style={panelBox(PANEL_BOXES.name)}
              >
                {stage.name}
              </strong>
              <span className={styles.flavour} style={panelBox(PANEL_BOXES.flavour)}>
                {stage.text}
              </span>
            </>
          );
          return (
            <li key={stage.id} data-state={stage.state} className={styles.stage}>
              {available ? (
                <Link className={styles.panel} href={`/start/${encodeURIComponent(stage.id)}`}>
                  {content}
                </Link>
              ) : (
                <div className={styles.panel} aria-disabled="true">
                  {content}
                </div>
              )}
              {stage.rewards ? <p className={styles.rewards}>{stage.rewards}</p> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
