"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { fusionPreview } from "../../../lib/units/fusion.ts";
import {
  type OwnedUnitRow,
  sortOwnedUnits,
  toOwnedUnitView,
} from "../../../lib/units/owned-units.ts";
import { fuseUnits } from "./actions.ts";
import styles from "./fusion.module.css";

export function FusionEditor({
  rows,
  blocked,
  zel,
  initialTarget,
}: {
  rows: OwnedUnitRow[];
  blocked: string[];
  zel: number;
  initialTarget?: string;
}): ReactNode {
  const router = useRouter();
  const [targetId, setTargetId] = useState(
    rows.some((r) => r.id === initialTarget) ? (initialTarget ?? "") : "",
  );
  const [fodderIds, setFodderIds] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const target = rows.find((r) => r.id === targetId);
  const preview = target
    ? fusionPreview(
        target,
        rows.filter((r) => fodderIds.includes(r.id)),
      )
    : null;
  const units = sortOwnedUnits(rows.map(toOwnedUnitView));
  const canFuse = preview !== null && fodderIds.length > 0 && zel >= preview.cost;

  function resetConfirmation(): void {
    setConfirming(false);
    setMessage(null);
  }

  return (
    <>
      <p className={styles.balance}>{zel.toLocaleString("en-US")} Zel available</p>
      {rows.length === 0 ? (
        <p>You have no units yet. Play the story to collect units.</p>
      ) : (
        <>
          <label className={styles.label} htmlFor="fusion-target">
            Unit to level
          </label>
          <select
            id="fusion-target"
            className={styles.select}
            value={targetId}
            disabled={pending}
            onChange={(event) => {
              setTargetId(event.target.value);
              setFodderIds([]);
              resetConfirmation();
            }}
          >
            <option value="">Choose a unit</option>
            {units
              .filter((u) => u.maxLevel !== null)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.rarityLabel} · Lv {u.level}
                </option>
              ))}
          </select>
          <h2 className={styles.label}>Fodder · {fodderIds.length}/5</h2>
          <p className={styles.note}>
            Fodder is consumed permanently. Units in any squad or ally slot are protected.
          </p>
          <ul className={styles.grid}>
            {units
              .filter((u) => u.id !== targetId)
              .map((u) => {
                const selected = fodderIds.includes(u.id);
                const inSquad = blocked.includes(u.id);
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      className={styles.card}
                      aria-pressed={selected}
                      disabled={
                        pending ||
                        !target ||
                        inSquad ||
                        !u.maxLevel ||
                        (!selected && fodderIds.length >= 5)
                      }
                      onClick={() => {
                        setFodderIds(
                          selected ? fodderIds.filter((id) => id !== u.id) : [...fodderIds, u.id],
                        );
                        resetConfirmation();
                      }}
                    >
                      {u.thumb ? (
                        <Image src={u.thumb} alt="" width={256} height={256} unoptimized />
                      ) : (
                        <span>{u.name.charAt(0)}</span>
                      )}
                      <span>{u.name}</span>
                      <small>
                        {u.rarityLabel} · Lv {u.level}
                        {inSquad ? " · In squad" : ""}
                      </small>
                    </button>
                  </li>
                );
              })}
          </ul>
          {preview && (
            <section className={styles.preview} aria-live="polite">
              <p>EXP gained: {preview.gain.toLocaleString("en-US")}</p>
              <p>
                Level {target?.level} → {preview.level} · Total EXP{" "}
                {preview.exp.toLocaleString("en-US")}
              </p>
              <p>
                BB {target?.bb_level ?? 1} → {preview.bbLevel}
              </p>
              {preview.sbbLevel !== null && (
                <p>
                  SBB {target?.sbb_level ?? 1} → {preview.sbbLevel}
                </p>
              )}
              {preview.burstDiscarded > 0 && (
                <p>
                  {preview.burstDiscarded} burst levels exceed the available caps and will be lost.
                </p>
              )}
              <p>Cost: {preview.cost.toLocaleString("en-US")} Zel</p>
              {preview.discarded > 0 && (
                <p>
                  {preview.discarded.toLocaleString("en-US")} EXP exceeds the level cap and will be
                  lost.
                </p>
              )}
              {zel < preview.cost && <p>Not enough Zel.</p>}
            </section>
          )}
          {confirming ? (
            <section className={styles.preview} aria-label="Confirm fusion">
              <p>
                Consume {fodderIds.length} selected units for{" "}
                {preview?.cost.toLocaleString("en-US")} Zel?
              </p>
              <button
                type="button"
                disabled={pending || !canFuse}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      const result = await fuseUnits(targetId, fodderIds);
                      setMessage(result.message);
                      setConfirming(false);
                      if (result.ok) {
                        setFodderIds([]);
                        router.refresh();
                      }
                    } catch {
                      setMessage(
                        "Could not reach fusion. Reload your collection before trying again.",
                      );
                      setConfirming(false);
                    }
                  })
                }
              >
                {pending ? "Fusing…" : "Confirm fusion"}
              </button>
              <button type="button" disabled={pending} onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </section>
          ) : (
            <button
              className={styles.fuse}
              type="button"
              disabled={pending || !canFuse}
              onClick={() => setConfirming(true)}
            >
              Fuse selected units
            </button>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
      {targetId && (
        <Link className={styles.detailLink} href={`/units/${targetId}`}>
          View target unit
        </Link>
      )}
    </>
  );
}
