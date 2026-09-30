"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { canBeFodder, fusionPreview } from "../../../lib/units/fusion.ts";
import {
  type OwnedUnitRow,
  sortOwnedUnits,
  toOwnedUnitView,
} from "../../../lib/units/owned-units.ts";
import {
  FUSION_FODDER_LIMIT,
  type StackQuantities,
  setStackQuantity,
  stackCopies,
  stackCopyRow,
  stackQuantityTotal,
  type UnitStackRow,
} from "../../../lib/units/unit-stacks.ts";
import { fuseUnits } from "./actions.ts";
import styles from "./fusion.module.css";

/**
 * The fusion screen's editor (M4-01B): target, fodder, preview, and confirm. Stacked copies
 * (M4-05C) show once per stack with a quantity stepper capped by the stack's count and the 1–5
 * fodder limit; a stack cannot be the target until a copy is split out on its detail page.
 */
export function FusionEditor({
  rows,
  stacks,
  blocked,
  zel,
  initialTarget,
}: {
  rows: OwnedUnitRow[];
  stacks: UnitStackRow[];
  blocked: string[];
  zel: number;
  initialTarget?: string;
}): ReactNode {
  const router = useRouter();
  const [targetId, setTargetId] = useState(
    rows.some((r) => r.id === initialTarget) ? (initialTarget ?? "") : "",
  );
  const [fodderIds, setFodderIds] = useState<string[]>([]);
  const [stackQty, setStackQty] = useState<StackQuantities>({});
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const target = rows.find((r) => r.id === targetId);
  const preview = target
    ? fusionPreview(target, [
        ...rows.filter((r) => fodderIds.includes(r.id)),
        ...stackCopies(stacks, stackQty),
      ])
    : null;
  const units = sortOwnedUnits(rows.map(toOwnedUnitView));
  const stackViews = sortOwnedUnits(
    stacks
      .filter((stack) => canBeFodder(stack.unit_id, stack.form_id))
      .map((stack) => ({ ...toOwnedUnitView(stackCopyRow(stack)), stack })),
  );
  const copies = fodderIds.length + stackQuantityTotal(stackQty);
  const canFuse = preview !== null && copies > 0 && zel >= preview.cost;

  function changeStack(stack: UnitStackRow, wanted: number): void {
    setStackQty(setStackQuantity(stackQty, stack, wanted, fodderIds.length));
    resetConfirmation();
  }

  function resetConfirmation(): void {
    setConfirming(false);
    setMessage(null);
  }

  return (
    <>
      <p className={styles.balance}>{zel.toLocaleString("en-US")} Zel available</p>
      {rows.length === 0 && stacks.length === 0 ? (
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
              setStackQty({});
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
          <h2 className={styles.label}>
            Fodder · {copies}/{FUSION_FODDER_LIMIT}
          </h2>
          <p className={styles.note}>
            Fodder is consumed permanently. Units in any squad or ally slot are protected. Stacked
            units are chosen by quantity; split a copy out on its detail page to level it instead.
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
                        !canBeFodder(u.unitId, u.formId) ||
                        (!selected && copies >= FUSION_FODDER_LIMIT)
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
          {stackViews.length > 0 && (
            <ul className={styles.grid} aria-label="Stacked units">
              {stackViews.map((u) => {
                const chosen = stackQty[u.stack.id] ?? 0;
                const room = chosen < u.stack.count && copies < FUSION_FODDER_LIMIT;
                return (
                  <li key={u.stack.id}>
                    <div className={styles.card} data-chosen={chosen > 0 || undefined}>
                      <span className={styles.thumbBox}>
                        {u.thumb ? (
                          <Image src={u.thumb} alt="" width={256} height={256} unoptimized />
                        ) : (
                          <span>{u.name.charAt(0)}</span>
                        )}
                        <span className={styles.stackBadge}>×{u.stack.count}</span>
                      </span>
                      <span>{u.name}</span>
                      <small>
                        {u.rarityLabel} · Lv {u.level}
                      </small>
                      <span className={styles.stepper}>
                        <button
                          type="button"
                          aria-label={`One fewer ${u.name}`}
                          disabled={pending || !target || chosen === 0}
                          onClick={() => changeStack(u.stack, chosen - 1)}
                        >
                          −
                        </button>
                        <output aria-label={`${u.name} chosen`}>{chosen}</output>
                        <button
                          type="button"
                          aria-label={`One more ${u.name}`}
                          disabled={pending || !target || !room}
                          onClick={() => changeStack(u.stack, chosen + 1)}
                        >
                          +
                        </button>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
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
                Consume {copies} selected units for {preview?.cost.toLocaleString("en-US")} Zel?
              </p>
              <button
                type="button"
                disabled={pending || !canFuse}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      const result = await fuseUnits(targetId, fodderIds, stackQty);
                      setMessage(result.message);
                      setConfirming(false);
                      if (result.ok) {
                        setFodderIds([]);
                        setStackQty({});
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
