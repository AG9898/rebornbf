"use client";

import { createBattle } from "@bfr/engine";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { stageBackground, stageEnemyArt } from "../../game/assets/stage-art.ts";
import type { BattleSpec } from "../../game/playback/battle-scene.ts";
import { stageBossWaves } from "../../game/playback/cues.ts";
import { DEMO_BATTLE_SPEC } from "../../game/playback/demo-battle.ts";
import type { SessionBattle } from "../../lib/battle/session-battle.ts";

const PhaserBattle = dynamic(() => import("./PhaserBattle.tsx"), {
  ssr: false,
  loading: () => <p className="m-auto text-sm">Loading battle scene…</p>,
});

/** A session battle (M3-04B): the session's stage and squad, one run on the server-issued seed. */
function sessionSpec(battle: SessionBattle): BattleSpec {
  return {
    title: battle.stage.name.toUpperCase(),
    create: (seed) => createBattle(battle.setup, seed),
    partyArt: battle.partyArt,
    partyArtForms: battle.partyArtForms,
    bossWaves: stageBossWaves(battle.stage),
    background: stageBackground(battle.stage),
    enemyWaves: stageEnemyArt(battle.stage),
    seed: battle.seed,
    singleRun: true,
  };
}

/** Plays `battle` when the page started from a session, else the offline demo. */
export default function BattleClient({
  battle,
  sessionId,
}: {
  battle?: SessionBattle;
  sessionId?: string;
}): ReactNode {
  const spec = useMemo(() => (battle ? sessionSpec(battle) : DEMO_BATTLE_SPEC), [battle]);
  return <PhaserBattle spec={spec} sessionId={sessionId} />;
}
