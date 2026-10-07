"use client";

import { createBattle } from "@bfr/engine";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { LoadingGlyph } from "../../components/loading/LoadingGlyph.tsx";
import { stageBackground, stageEnemyArt } from "../../game/assets/stage-art.ts";
import type { BattleSpec } from "../../game/playback/battle-scene.ts";
import { stageBossWaves } from "../../game/playback/cues.ts";
import { stageNames } from "../../game/playback/stage-names.ts";
import { questReturn } from "../../lib/battle/result-screen.ts";
import type { SessionBattle } from "../../lib/battle/session-battle.ts";

const PhaserBattle = dynamic(() => import("./PhaserBattle.tsx"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-black">
      <LoadingGlyph variant="screen" />
    </div>
  ),
});

/** A session battle (M3-04B): the session's stage and squad, one run on the server-issued seed. */
function sessionSpec(battle: SessionBattle): BattleSpec {
  return {
    title: battle.stage.name.toUpperCase(),
    create: (seed) => createBattle(battle.setup, seed),
    partyArt: battle.partyArt,
    partyArtForms: battle.partyArtForms,
    ...(battle.reserveArt.length > 0 ? { reserveArt: battle.reserveArt } : {}),
    bossWaves: stageBossWaves(battle.stage),
    names: stageNames(battle.stage),
    background: stageBackground(battle.stage),
    enemyWaves: stageEnemyArt(battle.stage),
    seed: battle.seed,
    singleRun: true,
  };
}

/** The player's saved presentation settings the scene applies (M7-01_2, volumes M7-01_4). */
export type BattlePreferences = Pick<BattleSpec, "initialSpeed" | "reducedMotion" | "volume">;

/**
 * Plays the session's `battle` with the player's saved default speed, reduced-motion setting, and
 * music/SFX volumes. Spark assist is not here: it is part of the session's engine setup, so the
 * server replay uses the same value.
 */
export default function BattleClient({
  battle,
  sessionId,
  preferences,
}: {
  battle: SessionBattle;
  sessionId: string;
  preferences?: BattlePreferences;
}): ReactNode {
  const speed = preferences?.initialSpeed;
  const reducedMotion = preferences?.reducedMotion;
  const music = preferences?.volume?.music;
  const sfx = preferences?.volume?.sfx;
  const spec = useMemo(
    (): BattleSpec => ({
      ...sessionSpec(battle),
      ...(speed ? { initialSpeed: speed } : {}),
      ...(reducedMotion ? { reducedMotion } : {}),
      ...(music !== undefined && sfx !== undefined ? { volume: { music, sfx } } : {}),
    }),
    [battle, speed, reducedMotion, music, sfx],
  );
  const stage = battle.stage;
  const back = questReturn(stage);
  return <PhaserBattle spec={spec} sessionId={sessionId} stage={stage} back={back} />;
}
