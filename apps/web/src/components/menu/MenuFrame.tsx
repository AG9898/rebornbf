import type { ReactNode } from "react";
import styles from "./menu.module.css";
import { NavBar } from "./NavBar.tsx";
import { TopBar } from "./TopBar.tsx";

/** The portrait menu column: status bar, the page, and the bottom navigation. */
export function MenuFrame({
  children,
  playerName,
}: {
  children: ReactNode;
  /** The signed-in player's display name for the status bar; null shows the placeholder. */
  playerName?: string | null;
}): ReactNode {
  return (
    <div className={styles.backdrop}>
      <div className={styles.frame}>
        <div className={styles.screen}>
          <TopBar playerName={playerName} />
          <main className={styles.main}>{children}</main>
          <NavBar />
        </div>
      </div>
    </div>
  );
}
