import Link from "next/link";
import type { ReactNode } from "react";
import type { StageState } from "../../lib/quests/quest-map.ts";
import styles from "./stage-list.module.css";

export type StageListEntry = {
  id: string;
  name: string;
  text: string;
  waves: number;
  state: StageState;
  leftToday?: number;
};

/** Shared story/dungeon presentation; unlock and daily-limit authority stays on the server. */
export function StageList({
  title,
  backHref,
  stages,
  playable,
  children,
}: {
  title: string;
  backHref: string;
  stages: readonly StageListEntry[];
  playable: boolean;
  children?: ReactNode;
}): ReactNode {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href={backHref}>Back</Link>
        <h1>{title}</h1>
        <Link href="/home">Home</Link>
      </header>
      {children}
      <ol className={styles.stages}>
        {stages.map((stage) => {
          const available = playable && stage.state !== "locked" && stage.leftToday !== 0;
          const content = (
            <>
              <span className={styles.ribbon}>
                {stage.state === "cleared" ? "CLEAR" : stage.state === "open" ? "NEW" : "Locked"}
              </span>
              <strong className={styles.name}>{stage.name}</strong>
              <span className={styles.details}>
                {stage.waves} {stage.waves === 1 ? "wave" : "waves"}
                {stage.leftToday !== undefined ? <span>Left {stage.leftToday} today</span> : null}
              </span>
              <span className={styles.flavour}>{stage.text}</span>
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
            </li>
          );
        })}
      </ol>
    </div>
  );
}
