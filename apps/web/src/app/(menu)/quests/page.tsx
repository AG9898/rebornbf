import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "../../../components/menu/menu.module.css";
import { SIGN_IN_PATH } from "../../../lib/supabase/routes.ts";
import { questProgress } from "../../../server/quest-progress.ts";
import quests from "./quests.module.css";

export const metadata: Metadata = { title: "Quest · BFR" };

export default async function QuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}): Promise<ReactNode> {
  const { error } = await searchParams;
  const { chapters, signedIn, failed } = await questProgress();
  return (
    <div className={quests.page}>
      <header className={quests.header}>
        <h1 className={`${quests.title} ${styles.gold}`}>Quest</h1>
        <Link href="/battle" className={quests.demo}>
          Demo battle
        </Link>
      </header>
      {!signedIn ? (
        <p className={quests.notice}>
          <Link href={`${SIGN_IN_PATH}?next=/quests`}>Sign in</Link> to track your progress.
        </p>
      ) : failed ? (
        <p className={quests.notice} role="alert">
          Your progress could not be loaded. Try again shortly.
        </p>
      ) : null}
      {typeof error === "string" ? (
        <p className={quests.notice} role="alert">
          {error.slice(0, 200)}
        </p>
      ) : null}
      <ol className={quests.chapters}>
        {chapters.map((chapter) => (
          <li key={chapter.number}>
            <Link href={`/quests/${chapter.number}`} className={quests.chapter}>
              <span className={styles.gold}>Chapter {chapter.number}</span>
              <strong>{chapter.title}</strong>
              <span>
                {chapter.cleared}/{chapter.stages.length} cleared
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
