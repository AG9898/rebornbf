import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { StageList } from "../../../components/quests/StageList.tsx";
import {
  clearedStageIds,
  QUEST_PROGRESS_COLUMNS,
  type QuestProgressRow,
} from "../../../lib/quests/quest-map.ts";
import { buildTrialList } from "../../../lib/quests/trials.ts";
import { SIGN_IN_PATH } from "../../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";
import quests from "../quests/quests.module.css";

export const metadata: Metadata = { title: "Trials · BFR" };

/**
 * The Trials page (M6-01A_1): every trial with its state from the signed-in player's
 * `quest_progress` rows (read under RLS). A trial opens on its gate story stage's first clear, and
 * an open or cleared trial opens Reinforcement and Begin Quest before `start_battle` re-checks
 * the gate. Reuses the story/dungeon stage panels and navigation. No continues (RESOLVED-17).
 */
export default async function TrialsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}): Promise<ReactNode> {
  const { error: startError } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const userId = claims?.claims.sub;

  let rows: QuestProgressRow[] = [];
  let loadFailed = false;
  if (supabase && userId) {
    const { data, error } = await supabase
      .from("quest_progress")
      .select(QUEST_PROGRESS_COLUMNS)
      .eq("user_id", userId)
      .overrideTypes<QuestProgressRow[], { merge: false }>();
    if (error) loadFailed = true;
    rows = data ?? [];
  }

  const trials = buildTrialList(clearedStageIds(rows));

  return (
    <StageList
      title="Trials"
      backHref="/home"
      stages={trials}
      playable={Boolean(userId) && !loadFailed}
    >
      <p className={quests.notice}>
        Hard bosses outside the story. Each trial opens when its chapter is cleared. No continues.
      </p>
      {!userId ? (
        <p className={quests.notice}>
          <Link href={`${SIGN_IN_PATH}?next=/trials`}>Sign in</Link> to take on the trials.
        </p>
      ) : loadFailed ? (
        <p className={quests.notice} role="alert">
          Your progress could not be loaded. Try again shortly.
        </p>
      ) : null}
      {typeof startError === "string" ? (
        <p className={quests.notice} role="alert">
          {startError.slice(0, 200)}
        </p>
      ) : null}
    </StageList>
  );
}
