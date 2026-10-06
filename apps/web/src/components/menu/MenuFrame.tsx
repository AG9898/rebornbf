import type { ReactNode } from "react";
import { NavPending } from "../loading/NavPending.tsx";
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
  volume,
}: {
  children: ReactNode;
  /** The signed-in player's display name for the status bar; null shows the placeholder. */
  playerName?: string | null;
  /** The player's wallet for the status bar; null (signed out or unread) shows 0. */
  wallet?: { gems: number; zel: number } | null;
  /** The player's saved music and SFX levels (0–1); null keeps the audio defaults. */
  volume?: { music: number; sfx: number } | null;
}): ReactNode {
  return (
    <div className={styles.backdrop}>
      <div className={styles.frame}>
        <MenuMusic volume={volume ?? null} />
        <WalletGemsProvider initialGems={wallet?.gems ?? null}>
          <div className={styles.screen}>
            <TopBar playerName={playerName} zel={wallet?.zel ?? null} />
            <main className={styles.main}>{children}</main>
            <NavBar />
            <NavPending />
          </div>
        </WalletGemsProvider>
      </div>
    </div>
  );
}
