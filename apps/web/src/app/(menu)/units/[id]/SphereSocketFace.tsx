import type { ReactNode } from "react";
import { UiImage } from "../../../../components/menu/UiImage.tsx";
import { UI_ASSETS, type UiAsset } from "../../../../components/menu/ui-assets.ts";
import type { SphereSocketView, SphereView } from "../../../../lib/units/spheres.ts";
import styles from "../units.module.css";

/**
 * One sphere socket (M4-06J; ART_GUIDE → UI → Units, Squad, and Unit detail screens): the
 * `item-slot` piece holding the sphere's icon, then a name plate with the sphere's name and
 * effect summary, "Empty", or "Locked". The caller wraps it in a link or button.
 */
export function SphereSocketFace({ socket }: { socket: SphereSocketView }): ReactNode {
  const empty = socket.unlocked ? "Empty" : "Locked";
  return (
    <>
      <SphereGem sphere={socket.sphere} />
      <span className={styles.spherePlate}>
        <span className={`${styles.sphereName} ${styles.outline}`}>
          {socket.sphere ? socket.sphere.name : empty}
        </span>
        <span className={styles.sphereSummary}>
          {socket.sphere ? socket.sphere.summary : `Sphere slot ${socket.slot}`}
        </span>
      </span>
    </>
  );
}

/** The `item-slot` socket with the sphere's locked icon (M6-10A), or its initial when the sphere
 * has no icon yet; empty when no sphere sits in it. */
export function SphereGem({ sphere }: { sphere: SphereView | null }): ReactNode {
  const icon = sphere ? sphereIcon(sphere.sphereId) : null;
  return (
    <span className={styles.sphereSocket} aria-hidden>
      <UiImage name="item-slot" className={styles.titlePlateArt} />
      {icon ? <UiImage name={icon} className={styles.sphereIcon} /> : null}
      {sphere && !icon ? (
        <span className={`${styles.sphereInitial} ${styles.outline}`}>{sphere.name.charAt(0)}</span>
      ) : null}
    </span>
  );
}

/** The `sphere-<id>` UI piece for a sphere content ID, when one is exported. */
export function sphereIcon(sphereId: string): UiAsset | null {
  const name = `sphere-${sphereId}`;
  return name in UI_ASSETS ? (name as UiAsset) : null;
}
