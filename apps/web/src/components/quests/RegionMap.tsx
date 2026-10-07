import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { RegionAreaPlate } from "../../lib/quests/region-areas.ts";
import type { RegionMap as RegionMapData } from "../../lib/quests/region-maps.ts";
import { textBoxStyle } from "../menu/text-box.ts";
import { UiImage } from "../menu/UiImage.tsx";
import { UI_ASSETS } from "../menu/ui-assets.ts";
import styles from "./region-map.module.css";

/**
 * Measured off the 2x exports (legacy/ART_GUIDE_BFR.md → Region map), as percentages of the piece: the
 * area-plate's small count tab (its inner face, x 204–395, y 93–131; the plate's `textBox` holds
 * the name), and the clear space above region-plate's centre ornament where the region name sits.
 */
const AREA_TAB_BOX = { x: 210, y: 95, width: 180, height: 35 };
const REGION_NAME_BOX = { x: 260, y: 0, width: 600, height: 84 };

function boxStyle(
  piece: "area-plate" | "region-plate",
  box: { x: number; y: number; width: number; height: number },
): CSSProperties {
  const { width, height } = UI_ASSETS[piece];
  const pct = (value: number, of: number) => `${((value / of) * 100).toFixed(3)}%`;
  return {
    left: pct(box.x, width),
    top: pct(box.y, height),
    width: pct(box.width, width),
    height: pct(box.height, height),
  };
}

/**
 * The full-screen region map (M3-04M, RESOLVED-93): the painted map covering the column, a Back
 * pill, the region plate, and a plate on each open area's landmark that opens its quest list.
 * The map is cover-fitted, so plates are placed from the same map size the image is drawn at.
 */
export function RegionMap({
  map,
  plates,
  backHref,
  children,
}: {
  map: RegionMapData;
  plates: readonly RegionAreaPlate[];
  backHref: string;
  /** Notices drawn under the Back pill (sign-in, failed loads, errors). */
  children?: ReactNode;
}): ReactNode {
  return (
    <div
      className={styles.page}
      style={{ "--map-aspect": map.width / map.height } as CSSProperties}
    >
      <Image
        src={map.src}
        width={map.width}
        height={map.height}
        alt=""
        className={styles.map}
        priority
        unoptimized
        draggable={false}
      />
      <Link href={backHref} className={`${styles.pill} ${styles.back}`}>
        Back
      </Link>
      {children ? <div className={styles.notices}>{children}</div> : null}
      <ul className={styles.areas}>
        {plates.map((plate) => (
          <li
            key={plate.id}
            data-area={plate.id}
            className={styles.anchor}
            style={{ "--ax": plate.anchor.x, "--ay": plate.anchor.y } as CSSProperties}
          >
            <Link
              href={plate.href}
              className={styles.areaPlate}
              aria-label={`${plate.title}: ${plate.cleared} of ${plate.total} quests cleared${plate.newArea ? ", new area" : ""}`}
            >
              {plate.newArea ? (
                <span className={styles.newArea} aria-hidden="true">
                  <UiImage name="ribbon-new-area" className={styles.art} />
                  <span
                    className={`${styles.boxText} ${styles.newAreaText}`}
                    style={textBoxStyle("ribbon-new-area")}
                  >
                    NEW AREA
                  </span>
                </span>
              ) : null}
              <UiImage name="area-plate" className={styles.art} />
              <span
                className={`${styles.boxText} ${styles.areaName}`}
                style={textBoxStyle("area-plate")}
                aria-hidden="true"
              >
                {plate.title}
              </span>
              <span
                className={`${styles.boxText} ${styles.areaCount}`}
                style={boxStyle("area-plate", AREA_TAB_BOX)}
                aria-hidden="true"
              >
                {plate.cleared}/{plate.total}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className={styles.regionPlate}>
        <UiImage name="region-plate" className={styles.art} />
        <h1
          className={`${styles.boxText} ${styles.regionName}`}
          style={boxStyle("region-plate", REGION_NAME_BOX)}
        >
          {map.name}
        </h1>
      </div>
    </div>
  );
}
