import Link from "next/link";
import type { ReactNode } from "react";
import { OriginalImage } from "./OriginalImage.tsx";
import styles from "./original-menu.module.css";
import { GemCount } from "./WalletGems.tsx";

/** The name plate's text when the player is signed out or has no display name. */
export const PLACEHOLDER_NAME = "Summoner";

/**
 * The original's header (RESOLVED-98): `header_ui` plate with the EXP and Energy bars showing
 * through its holes. The name opens the account page; gems and Zel show the player's wallet (0
 * when signed out), the gem count from the wallet context so a claim on the page can update it.
 * Level, rank, EXP, energy, karma, and arena orbs have no BFR data yet and stay empty.
 */
export function TopBar({
  playerName,
  zel,
}: {
  playerName?: string | null;
  zel?: number | null;
}): ReactNode {
  return (
    <header className={styles.header}>
      <OriginalImage asset="header/header_ui/bar_bg.png" className={styles.barExp} />
      <OriginalImage asset="header/header_ui/bar_bg.png" className={styles.barEnergy} />
      <OriginalImage asset="header/header_ui/plate.png" className={styles.headerPlate} priority />
      <Link href="/account" className={`${styles.headerName} ${styles.text}`}>
        {playerName ?? PLACEHOLDER_NAME}
      </Link>
      <span className={`${styles.headerValue} ${styles.text} ${styles.gems}`}>
        <GemCount />
      </span>
      <span className={`${styles.headerValue} ${styles.text} ${styles.zel}`}>{zel ?? 0}</span>
    </header>
  );
}
