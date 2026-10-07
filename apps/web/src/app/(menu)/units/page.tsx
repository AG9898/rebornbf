import type { Metadata } from "next";
import type { ReactNode } from "react";
import kit from "../../../components/menu/kit.module.css";
import {
  OriginalLabelButton,
  OriginalTicker,
  OriginalTitleBar,
} from "../../../components/menu/OriginalKit.tsx";
import { UNIT_HUB_BASE, UNIT_HUB_BUTTONS } from "../../../lib/units/unit-hub.ts";
import styles from "./units.module.css";

export const metadata: Metadata = { title: "Unit · BFR" };

/**
 * The Unit hub, the original's Unit menu (M4-06B, M8-03, RESOLVED-98; ART_GUIDE → UI → Unit hub):
 * the kit title bar, a 2×3 grid of `main_l_btn` buttons with the original's label art at the
 * positions in art/original/layouts/unit.json, and the ticker. All Units lives at `/units/list`;
 * Equip Sphere opens it with `?pick=sphere` (M4-06J). Sell Unit stays disabled until its screen
 * exists (M4-06I). Protected by `src/proxy.ts`; it reads no rows.
 */
export default function UnitHubPage(): ReactNode {
  return (
    <div className={kit.page}>
      <OriginalTitleBar title="Unit" />
      <div className={kit.body}>
        <nav aria-label="Unit menu" className={styles.hubBoard}>
          {UNIT_HUB_BUTTONS.map((button, i) => (
            <OriginalLabelButton
              key={button.label}
              base={UNIT_HUB_BASE}
              art={button.art}
              label={button.label}
              href={button.href}
              className={`${styles.hubButton} ${styles[`hubRow${Math.floor(i / 2)}`]} ${styles[`hubCol${i % 2}`]}`}
            />
          ))}
        </nav>
      </div>
      <OriginalTicker>Select a Unit Menu.</OriginalTicker>
    </div>
  );
}
