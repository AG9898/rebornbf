import Image from "next/image";
import type { ReactNode } from "react";
import styles from "../../app/(menu)/units/units.module.css";
import { levelLabel } from "../../lib/units/owned-units.ts";
import type { CollectionEntry } from "../../lib/units/unit-stacks.ts";
import { UiImage } from "../menu/UiImage.tsx";
import { THUMB_ART_SIZE } from "../menu/ui-assets.ts";

/**
 * The inside of one All Units grid icon (M3-03E): the form's thumb (or sprite, or initial) in its
 * element frame, PARTY on top, a stack's ×N count, and the level across the bottom. The Units list
 * and the multi-select picker (M4-06N) wrap it in their own link or button with the `icon` class.
 */
export function UnitIconFace({
  unit,
  inParty,
}: {
  unit: CollectionEntry;
  inParty: boolean;
}): ReactNode {
  return (
    <>
      <span className={styles.iconArt}>
        {unit.thumb ? (
          <Image
            src={unit.thumb}
            alt=""
            width={THUMB_ART_SIZE.width}
            height={THUMB_ART_SIZE.height}
            className={styles.thumb}
            unoptimized
            draggable={false}
          />
        ) : unit.sprite ? (
          <Image
            src={unit.sprite}
            alt=""
            width={128}
            height={128}
            className={styles.sprite}
            unoptimized
            draggable={false}
          />
        ) : (
          <span className={styles.iconInitial}>{unit.name.charAt(0)}</span>
        )}
      </span>
      {unit.element ? (
        <UiImage name={`unit-frame-${unit.element}`} className={styles.iconFrame} />
      ) : null}
      {inParty ? <span className={`${styles.party} ${styles.outline}`}>PARTY</span> : null}
      {unit.stackCount !== null ? (
        <span className={`${styles.stackCount} ${styles.outline}`} aria-hidden>
          ×{unit.stackCount}
        </span>
      ) : null}
      <span className={`${styles.level} ${styles.outline}`}>{levelLabel(unit)}</span>
    </>
  );
}

/** A grid icon's accessible name: name, rarity, level, copies, and squad membership. */
export function unitIconLabel(unit: CollectionEntry, inParty: boolean): string {
  const copies = unit.stackCount === null ? "" : `, ${unit.stackCount} copies`;
  return `${unit.name}, ${unit.rarityLabel}, ${levelLabel(unit)}${copies}${inParty ? ", in a squad" : ""}`;
}
