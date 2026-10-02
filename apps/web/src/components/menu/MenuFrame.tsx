import type { ReactNode } from "react";
import { MenuMusic } from "./MenuMusic.tsx";
import styles from "./menu.module.css";
import { NavBar } from "./NavBar.tsx";
import { TopBar } from "./TopBar.tsx";
import { WalletGemsProvider } from "./WalletGems.tsx";

/** The portrait menu column: status bar, the page, and the bottom navigation. */
export function MenuFrame({
  children,
  playerName,
  wallet,
}: {
  children: ReactNode;
  /** The signed-in player's display name for the status bar; null shows the placeholder. */
  playerName?: string | null;
  /** The player's wallet for the status bar; null (signed out or unread) shows 0. */
  wallet?: { gems: number; zel: number } | null;
}): ReactNode {
  return (
    <div className={styles.backdrop}>
      <div className={styles.frame}>
        <MenuMusic />
        <WalletGemsProvider initialGems={wallet?.gems ?? null}>
          <div className={styles.screen}>
            <TopBar playerName={playerName} zel={wallet?.zel ?? null} />
            <main className={styles.main}>{children}</main>
            <NavBar />
          </div>
        </WalletGemsProvider>
      </div>
    </div>
  );
}
