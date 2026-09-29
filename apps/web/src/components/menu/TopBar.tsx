import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./menu.module.css";
import { UiImage } from "./UiImage.tsx";

/**
 * Status bar. Name, progress, and currencies are placeholders until the player's profile and
 * wallet are read in M3; the name plate opens the account page.
 */
export function TopBar(): ReactNode {
  return (
    <header className={styles.topBar}>
      <Link href="/account" className={`${styles.namePlate} ${styles.outlined}`}>
        Summoner
      </Link>
      <div className={styles.progress} role="presentation">
        <div className={styles.progressFill} style={{ width: "0%" }} />
      </div>
      <UiImage name="top-crest" className={styles.crest} priority />
      <p className={styles.currency} style={{ top: "calc(var(--u) * 11)" }}>
        <UiImage name="icon-gem" alt="Gems" />
        <span className={styles.outlined}>0</span>
      </p>
      <p className={styles.currency} style={{ top: "calc(var(--u) * 54)" }}>
        <UiImage name="icon-zel" alt="Zel" />
        <span className={styles.outlined}>0</span>
      </p>
    </header>
  );
}
