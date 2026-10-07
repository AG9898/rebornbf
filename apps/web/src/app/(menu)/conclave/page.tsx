import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { textBoxStyle } from "../../../components/menu/text-box.ts";
import { UiImage } from "../../../components/menu/UiImage.tsx";
import { UI_ASSETS } from "../../../components/menu/ui-assets.ts";
import region from "../../../components/quests/region-map.module.css";
import { TRIALS_LAB_PATH } from "../../../lib/quests/trials.ts";
import { SIGN_IN_PATH } from "../../../lib/supabase/routes.ts";
import { trialProgress } from "../../../server/quest-progress.ts";
import quests from "../quests/quests.module.css";
import styles from "./conclave.module.css";

export const metadata: Metadata = { title: "Conclave · BFR" };

/** ui.json `bg-conclave` `anchors.proving-lab`, in master px: the Proving Lab's copper-green dome. */
const PROVING_LAB_ANCHOR = { x: 125, y: 560 } as const;

/** The plate's count tab, as on the region map's area plates (legacy/ART_GUIDE_BFR.md → Region map). */
const AREA_TAB_STYLE: CSSProperties = (() => {
  const { width, height } = UI_ASSETS["area-plate"];
  const pct = (value: number, of: number) => `${((value / of) * 100).toFixed(3)}%`;
  return {
    left: pct(210, width),
    top: pct(95, height),
    width: pct(180, width),
    height: pct(35, height),
  };
})();

/**
 * The Brightmere Conclave (M6-01G, RESOLVED-95): Home's Conclave slide lands here. The city map
 * fills the screen between the status bar and nav, with one area plate on the Proving Lab's dome
 * (NEW AREA until Trial 1's first clear) that opens the lab's trial list.
 */
export default async function ConclavePage(): Promise<ReactNode> {
  const { trials, signedIn, failed } = await trialProgress();
  const map = UI_ASSETS["bg-conclave"];
  const cleared = trials.filter((trial) => trial.state === "cleared").length;
  const newArea = !trials.some((trial) => trial.number === 1 && trial.state === "cleared");
  return (
    <div className={styles.conclave} data-backdrop="conclave">
      <UiImage name="bg-conclave" className={region.map} priority />
      <Link href="/home" className={`${region.pill} ${region.back}`}>
        Back
      </Link>
      {!signedIn ? (
        <div className={region.notices}>
          <p className={quests.notice}>
            <Link href={`${SIGN_IN_PATH}?next=/conclave`}>Sign in</Link> to take on the trials.
          </p>
        </div>
      ) : failed ? (
        <div className={region.notices}>
          <p className={quests.notice} role="alert">
            Your progress could not be loaded. Try again shortly.
          </p>
        </div>
      ) : null}
      <ul className={region.areas}>
        <li
          data-area="proving-lab"
          className={region.anchor}
          style={
            {
              "--ax": PROVING_LAB_ANCHOR.x / map.width,
              "--ay": PROVING_LAB_ANCHOR.y / map.height,
            } as CSSProperties
          }
        >
          <Link
            href={TRIALS_LAB_PATH}
            className={region.areaPlate}
            aria-label={`Proving Lab: ${cleared} of ${trials.length} trials cleared${newArea ? ", new area" : ""}`}
          >
            {newArea ? (
              <span className={region.newArea} aria-hidden="true">
                <UiImage name="ribbon-new-area" className={region.art} />
                <span
                  className={`${region.boxText} ${region.newAreaText}`}
                  style={textBoxStyle("ribbon-new-area")}
                >
                  NEW AREA
                </span>
              </span>
            ) : null}
            <UiImage name="area-plate" className={region.art} />
            <span
              className={`${region.boxText} ${region.areaName}`}
              style={textBoxStyle("area-plate")}
              aria-hidden="true"
            >
              Proving Lab
            </span>
            <span
              className={`${region.boxText} ${region.areaCount}`}
              style={AREA_TAB_STYLE}
              aria-hidden="true"
            >
              {cleared}/{trials.length}
            </span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
