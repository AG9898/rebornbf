import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  BATTLE_SESSION_COLUMNS,
  type BattleSessionRow,
  isBattleSessionId,
  type SessionBattle,
  sessionBattle,
  sessionProblem,
} from "../../lib/battle/session-battle.ts";
import { SIGN_IN_PATH } from "../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../lib/supabase/server.ts";
import { loadPlayerSettings } from "../../server/player-settings.ts";
import BattleClient, { type BattlePreferences } from "./BattleClient.tsx";

export const metadata: Metadata = { title: "Battle · BFR" };

type Loaded = { battle: SessionBattle } | { message: ReactNode };

/**
 * Loads the caller's session under RLS (so another player's session is simply not found) and
 * turns it into the battle to play.
 */
async function loadSession(sessionId: string): Promise<Loaded> {
  const signIn = (
    <>
      <Link href={`${SIGN_IN_PATH}?next=/quests`} className="text-amber-200 underline">
        Sign in
      </Link>{" "}
      to play story battles.
    </>
  );
  if (!isBattleSessionId(sessionId)) return { message: "This battle was not found." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { message: "Story battles are unavailable right now." };
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) return { message: signIn };

  const { data, error } = await supabase
    .from("battle_sessions")
    .select(BATTLE_SESSION_COLUMNS)
    .eq("id", sessionId)
    .overrideTypes<BattleSessionRow[], { merge: false }>();
  if (error) return { message: "This battle could not be loaded. Try again shortly." };
  const row = data?.[0];
  if (!row) return { message: "This battle was not found." };

  const problem = sessionProblem(row, new Date());
  if (problem) return { message: problem };
  const result = sessionBattle(row);
  return result.ok ? { battle: result.battle } : { message: result.message };
}

/**
 * The battle route. With `?session=<id>` it plays a story battle issued by `start_battle`
 * (M3-04B): the session's stage, squad snapshot, and server-rolled seed. Without one it plays the
 * offline demo (M2-05B): no sign-in, no rewards; the whole battle runs client-side. Both play at
 * the player's saved default speed and reduced-motion setting (M7-01_2; defaults when signed out).
 * The battle fills the whole screen with no page header; only a load error shows a way back.
 */
export default async function BattlePage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string | string[] }>;
}): Promise<ReactNode> {
  const { session } = await searchParams;
  const sessionId = typeof session === "string" ? session : undefined;
  const [loaded, { settings }] = await Promise.all([
    sessionId ? loadSession(sessionId) : undefined,
    loadPlayerSettings(),
  ]);
  const preferences: BattlePreferences = {
    initialSpeed: settings.battleSpeed,
    reducedMotion: settings.reducedMotion,
  };
  const isTrial = loaded !== undefined && "battle" in loaded && !!loaded.battle.stage.trial;
  const back = !sessionId
    ? { href: "/home", label: "Home" }
    : isTrial
      ? { href: "/trials", label: "Trials" }
      : { href: "/quests", label: "Quest" };

  return (
    <main className="flex min-h-dvh flex-col bg-[#0b0d17] text-[#e8e6f0]">
      {loaded === undefined ? (
        <BattleClient preferences={preferences} />
      ) : "battle" in loaded ? (
        <BattleClient battle={loaded.battle} sessionId={sessionId} preferences={preferences} />
      ) : (
        <div role="alert" className="m-auto flex max-w-sm flex-col gap-3 px-4 text-center text-sm">
          <p>{loaded.message}</p>
          <Link href={back.href} className="text-xs font-semibold text-amber-200 hover:underline">
            {back.label}
          </Link>
        </div>
      )}
    </main>
  );
}
