import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "../../../components/menu/menu.module.css";
import {
  clearedStageIds,
  QUEST_PROGRESS_COLUMNS,
  type QuestProgressRow,
  type StageState,
} from "../../../lib/quests/quest-map.ts";
import { buildTrialList } from "../../../lib/quests/trials.ts";
import { SIGN_IN_PATH } from "../../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";
import quests from "../quests/quests.module.css";
import { startTrial } from "./actions.ts";

export const metadata: Metadata = { title: "Trials · BFR" };

const STATE_LABELS: Readonly<Record<StageState, string>> = {
  cleared: "Cleared",
  open: "Open",
  locked: "Locked",
};

/**
 * The Trials page (M6-01A_1): every trial with its state from the signed-in player's
 * `quest_progress` rows (read under RLS). A trial opens on its gate story stage's first clear, and
 * an open or cleared trial starts through `start_battle`, which re-checks the gate. Trials allow no
 * continues (RESOLVED-17).
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
    <div className={quests.page}>
      <header className={quests.header}>
        <h1 className={`${quests.title} ${styles.gold}`}>Trials</h1>
      </header>

      <p className={quests.notice}>
        Hard bosses outside the story. Each trial opens when its chapter is cleared. No continues.
      </p>
      {!userId ? (
        <p className={quests.notice}>
          <Link href={`${SIGN_IN_PATH}?next=/trials`}>Sign in</Link> to take on the trials.
        </p>
      ) : loadFailed ? (
        <p className={quests.notice}>Your progress could not be loaded. Try again shortly.</p>
      ) : null}
      {typeof startError === "string" ? (
        <p className={quests.notice} role="alert">
          {startError.slice(0, 200)}
        </p>
      ) : null}

      <ol className={quests.stages}>
        {trials.map((trial) => (
          <li key={trial.id} className={quests.stage} data-state={trial.state}>
            <span className={quests.stageNumber}>{trial.number}</span>
            <span className={quests.stageBody}>
              <span className={quests.stageName}>
                {trial.name}
                <span className={quests.boss}>Boss</span>
              </span>
              <span className={quests.stageText}>
                {trial.state === "locked"
                  ? `Clear story stage ${trial.gateNumber}, ${trial.gateName}, to open.`
                  : "Read the boss's script: guard its telegraphed attacks and time your bursts."}
              </span>
            </span>
            <span className={quests.stageState}>
              {STATE_LABELS[trial.state]}
              {userId && trial.state !== "locked" ? (
                <form action={startTrial.bind(null, trial.id)}>
                  <button type="submit" className={quests.start}>
                    Battle
                  </button>
                </form>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
