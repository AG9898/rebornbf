"use client";

import type { BattleEvent } from "@bfr/engine";
import Link from "next/link";
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
import styles from "./battle.module.css";

/**
 * Mounts the battle scene for `spec`; the parent keeps `spec` stable for the page's lifetime.
 * `onEvents` and `onResult` let a client-only battle (the tutorial) follow the fight; `fullScreen`
 * drops the page header's height, and `children` draw over the canvas in a layer sized to it (a
 * size container, so they can use `cqw`/`cqh`).
 */
export default function PhaserBattle({
  spec,
  sessionId,
  onEvents,
  onResult,
  fullScreen = false,
  children,
}: {
  spec: BattleSpec;
  sessionId?: string;
  onEvents?: (events: readonly BattleEvent[]) => void;
  onResult?: (result: "win" | "lose") => void;
  fullScreen?: boolean;
  children?: ReactNode;
}): ReactNode {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [ending, setEnding] = useState<"pending" | "lost" | Submission>();
  const submitted = useRef<string | undefined>(undefined);
  // Read through refs so new callbacks never remount the game.
  const callbacks = useRef({ onEvents, onResult });
  useEffect(() => {
    callbacks.current = { onEvents, onResult };
  });

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    const bridge: BattleBridge = {
      onReady: () => setReady(true),
      onEvents: (events) => callbacks.current.onEvents?.(events),
      onComplete: (result, log) => {
        callbacks.current.onResult?.(result);
        if (!sessionId) return;
        if (result === "lose") {
          setEnding("lost");
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

  const endingText =
    ending === "lost"
      ? "Battle lost. No rewards were claimed."
      : ending === "pending"
        ? "Verifying battle…"
        : ending?.ok
          ? `Verified win in ${ending.turns} turns · ${ending.rewards.gems} gems · ${ending.rewards.zel} Zel${ending.rewards.first_clear ? " · First clear!" : ""}`
          : ending?.error;

  return (
    <section
      ref={stageRef}
      aria-label="Battle scene"
      className={`relative flex min-h-[320px] ${fullScreen ? "h-dvh" : "h-[calc(100dvh-3rem)]"} w-full items-center justify-center overflow-hidden`}
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
        {children && <div className={styles.overlay}>{children}</div>}
        {sessionId && ending && (
          <div
            className="absolute inset-x-[5%] top-[55%] z-10 flex flex-col items-center gap-3 rounded-lg bg-[#0e1326]/95 p-3 text-center text-[clamp(11px,2.4vw,18px)] text-[#e8e6f0]"
            role="status"
            aria-live="polite"
          >
            <p>{endingText}</p>
            <Link href="/quests" className="font-semibold text-amber-200 underline">
              Back to quest map
            </Link>
          </div>
        )}
      </div>
      <span className="sr-only" role="status">
        {ready ? "Battle scene ready" : "Loading battle scene"}
      </span>
    </section>
  );
}
