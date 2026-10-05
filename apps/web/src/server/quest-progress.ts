import "server-only";
import {
  buildQuestMap,
  clearedStageIds,
  QUEST_PROGRESS_COLUMNS,
  type QuestChapterView,
  type QuestProgressRow,
} from "../lib/quests/quest-map.ts";
import { buildTrialList, type TrialView } from "../lib/quests/trials.ts";
import { createSupabaseServerClient } from "../lib/supabase/server.ts";

/** The caller's cleared stage IDs under RLS; empty when signed out. */
async function clearedProgress(): Promise<{
  cleared: ReadonlySet<string>;
  signedIn: boolean;
  failed: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const userId = claims?.claims.sub;
  let rows: QuestProgressRow[] = [];
  let failed = false;
  if (supabase && userId) {
    const { data, error } = await supabase
      .from("quest_progress")
      .select(QUEST_PROGRESS_COLUMNS)
      .eq("user_id", userId)
      .overrideTypes<QuestProgressRow[], { merge: false }>();
    failed = Boolean(error);
    rows = data ?? [];
  }
  return { cleared: clearedStageIds(rows), signedIn: Boolean(userId), failed };
}

/** Read only the caller's progress; failed reads must not offer stages as playable. */
export async function questProgress(): Promise<{
  chapters: QuestChapterView[];
  signedIn: boolean;
  failed: boolean;
}> {
  const { cleared, signedIn, failed } = await clearedProgress();
  return { chapters: buildQuestMap(cleared), signedIn, failed };
}

/** The trial list for the Conclave and Proving Lab (M6-01G), gated as `start_battle` gates it. */
export async function trialProgress(): Promise<{
  trials: TrialView[];
  signedIn: boolean;
  failed: boolean;
}> {
  const { cleared, signedIn, failed } = await clearedProgress();
  return { trials: buildTrialList(cleared), signedIn, failed };
}
