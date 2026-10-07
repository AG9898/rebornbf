import type { Metadata } from "next";
import { Fragment, type ReactNode } from "react";
import kit from "../../../components/menu/kit.module.css";
import {
  OriginalButton,
  OriginalTicker,
  OriginalTitleBar,
} from "../../../components/menu/OriginalKit.tsx";
import { REWARD_BUTTONS } from "../../../lib/gifts/gift-screen.ts";
import styles from "./gifts.module.css";

export const metadata: Metadata = { title: "Rewards · BFR" };

/**
 * Rewards, the screen behind Home's Gifts button (M8-12, RESOLVED-98; ART_GUIDE -> UI -> Gifts):
 * the kit title bar and the original's grid of seven `main_s_btn` buttons at the positions in
 * art/original/layouts/gifts.json. Present Box opens `/gifts/presents`; the other rewards have no
 * BFR screen and render disabled. Reads no rows.
 */
export default function RewardsPage(): ReactNode {
  return (
    <div className={kit.page}>
      <OriginalTitleBar title="Rewards" />
      <div className={kit.body}>
        <nav aria-label="Rewards" className={styles.grid}>
          {REWARD_BUTTONS.map((button, i) => (
            <OriginalButton
              key={button.label}
              size="main_s_btn"
              href={button.href}
              className={`${styles.reward} ${styles[`row${Math.floor(i / 3)}`]} ${styles[`col${i % 3}`]}`}
            >
              <span className={button.small ? styles.smallCaption : undefined}>
                {button.lines.map((line, j) => (
                  <Fragment key={line}>
                    {j > 0 ? <br /> : null}
                    {line}
                  </Fragment>
                ))}
              </span>
            </OriginalButton>
          ))}
        </nav>
      </div>
      <OriginalTicker>Select a Reward.</OriginalTicker>
    </div>
  );
}
