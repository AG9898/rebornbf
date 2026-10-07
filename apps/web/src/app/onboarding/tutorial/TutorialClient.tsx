"use client";

import type { BattleEvent } from "@bfr/engine";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState, useTransition } from "react";
import { LoadingGlyph } from "../../../components/loading/LoadingGlyph.tsx";
import styles from "../../../components/onboarding/onboarding.module.css";
import {
  advancePrompts,
  INITIAL_PROMPT_PROGRESS,
  promptsDone,
} from "../../../game/tutorial/prompts.ts";
import { TUTORIAL_BATTLE_SPEC, TUTORIAL_PROMPTS } from "../../../game/tutorial/tutorial-battle.ts";
import { finishTutorial } from "./actions.ts";

const PhaserBattle = dynamic(() => import("../../battle/PhaserBattle.tsx"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-black">
      <LoadingGlyph variant="screen" />
    </div>
  ),
});

/** How long the loss panel shows before the tutorial starts again. */
const RESTART_DELAY_MS = 2500;
const REPLAY_EXIT_PATH = "/other";

/**
 * The tutorial battle with its prompts (M3-06E; legacy/ART_GUIDE_BFR.md → Onboarding screens): the battle runs
 * full screen and each prompt docks over the item bar in the onboarding panel style with a Skip
 * button, advancing as `advancePrompts` sees the player perform its action. A loss restarts the
 * battle (a fresh mount at the same seed) and the prompts. Skipping or winning calls
 * `finish_tutorial`, which continues to the starter pick; a replay leaves for `/other` instead.
 */
export function TutorialClient({ replay }: { replay: boolean }): ReactNode {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState(INITIAL_PROMPT_PROGRESS);
  const [ending, setEnding] = useState<"win" | "lose">();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onEvents = useCallback((events: readonly BattleEvent[]) => {
    setProgress((current) => advancePrompts(current, TUTORIAL_PROMPTS, events));
  }, []);
  const onResult = useCallback((result: "win" | "lose") => setEnding(result), []);

  useEffect(() => {
    if (ending !== "lose") return;
    const timer = window.setTimeout(() => {
      setAttempt((n) => n + 1);
      setProgress(INITIAL_PROMPT_PROGRESS);
      setEnding(undefined);
    }, RESTART_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [ending]);

  const finish = (): void => {
    if (replay) {
      router.push(REPLAY_EXIT_PATH);
      return;
    }
    setError(null);
    startTransition(async () => {
      // On success the action redirects to the starter pick and never returns.
      const problem = await finishTutorial();
      if (problem) setError(problem);
    });
  };

  const prompt =
    progress.shown && !promptsDone(progress, TUTORIAL_PROMPTS.length)
      ? TUTORIAL_PROMPTS[progress.index]
      : undefined;
  const errorLine = error ? (
    <p className={styles.error} role="alert">
      {error}
    </p>
  ) : null;

  let overlay: ReactNode = null;
  if (ending === "win") {
    overlay = (
      <div className={styles.endDock}>
        <section className={styles.panel} aria-labelledby="tutorial-end-title">
          <h1 id="tutorial-end-title" className={styles.panelTitle}>
            Training complete
          </h1>
          <p className={styles.promptText}>
            {replay
              ? "That's the basics, refreshed."
              : "You know the basics. Now pick your first unit."}
          </p>
          {errorLine}
          <div className={styles.actions}>
            <button type="button" className={styles.button} onClick={finish} disabled={pending}>
              {pending ? <LoadingGlyph /> : replay ? "Back" : "Continue"}
            </button>
          </div>
        </section>
      </div>
    );
  } else if (ending === "lose") {
    overlay = (
      <div className={styles.endDock}>
        <section className={styles.panel} aria-labelledby="tutorial-end-title" role="status">
          <h1 id="tutorial-end-title" className={styles.panelTitle}>
            Defeated
          </h1>
          <p className={styles.promptText}>Your squad fell. The training starts again…</p>
        </section>
      </div>
    );
  } else if (prompt) {
    overlay = (
      <div className={styles.promptDock}>
        <section
          className={`${styles.panel} ${styles.prompt}`}
          aria-labelledby="tutorial-prompt-title"
          aria-live="polite"
        >
          <div className={styles.promptHead}>
            <h1 id="tutorial-prompt-title" className={`${styles.panelTitle} ${styles.promptTitle}`}>
              {prompt.title}
            </h1>
            <span className={styles.promptCount}>
              {progress.index + 1}/{TUTORIAL_PROMPTS.length}
            </span>
            <button
              type="button"
              className={`${styles.buttonSecondary} ${styles.buttonSmall}`}
              onClick={finish}
              disabled={pending}
            >
              Skip
            </button>
          </div>
          <p className={styles.promptText}>{prompt.body}</p>
          {errorLine}
        </section>
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-[#06080f]">
      <PhaserBattle
        key={attempt}
        spec={TUTORIAL_BATTLE_SPEC}
        onEvents={onEvents}
        onResult={onResult}
      >
        {overlay}
      </PhaserBattle>
    </main>
  );
}
