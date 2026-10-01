"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import type {
  OwnedSphereEntry,
  SphereSlot,
  SphereSocketView,
} from "../../../../../lib/units/spheres.ts";
import styles from "../../units.module.css";
import { SphereGem, SphereSocketFace } from "../SphereSocketFace.tsx";
import { equipSphere } from "./actions.ts";

/**
 * The Equip Sphere screen's interactive part (M4-06J): tap a socket to select it, then a sphere to
 * equip it there (replacing what it held), or Remove to empty it. Each change runs the
 * `equipSphere` Server Action; refusals show in the status strip, and success refreshes the rows.
 */
export function SphereEquip({
  unitId,
  sockets,
  spheres,
}: {
  unitId: string;
  /** Unlocked sockets only; a locked second slot is not shown. */
  sockets: readonly SphereSocketView[];
  spheres: readonly OwnedSphereEntry[];
}): ReactNode {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<SphereSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const socket = sockets.find((s) => s.slot === selected) ?? null;

  function run(sphereId: string | null, done: string): void {
    if (!socket) return;
    const slot = socket.slot;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await equipSphere(unitId, slot, sphereId);
      if (result.ok) {
        setNotice(done);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  const hint = socket
    ? `Slot ${socket.slot}: choose a sphere to equip${socket.sphere ? ", or Remove" : ""}.`
    : "Tap a sphere slot.";
  return (
    <div className={styles.equipBody}>
      <h2 className={`${styles.equipHeading} ${styles.outline}`}>Sphere Slots</h2>
      <div className={styles.sphereRows}>
        {sockets.map((s) => (
          <button
            key={s.slot}
            type="button"
            className={styles.sphereRow}
            aria-pressed={selected === s.slot}
            aria-label={`Sphere slot ${s.slot}: ${s.sphere ? s.sphere.name : "empty"}`}
            onClick={() => {
              setSelected(selected === s.slot ? null : s.slot);
              setError(null);
              setNotice(null);
            }}
            disabled={pending}
          >
            <SphereSocketFace socket={s} />
          </button>
        ))}
      </div>

      <div className={styles.equipStatus}>
        {error ? (
          <p className={styles.equipMessage} role="alert">
            {error}
          </p>
        ) : (
          <p className={styles.equipMessage} aria-live="polite">
            {pending ? "Saving…" : (notice ?? hint)}
          </p>
        )}
        {socket?.sphere ? (
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => run(null, `Removed ${socket.sphere?.name}.`)}
            disabled={pending}
          >
            <span className={styles.outline}>Remove</span>
          </button>
        ) : null}
      </div>

      <h2 className={`${styles.equipHeading} ${styles.outline}`}>Owned Spheres</h2>
      {spheres.length === 0 ? (
        <div className={styles.equipStatus}>
          <p className={styles.equipMessage}>You do not own any spheres yet.</p>
        </div>
      ) : (
        <ul className={styles.sphereList}>
          {spheres.map((sphere) => {
            const inSelected =
              sphere.equipped?.onThisUnit === true && sphere.equipped.slot === socket?.slot;
            const tag = !sphere.equipped
              ? null
              : sphere.equipped.onThisUnit
                ? `Slot ${sphere.equipped.slot}`
                : "On another unit";
            return (
              <li key={sphere.id}>
                <button
                  type="button"
                  className={styles.sphereRow}
                  disabled={pending || !socket || inSelected}
                  onClick={() => run(sphere.id, `Equipped ${sphere.name} in slot ${socket?.slot}.`)}
                  title={sphere.kindLabel}
                >
                  <SphereGem sphere={sphere} />
                  <span className={styles.spherePlate}>
                    <span className={`${styles.sphereName} ${styles.outline}`}>
                      {sphere.name}
                      {tag ? <span className={styles.sphereTag}> · {tag}</span> : null}
                    </span>
                    <span className={styles.sphereSummary}>
                      {sphere.kindLabel}
                      {sphere.summary ? ` · ${sphere.summary}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
