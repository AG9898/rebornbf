import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import menu from "../../../components/menu/menu.module.css";
import { textBoxStyle } from "../../../components/menu/text-box.ts";
import { UiImage } from "../../../components/menu/UiImage.tsx";
import { UNIT_HUB_BUTTONS, type UnitHubButton } from "../../../lib/units/unit-hub.ts";
import styles from "./units.module.css";

export const metadata: Metadata = { title: "Unit · BFR" };

/**
 * The Unit hub, the original's Unit menu (M4-06B, RESOLVED-80; ART_GUIDE → UI → Unit hub): title
 * bar with Back and the "Unit" title plate, a 2×3 grid of `btn-hub` buttons over `bg-olive`, and
 * the help ticker. All Units lives at `/units/list`; Equip Sphere opens it with `?pick=sphere`
 * (M4-06J). Sell Unit stays disabled until its screen exists (M4-06I). Protected by `src/proxy.ts`; it reads no rows.
 */
export default function UnitHubPage(): ReactNode {
  return (
    <div className={styles.listPage}>
      <header className={styles.titleBar}>
        <Link href="/home" className={`${styles.pill} ${styles.backButton}`}>
          <span className={styles.outline}>Back</span>
        </Link>
        <div className={styles.titlePlate}>
          <UiImage name="title-plate" className={styles.titlePlateArt} />
          <div className={styles.titleText} style={textBoxStyle("title-plate")}>
            <h1 className={styles.outline}>Unit</h1>
          </div>
        </div>
      </header>

      <nav aria-label="Unit menu" className={styles.hubGrid}>
        {UNIT_HUB_BUTTONS.map((button) => (
          <HubButton key={button.label} button={button} />
        ))}
      </nav>

      <p className={menu.ticker}>Select a Unit Menu</p>
    </div>
  );
}

/** One `btn-hub` button, its label fitted in the piece's text box; no href renders it disabled. */
function HubButton({ button }: { button: UnitHubButton }): ReactNode {
  const face = (
    <>
      <UiImage name="btn-hub" className={styles.hubButtonArt} />
      <span className={`${styles.hubButtonText} ${styles.outline}`} style={textBoxStyle("btn-hub")}>
        {button.label}
      </span>
    </>
  );
  return button.href ? (
    <Link href={button.href} className={styles.hubButton}>
      {face}
    </Link>
  ) : (
    <span className={styles.hubButton} aria-disabled="true" title="Coming soon">
      {face}
    </span>
  );
}
