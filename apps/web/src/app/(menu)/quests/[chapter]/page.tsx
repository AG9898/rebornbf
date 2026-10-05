import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { StageList } from "../../../../components/quests/StageList.tsx";
import { CHAPTER_TITLES } from "../../../../lib/quests/quest-map.ts";
import { REGION_MAPS } from "../../../../lib/quests/region-maps.ts";
import { SIGN_IN_PATH } from "../../../../lib/supabase/routes.ts";
import { questProgress } from "../../../../server/quest-progress.ts";
import styles from "../quests.module.css";

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ chapter: string }>;
}): Promise<ReactNode> {
  const { chapter: chapterId } = await params;
  if (!Object.hasOwn(CHAPTER_TITLES, chapterId)) notFound();
  const { chapters, signedIn, failed } = await questProgress();
  const chapter = chapters.find((entry) => String(entry.number) === chapterId);
  if (!chapter) notFound();
  return (
    <StageList
      title={chapter.title}
      backHref="/quests"
      stages={chapter.stages}
      playable={signedIn && !failed}
      mapSrc={
        REGION_MAPS.find((map) => map.areas.some((area) => area.chapter === chapter.number))?.src
      }
    >
      {!signedIn ? (
        <p className={styles.notice}>
          <Link href={`${SIGN_IN_PATH}?next=/quests/${chapterId}`}>Sign in</Link> to begin a quest
          and track your progress.
        </p>
      ) : failed ? (
        <p className={styles.notice} role="alert">
          Your progress could not be loaded. Try again shortly.
        </p>
      ) : null}
    </StageList>
  );
}
