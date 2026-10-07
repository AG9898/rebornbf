"use client";

import type { Stage } from "@bfr/data";
import type Phaser from "phaser";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { backgroundUrl } from "../../game/assets/stage-art.ts";
import type { BattleBridge } from "../../game/bridge.ts";
import { canvasDisplaySize } from "../../game/bridge.ts";
import { mountBattle } from "../../game/mount-battle.ts";
import type { BattleSpec } from "../../game/playback/battle-scene.ts";
import { type Submission, submitSession } from "../../lib/battle/submit-session.ts";
import { menuFont } from "../../styles/fonts.ts";
import { BattleEnding } from "./BattleEnding.tsx";
import styles from "./battle.module.css";

/**
 * Mounts the battle scene for `spec`; the parent keeps `spec` stable for the page's lifetime.
 * The battle always fills the screen; no page header sits above it.
 */
export default function PhaserBattle({
  spec,
  sessionId,
  stage,
  back = { href: "/quests", label: "Back to quests" },
}: {
  spec: BattleSpec;
  sessionId?: string;
  /** The session's stage: names the quest on the result screen (M2-07H). */
  stage?: Pick<Stage, "name" | "story" | "trial">;
  /** Where the result flow and give-up link back to (the Trials page for a trial). */
  back?: { href: string; label: string };
}): ReactNode {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [ending, setEnding] = useState<"pending" | "lost" | Submission>();
  const [continueAction, setContinueAction] = useState<() => Promise<void>>();
  const [continuing, setContinuing] = useState(false);
  const [continueError, setContinueError] = useState<string>();
  const submitted = useRef<string | undefined>(undefined);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    const bridge: BattleBridge = {
      onReady: () => setReady(true),
      onComplete: (result, log, resume) => {
        if (!sessionId) return;
        if (result === "lose") {
          setEnding("lost");
          setContinueAction(() =>
            resume
              ? async () => {
                  setContinuing(true);
                  setContinueError(undefined);
                  try {
                    const response = await fetch("/api/battles/continue", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ session_id: sessionId, input_log: log }),
                    });
                    const value: unknown = await response.json();
                    if (cancelled) return;
                    if (
                      !response.ok ||
                      typeof value !== "object" ||
                      value === null ||
                      !("ok" in value) ||
                      value.ok !== true
                    ) {
                      setContinueError(
                        typeof value === "object" &&
                          value !== null &&
                          "error" in value &&
                          typeof value.error === "string"
                          ? value.error
                          : "Could not continue. Try again.",
                      );
                      return;
                    }
                    setContinueAction(undefined);
                    setEnding(undefined);
                    resume();
                  } catch {
                    if (!cancelled) setContinueError("Could not reach the server. Try again.");
                  } finally {
                    if (!cancelled) setContinuing(false);
                  }
                }
              : undefined,
          );
          return;
        }
        if (submitted.current === sessionId) return;
        submitted.current = sessionId;
        setEnding("pending");
        void submitSession(sessionId, log).then((verdict) => {
          if (!cancelled) setEnding(verdict);
        });
      },
    };
    let game: Phaser.Game | undefined;
    let cancelled = false;
    const resize = (): void => {
      if (!game) return;
      const size = canvasDisplaySize(
        stage.clientWidth,
        stage.clientHeight,
        window.devicePixelRatio,
      );
      canvas.style.width = `${size.width}px`;
      canvas.style.height = `${size.height}px`;
      game.scale.refresh();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    // Zooming the page changes devicePixelRatio without resizing the stage.
    window.addEventListener("resize", resize);

    // Phaser rasterises text when it is created, so the HUD's Lilita One must be loaded first.
    // `document.fonts.load` fetches the next/font face; on failure the fallback font is used.
    const family = menuFont.style.fontFamily;
    document.fonts
      .load(`20px ${family}`)
      .catch(() => [])
      .then(() => {
        if (cancelled) return;
        game = mountBattle(canvas, bridge, spec, family);
        resize();
      });

    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener("resize", resize);
      game?.destroy(true);
    };
  }, [spec, sessionId]);

  return (
    <section
      ref={stageRef}
      aria-label="Battle scene"
      className={`relative flex min-h-[320px] h-dvh w-full items-center justify-center overflow-hidden`}
    >
      <div
        aria-hidden="true"
        className={styles.backdrop}
        style={
          spec.background
            ? { backgroundImage: `url(${backgroundUrl(spec.background)})` }
            : undefined
        }
      />
      <div
        ref={canvasRef}
        className={`${styles.canvasHost} relative shrink-0 overflow-hidden shadow-[0_0_24px_rgba(0,0,0,0.6)]`}
      >
        {sessionId && stage && ending && (
          <div className={styles.overlay}>
            <BattleEnding
              ending={ending}
              stage={stage}
              back={back}
              continueState={{ action: continueAction, busy: continuing, error: continueError }}
              reducedMotion={spec.reducedMotion ?? false}
            />
          </div>
        )}
      </div>
      <span className="sr-only" role="status">
        {ready ? "Battle scene ready" : "Loading battle scene"}
      </span>
    </section>
  );
}
