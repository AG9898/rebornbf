import "server-only";
import {
  buildQuestMap,
  clearedStageIds,
  QUEST_PROGRESS_COLUMNS,
  type QuestChapterView,
  type QuestProgressRow,
} from "../lib/quests/quest-map.ts";
import { createSupabaseServerClient } from "../lib/supabase/server.ts";

/** Read only the caller's progress; failed reads must not offer stages as playable. */
export async function questProgress(): Promise<{
  chapters: QuestChapterView[];
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
  return { chapters: buildQuestMap(clearedStageIds(rows)), signedIn: Boolean(userId), failed };
}
