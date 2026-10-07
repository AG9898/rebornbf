import type { ReactNode } from "react";
import kit from "./kit.module.css";
import styles from "./menu-screen.module.css";
import { MENU_NEWS, MENU_TILES } from "./menu-screen-data.ts";
import { OriginalLabelButton, OriginalTicker, OriginalTitleBar } from "./OriginalKit.tsx";

/** The original's Menu screen (M8-02): title bar with News, the 3x3 grid, ticker. */
export function MenuScreen(): ReactNode {
  return (
    <div className={kit.page}>
      <OriginalTitleBar
        title="Menu"
        action={
          <OriginalLabelButton
            base={MENU_NEWS.base}
            art={MENU_NEWS.art}
            label="News"
            href={MENU_NEWS.href}
            className={styles.news}
          />
        }
      />
      <div className={kit.body}>
        <nav className={styles.board} aria-label="Menu">
          {MENU_TILES.map((tile, i) => (
            <OriginalLabelButton
              key={tile.label}
              base="common/button/main_s_btn"
              art={tile.art}
              label={tile.label}
              href={tile.href}
              className={`${styles.tile} ${styles[`row${Math.floor(i / 3)}`]} ${styles[`col${i % 3}`]}`}
            />
          ))}
        </nav>
      </div>
      <OriginalTicker>Select a Menu.</OriginalTicker>
    </div>
  );
}
