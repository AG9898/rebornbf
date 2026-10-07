"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { LoadingGlyph } from "../../../../../components/loading/LoadingGlyph.tsx";
import kit from "../../../../../components/menu/kit.module.css";
import { OriginalImage } from "../../../../../components/menu/OriginalImage.tsx";
import { OriginalTicker, OriginalTitleBar } from "../../../../../components/menu/OriginalKit.tsx";
import { UiImage } from "../../../../../components/menu/UiImage.tsx";
import { THUMB_ART_SIZE } from "../../../../../components/menu/ui-assets.ts";
import type { OwnedUnitView } from "../../../../../lib/units/owned-units.ts";
import {
  SPHERE_EQUIP_ASSETS as A,
  initialSphereSlot,
  sphereEquipHint,
} from "../../../../../lib/units/sphere-equip-screen.ts";
import type {
  OwnedSphereEntry,
  SphereSlot,
  SphereSocketView,
  SphereView,
} from "../../../../../lib/units/spheres.ts";
import units from "../../units.module.css";
import { sphereIcon } from "../SphereSocketFace.tsx";
import { equipSphere } from "./actions.ts";
import styles from "./spheres.module.css";

export type SphereEquipUnit = {
  name: string;
  subtitle: string;
  thumb: string | null;
  element: OwnedUnitView["element"];
};

/**
 * Original Equip Sphere (M8-09, ART_GUIDE → UI → Equip Sphere): the title bar with Remove, a slot
 * band when the unit's second slot is unlocked, and the owned spheres as the original's list rows
 * (thumb, UP type icon, name, effect summary, Equip). Equip and Remove act on the chosen slot
 * through the `equipSphere` Server Action; results and refusals show in the ticker.
 */
