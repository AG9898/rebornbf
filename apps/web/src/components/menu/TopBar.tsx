import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./menu.module.css";
import { UiImage } from "./UiImage.tsx";
import { GemCount } from "./WalletGems.tsx";

/** The name plate's text when the player is signed out or has no display name. */
export const PLACEHOLDER_NAME = "Summoner";

/**
 * Status bar. The name plate shows the player's display name (set on the onboarding name step)
 * and opens the account page; the gem and Zel rows show the player's wallet (0 when signed out).
 * The gem count comes from the wallet context so a claim on the page can update it. Progress is a
 * placeholder.
 */
export function TopBar({
  playerName,
  zel,
}: {
  playerName?: string | null;
  zel?: number | null;
}): ReactNode {
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
        <span className={styles.outlined}>
          <GemCount />
        </span>
      </p>
      <p className={styles.currency} style={{ top: "calc(var(--u) * 54)" }}>
        <UiImage name="icon-zel" alt="Zel" />
        <span className={styles.outlined}>{zel ?? 0}</span>
      </p>
    </header>
  );
}
