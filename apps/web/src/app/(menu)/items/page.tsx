import type { Metadata } from "next";
import type { ReactNode } from "react";
import kit from "../../../components/menu/kit.module.css";
import {
  OriginalLabelButton,
  OriginalTicker,
  OriginalTitleBar,
} from "../../../components/menu/OriginalKit.tsx";
import { ITEM_MENU_BASE, ITEM_MENU_BUTTONS } from "../../../lib/items/item-screen.ts";
import styles from "./items.module.css";

export const metadata: Metadata = { title: "Item · BFR" };

/**
 * The Item menu, the original's Items screen under Town (M8-10, RESOLVED-98; ART_GUIDE -> UI ->
 * Items): the town backdrop, the kit title bar, a 2x2 grid of `main_l_btn` buttons with the
 * original's `content/item_top/` labels at the positions in art/original/layouts/items.json, and
 * the ticker. View Items opens All Items (`/items/list`) and Manage Items the loadout screen
 * (`/items/manage`); Sell and Synthesis stay disabled. Reads no rows.
 */
export default function ItemMenuPage(): ReactNode {
  return (
    <div className={`${kit.page} ${styles.town}`}>
      <OriginalTitleBar title="Item" />
      <div className={kit.body}>
        <nav aria-label="Item menu" className={styles.menuBoard}>
          {ITEM_MENU_BUTTONS.map((button, i) => (
            <OriginalLabelButton
              key={button.label}
              base={ITEM_MENU_BASE}
              art={button.art}
              label={button.label}
              href={button.href}
              className={`${styles.menuButton} ${styles[`menuRow${Math.floor(i / 2)}`]} ${styles[`menuCol${i % 2}`]}`}
            />
          ))}
        </nav>
      </div>
      <OriginalTicker>Select an Item Menu.</OriginalTicker>
    </div>
  );
}
