import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import kit from "../../../../components/menu/kit.module.css";
import { OriginalImage } from "../../../../components/menu/OriginalImage.tsx";
import {
  NEWS_PIECES,
  NOTICE_BADGES,
  NOTICE_LABELS,
  NOTICES,
  newsListHref,
  noticeById,
  noticeDate,
} from "../../../../lib/news/news.ts";
import { NewsWindow } from "../NewsWindow.tsx";
import styles from "../news.module.css";

export function generateStaticParams(): { id: string }[] {
  return NOTICES.map((notice) => ({ id: notice.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const notice = noticeById((await params).id);
  return { title: `${notice?.title ?? "Info"} · BFR` };
}

/**
 * One notice (M8-13; ART_GUIDE -> UI -> Info / News) in the Announcements window, on
 * `info_list_frame2` cut into head (badge, title, date over its separator), a body slice that
 * stretches to the text, and foot, at the positions in art/original/layouts/news_detail.json.
 * Close returns to the list.
 */
export default async function NoticePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}): Promise<ReactNode> {
  const notice = noticeById((await params).id);
  if (!notice) notFound();
  const raw = (await searchParams).from;
  const from = typeof raw === "string" ? raw : undefined;
  return (
    <NewsWindow closeHref={newsListHref(from)}>
      <article className={styles.notice}>
        <OriginalImage asset={NEWS_PIECES.head} className={styles.noticeHead} />
        <OriginalImage asset={NEWS_PIECES.body} className={styles.noticeBody} />
        <OriginalImage asset={NEWS_PIECES.foot} className={styles.noticeFoot} />
        <OriginalImage
          asset={NOTICE_BADGES[notice.kind]}
          alt={NOTICE_LABELS[notice.kind]}
          className={styles.badge}
        />
        <h2 className={`${styles.noticeTitle} ${kit.text}`}>{notice.title}</h2>
        <p className={`${styles.noticeDate} ${kit.text}`}>
          <time dateTime={notice.date}>{noticeDate(notice.date)}</time>
        </p>
        <div className={styles.noticeText}>
          {notice.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </article>
    </NewsWindow>
  );
}
