import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./menu.module.css";
import { UiImage } from "./UiImage.tsx";

/** The name plate's text when the player is signed out or has no display name. */
export const PLACEHOLDER_NAME = "Summoner";

/**
 * Status bar. The name plate shows the player's display name (set on the onboarding name step)
 * and opens the account page; progress and currencies are placeholders until the wallet is read.
 */
export function TopBar({ playerName }: { playerName?: string | null }): ReactNode {
  return (
    <header className={styles.topBar}>
      <Link href="/account" className={`${styles.namePlate} ${styles.outlined}`}>
        <span className={styles.nameText}>{playerName ?? PLACEHOLDER_NAME}</span>
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
