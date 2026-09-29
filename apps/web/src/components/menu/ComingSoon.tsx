import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./menu.module.css";

/** Filler page for a menu section that is not built yet. */
export function ComingSoon({ title, note }: { title: string; note: string }): ReactNode {
  return (
    <div className={styles.placeholder}>
      <section className={styles.panel}>
        <h1 className={`${styles.panelTitle} ${styles.gold}`}>{title}</h1>
        <p className={styles.panelText}>{note}</p>
        <Link href="/home" className={styles.panelLink}>
          Back to Home
        </Link>
      </section>
    </div>
  );
}
