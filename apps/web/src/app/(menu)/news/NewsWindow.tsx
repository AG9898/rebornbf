import Link from "next/link";
import type { ReactNode } from "react";
import { OriginalImage } from "../../../components/menu/OriginalImage.tsx";
import { NEWS_PIECES } from "../../../lib/news/news.ts";
import styles from "./news.module.css";

/**
 * The original's Announcements window (M8-13; ART_GUIDE -> UI -> Info / News): a full-screen
 * overlay that dims the header and footer, with `info_web_bg` (title and close X baked in) at
 * screen (0, 88) and `notice_close_btn` over the X. `children` scroll inside the window's panel.
 */
export function NewsWindow({
  closeHref,
  children,
}: {
  closeHref: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div className={styles.overlay}>
      <section className={styles.window} aria-labelledby="news-title">
        <OriginalImage asset={NEWS_PIECES.window} className={styles.windowArt} priority />
        <h1 id="news-title" className={styles.srOnly}>
          Announcements
        </h1>
        <Link href={closeHref} className={styles.close} aria-label="Close">
          <OriginalImage asset={NEWS_PIECES.close} />
        </Link>
        <div className={styles.scroll}>{children}</div>
      </section>
    </div>
  );
}
