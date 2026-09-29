import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "../../../components/menu/menu.module.css";
import {
  buildQuestMap,
  clearedStageIds,
  QUEST_PROGRESS_COLUMNS,
  type QuestProgressRow,
  type StageState,
} from "../../../lib/quests/quest-map.ts";
import { SIGN_IN_PATH } from "../../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";
import { startStage } from "./actions.ts";
import quests from "./quests.module.css";

export const metadata: Metadata = { title: "Quest · BFR" };

const STATE_LABELS: Readonly<Record<StageState, string>> = {
  cleared: "Cleared",
  open: "Open",
  locked: "Locked",
};

/**
 * The quest map (M3-04A): the story chapters and their stages, with clear state from the signed-in
 * player's `quest_progress` rows (read with their session, so RLS returns only their own). Signed-out
 * visitors see the map with nothing cleared. A signed-in player starts an open or cleared stage
 * through `start_battle` (M3-04B), which issues the battle session the battle page plays.
 */
export default async function QuestsPage({
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

  const chapters = buildQuestMap(clearedStageIds(rows));

  return (
    <div className={quests.page}>
      <header className={quests.header}>
        <h1 className={`${quests.title} ${styles.gold}`}>Quest</h1>
        <Link href="/battle" className={quests.demo}>
          Demo battle
        </Link>
      </header>

      {!userId ? (
        <p className={quests.notice}>
          <Link href={`${SIGN_IN_PATH}?next=/quests`}>Sign in</Link> to track your progress.
        </p>
      ) : loadFailed ? (
        <p className={quests.notice}>Your progress could not be loaded. Try again shortly.</p>
      ) : null}
      {typeof startError === "string" ? (
        <p className={quests.notice} role="alert">
          {startError.slice(0, 200)}
        </p>
      ) : null}

      {chapters.map((chapter) => (
        <section
          key={chapter.number}
          className={quests.chapter}
          aria-labelledby={`ch-${chapter.number}`}
        >
          <h2 id={`ch-${chapter.number}`} className={quests.chapterTitle}>
            <span className={styles.gold}>Chapter {chapter.number}</span> {chapter.title}
            <span className={quests.chapterCount}>
              {chapter.cleared}/{chapter.stages.length}
            </span>
          </h2>
          <ol className={quests.stages}>
            {chapter.stages.map((stage) => (
              <li key={stage.id} className={quests.stage} data-state={stage.state}>
                <span className={quests.stageNumber}>{stage.number}</span>
                <span className={quests.stageBody}>
                  <span className={quests.stageName}>
                    {stage.name}
                    {stage.boss ? <span className={quests.boss}>Boss</span> : null}
                  </span>
                  {stage.state === "locked" ? null : (
                    <span className={quests.stageText}>{stage.text}</span>
                  )}
                </span>
                <span className={quests.stageState}>
                  {STATE_LABELS[stage.state]}
                  {stage.state !== "cleared" && stage.firstClearGems > 0 ? (
                    <span className={quests.gems}>{stage.firstClearGems} gems</span>
                  ) : null}
                  {userId && stage.state !== "locked" ? (
                    <form action={startStage.bind(null, stage.id)}>
                      <button type="submit" className={quests.start}>
                        Battle
                      </button>
                    </form>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
