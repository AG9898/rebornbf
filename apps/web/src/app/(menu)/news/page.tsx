import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import kit from "../../../components/menu/kit.module.css";
import { OriginalImage } from "../../../components/menu/OriginalImage.tsx";
import {
  NEWS_PIECES,
  NOTICE_BADGES,
  NOTICE_LABELS,
  NOTICES,
  newsCloseHref,
  noticeDate,
  noticeHref,
} from "../../../lib/news/news.ts";
import { NewsWindow } from "./NewsWindow.tsx";
import styles from "./news.module.css";

export const metadata: Metadata = { title: "Info · BFR" };

/**
 * Info / News, behind Home's Info and the Menu's News buttons (M8-13, RESOLVED-98; ART_GUIDE ->
 * UI -> Info / News): BFR's notices as cells in the original's Announcements window, at the
 * positions in art/original/layouts/news.json. Each cell opens its notice; Close returns to the
 * screen that opened the window (`?from=menu` for the Menu). Reads no rows.
 */
export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}): Promise<ReactNode> {
  const raw = (await searchParams).from;
  const from = typeof raw === "string" ? raw : undefined;
  return (
    <NewsWindow closeHref={newsCloseHref(from)}>
      {NOTICES.length === 0 ? (
        <p className={`${styles.empty} ${kit.text}`}>There are no announcements.</p>
      ) : (
        <ul className={styles.list}>
          {NOTICES.map((notice) => (
            <li key={notice.id}>
              <Link href={noticeHref(notice.id, from)} className={styles.cell}>
                <OriginalImage asset={NEWS_PIECES.cellTop} className={styles.cellTop} />
                <OriginalImage asset={NEWS_PIECES.foot} className={styles.cellFoot} />
                <OriginalImage
                  asset={NOTICE_BADGES[notice.kind]}
                  alt={NOTICE_LABELS[notice.kind]}
                  className={styles.badge}
                />
                <span className={`${styles.cellTitle} ${kit.text}`}>{notice.title}</span>
                <span className={`${styles.cellDate} ${kit.text}`}>
                  <time dateTime={notice.date}>{noticeDate(notice.date)}</time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </NewsWindow>
  );
}