export function SphereEquip({
  unitId,
  unit,
  sockets,
  spheres,
}: {
  unitId: string;
  unit: SphereEquipUnit;
  /** Unlocked sockets only; a locked second slot is not shown. */
  sockets: readonly SphereSocketView[];
  spheres: readonly OwnedSphereEntry[] | null;
}): ReactNode {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [slot, setSlot] = useState<SphereSlot>(() => initialSphereSlot(sockets));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const socket = sockets.find((s) => s.slot === slot) ?? null;

  function run(sphereId: string | null, done: string): void {
    if (!socket) return;
    const target = socket.slot;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await equipSphere(unitId, target, sphereId);
      if (result.ok) {
        setNotice(done);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  const held = socket?.sphere ?? null;
  return (
    <>
      <OriginalTitleBar title="Equip Sphere" subtitle={unit.subtitle} backHref={`/units/${unitId}`}>
        <button
          type="button"
          className={`${kit.button} ${styles.square} ${styles.remove}`}
          aria-label={held ? `Remove ${held.name}` : "Remove"}
          onClick={() => held && run(null, `Removed ${held.name}.`)}
          disabled={pending || !held}
        >
          <OriginalImage asset={A.squareNormal} className={`${kit.normal} ${kit.layer}`} />
          <OriginalImage asset={A.squarePressed} className={`${kit.pressed} ${kit.layer}`} />
          <OriginalImage asset={A.removeNormal} className={`${kit.normal} ${styles.removeLabel}`} />
          <OriginalImage
            asset={A.removePressed}
            className={`${kit.pressed} ${styles.removeLabel}`}
          />
        </button>
      </OriginalTitleBar>

      {sockets.length > 1 ? (
        <fieldset className={styles.slots} aria-label="Sphere slot">
          {sockets.map((s) => (
            <button
              key={s.slot}
              type="button"
              aria-pressed={s.slot === slot}
              className={styles.slot}
              onClick={() => {
                setSlot(s.slot);
                setError(null);
                setNotice(null);
              }}
              disabled={pending}
            >
              <span className={styles.socket} aria-hidden>
                <OriginalImage asset={A.socketBase} />
                <OriginalImage asset={A.socket} />
                <SphereArt sphere={s.sphere} empty={A.emptySphere} />
              </span>
              <span className={`${styles.slotText} ${kit.text}`}>
                Slot {s.slot}: {s.sphere?.name ?? "Empty"}
              </span>
            </button>
          ))}
        </fieldset>
      ) : null}

      <div className={`${kit.body} ${styles.body}`}>
        {spheres === null ? (
          <p className={styles.message}>Your spheres could not be loaded. Try again later.</p>
        ) : spheres.length === 0 ? (
          <p className={styles.message}>You do not own any spheres yet.</p>
        ) : (
          <ul className={styles.list}>
            {spheres.map((sphere) => (
              <SphereRow
                key={sphere.id}
                sphere={sphere}
                unit={unit}
                disabled={pending || !socket}
                onEquip={() => run(sphere.id, `Equipped ${sphere.name} in Slot ${socket?.slot}.`)}
              />
            ))}
          </ul>
        )}
      </div>

      <OriginalTicker>
        {pending ? (
          <LoadingGlyph />
        ) : error ? (
          <span role="alert">{error}</span>
        ) : (
          <span aria-live="polite">{notice ?? sphereEquipHint(sockets.length, slot)}</span>
        )}
      </OriginalTicker>
    </>
  );
}

/** One list row: frame, item-framed thumb, UP icon, name, summary, then Equip or the holder. */
function SphereRow({
  sphere,
  unit,
  disabled,
  onEquip,
}: {
  sphere: OwnedSphereEntry;
  unit: SphereEquipUnit;
  disabled: boolean;
  onEquip: () => void;
}): ReactNode {
  const elsewhere = sphere.equipped !== null && !sphere.equipped.onThisUnit;
  return (
    <li className={styles.row} title={sphere.kindLabel}>
      <OriginalImage asset={A.row} className={styles.rowFrame} />
      <span className={styles.thumb} aria-hidden>
        <OriginalImage asset={A.thumbBase} className={kit.layer} />
        <SphereArt sphere={sphere} />
        <OriginalImage asset={A.thumbFrame} className={kit.layer} />
      </span>
      <OriginalImage asset={A.typeIcon} className={styles.typeIcon} />
      <h2 className={`${styles.name} ${kit.text}`}>{sphere.name}</h2>
      <p className={`${styles.desc} ${kit.text}`}>
        {sphere.summary || sphere.kindLabel}
        <br />
        {elsewhere ? "Equipped on another unit" : sphere.kindLabel}
      </p>
      {sphere.equipped?.onThisUnit ? (
        <span
          className={`${units.icon} ${styles.holder}`}
          data-element={unit.element ?? undefined}
          role="img"
          aria-label={`Equipped on ${unit.name}, Slot ${sphere.equipped.slot}`}
        >
          <span className={units.iconArt}>
            {unit.thumb ? (
              <Image
                src={unit.thumb}
                alt=""
                width={THUMB_ART_SIZE.width}
                height={THUMB_ART_SIZE.height}
                className={units.thumb}
                unoptimized
                draggable={false}
              />
            ) : (
              <span className={units.iconInitial}>{unit.name.charAt(0)}</span>
            )}
          </span>
          {unit.element ? (
            <UiImage name={`unit-frame-${unit.element}`} className={units.iconFrame} />
          ) : null}
          <span className={`${styles.holderSlot} ${kit.text}`} aria-hidden>
            Slot {sphere.equipped.slot}
          </span>
        </span>
      ) : (
        <button
          type="button"
          className={`${kit.button} ${styles.square} ${styles.equip}`}
          aria-label={`Equip ${sphere.name}`}
          onClick={onEquip}
          disabled={disabled || elsewhere}
        >
          <OriginalImage asset={A.squareNormal} className={`${kit.normal} ${kit.layer}`} />
          <OriginalImage asset={A.squarePressed} className={`${kit.pressed} ${kit.layer}`} />
          <OriginalImage asset={A.equipNormal} className={`${kit.normal} ${styles.equipLabel}`} />
          <OriginalImage asset={A.equipPressed} className={`${kit.pressed} ${styles.equipLabel}`} />
        </button>
      )}
    </li>
  );
}

/** BFR's sphere icon (no original counterpart), its initial, or the empty-socket piece. */
function SphereArt({
  sphere,
  empty,
}: {
  sphere: SphereView | null;
  empty?: (typeof A)["emptySphere"];
}): ReactNode {
  const icon = sphere ? sphereIcon(sphere.sphereId) : null;
  if (icon) return <UiImage name={icon} className={styles.sphereIcon} />;
  if (sphere)
    return <span className={`${styles.initial} ${kit.text}`}>{sphere.name.charAt(0)}</span>;
  return empty ? <OriginalImage asset={empty} className={styles.emptySphere} /> : null;
}
