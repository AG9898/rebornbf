"use client";

import type { Element } from "@bfr/data";
import { type ReactNode, useMemo, useRef, useState } from "react";
import menu from "../../../components/menu/menu.module.css";
import { HoldButton } from "../../../components/units/HoldButton.tsx";
import { UnitIconFace, unitIconLabel } from "../../../components/units/UnitIconFace.tsx";
import { PickerTitleBar } from "../../../components/units/UnitPicker.tsx";
import {
  addGrantingFodderCopy,
  clearFodder,
  draftCopies,
  FODDER_SPOTS,
  type FusionDraft,
  fodderIneligible,
  fodderPickerEntries,
  removeFodderCopy,
} from "../../../lib/units/fusion-stage.ts";
import type { OwnedUnitRow, UnitSortKey } from "../../../lib/units/owned-units.ts";
import { pickerEntries } from "../../../lib/units/unit-picker.ts";
import type { CollectionEntry, UnitStackRow } from "../../../lib/units/unit-stacks.ts";
import units from "../units/units.module.css";
import styles from "./fusion.module.css";

/**
 * The fusion fodder picker (RESOLVED-90 item 2, M4-01F; ART_GUIDE → UI → Fusion stage): the
 * multi-select picker's title bar and grid, where tapping an icon adds one copy and holding keeps
 * adding, faster, until the no-wasted-pick cutoff (`addGrantingFodderCopy`), the held copies, or 99.
 * Icons that would add nothing are dimmed. The bottom bar shows the five slots, each with ×N and a
 * round minus badge (tap −1, hold repeats; 0 empties the slot), Remove All, and Confirm, which
 * hands the edited draft back. Back discards the edits.
 */
export function FodderPicker({
  entries,
  rows,
  stacks,
  blocked,
  initialDraft,
  onBack,
  onConfirm,
}: {
  /** Every tile the player owns (rows and stacks), with full held counts. */
  entries: readonly CollectionEntry[];
  rows: readonly OwnedUnitRow[];
  stacks: readonly UnitStackRow[];
  /** `owned_units` ids in a saved squad: protected and dimmed. */
  blocked: readonly string[];
  initialDraft: FusionDraft;
  onBack: () => void;
  onConfirm: (draft: FusionDraft) => void;
}): ReactNode {
  const [draft, setDraft] = useState(initialDraft);
  // The hold loop reads and writes the latest draft synchronously, between renders.
  const latest = useRef(initialDraft);
  const [sort, setSort] = useState<UnitSortKey>("rarity");
  const [filter, setFilter] = useState<Element | null>(null);

  const byId = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
  const party = useMemo(() => new Set(blocked), [blocked]);
  const dimmed = useMemo(() => new Set(fodderIneligible(entries, blocked)), [entries, blocked]);
  // Order tiles without the draft, so a tile never moves while it is held.
  const targetId = initialDraft.targetId;
  const shown = useMemo(
    () => pickerEntries(fodderPickerEntries(entries, { targetId, slots: [] }), sort, filter),
    [entries, targetId, sort, filter],
  );
  const remaining = useMemo(
    () => new Map(fodderPickerEntries(entries, draft).map((e) => [e.id, e.stackCount])),
    [entries, draft],
  );
  // Tiles one more copy of which still grants something (RESOLVED-90 item 3).
  const addable = useMemo(
    () =>
      new Set(
        entries
          .filter(
            (entry) =>
              !dimmed.has(entry.id) && addGrantingFodderCopy(draft, entry, rows, stacks) !== draft,
          )
          .map((entry) => entry.id),
      ),
    [entries, dimmed, draft, rows, stacks],
  );
  const total = entries.reduce((sum, unit) => sum + (unit.stackCount ?? 1), 0);
  const copies = draftCopies(draft);

  function commit(next: FusionDraft): boolean {
    if (next === latest.current) return false;
    latest.current = next;
    setDraft(next);
    return true;
  }

  function add(id: string): boolean {
    const entry = byId.get(id);
    if (!entry || dimmed.has(id)) return false;
    return commit(addGrantingFodderCopy(latest.current, entry, rows, stacks));
  }

  function removeOne(id: string): boolean {
    const current = latest.current;
    const index = current.slots.findIndex((slot) => slot.id === id);
    if (index < 0) return false;
    const next = removeFodderCopy(current, index);
    commit(next);
    // Stop a held badge once its slot empties.
    return next.slots.length === current.slots.length;
  }

  return (
    <div className={units.listPage}>
      <PickerTitleBar
        title="Select Units"
        sort={sort}
        onSort={setSort}
        filter={filter}
        onFilter={setFilter}
        total={total}
        backHref="/fusion"
        onBack={onBack}
      />

      <div className={units.list}>
        {shown.length === 0 ? (
          <section className={menu.panel}>
            <p className={menu.panelText}>
              {entries.length === 0 ? "You have no units to choose from." : "No units match."}
            </p>
          </section>
        ) : (
          <ul className={units.grid}>
            {shown.map((tile) => {
              const left = remaining.get(tile.id);
              const unit = { ...tile, stackCount: left === undefined ? tile.stackCount : left };
              const slot = draft.slots.findIndex((s) => s.id === tile.id);
              const can = addable.has(tile.id);
              const inParty = tile.stackCount === null && party.has(tile.id);
              const label = unitIconLabel(unit, inParty);
              return (
                <li key={tile.id} className={units.pickCell}>
                  <HoldButton
                    className={`${units.icon} ${units.pickIcon} ${styles.holdable}${can ? "" : ` ${units.iconDimmed}`}`}
                    label={`${label}${slot >= 0 ? `, slot ${slot + 1}` : ""}${can ? "" : ", nothing to add"}`}
                    pressed={slot >= 0}
                    inert={!can}
                    element={unit.element ?? undefined}
                    onStep={() => add(tile.id)}
                  >
                    <UnitIconFace unit={unit} inParty={inParty} />
                    {slot >= 0 ? (
                      <span
                        className={`${units.pickBadge} ${units.outline}`}
                        data-testid="pick-badge"
                        aria-hidden
                      >
                        {slot + 1}
                      </span>
                    ) : can ? (
                      <span className={units.pickTick} data-testid="pick-tick" aria-hidden />
                    ) : null}
                  </HoldButton>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={`${units.pickerBar} ${styles.slotBar}`}>
        <ol className={styles.slots} aria-label={`Fodder slots, ${copies} copies`}>
          {FODDER_SPOTS.map((spot, index) => {
            const slot = draft.slots[index];
            const entry = slot ? byId.get(slot.id) : undefined;
            if (!slot || !entry) {
              return <li key={spot} className={styles.slot} data-empty="" />;
            }
            return (
              <li key={slot.id} className={styles.slot} data-testid="fodder-slot">
                <span
                  className={`${units.icon} ${styles.slotIcon}`}
                  data-element={entry.element ?? undefined}
                >
                  <UnitIconFace unit={{ ...entry, stackCount: null }} inParty={false} />
                </span>
                <span className={`${styles.slotCount} ${units.outline}`}>×{slot.copies}</span>
                <HoldButton
                  className={`${styles.minusBadge} ${styles.holdable}`}
                  label={`One fewer ${entry.name} (×${slot.copies})`}
                  onStep={() => removeOne(slot.id)}
                >
                  <span aria-hidden>−</span>
                </HoldButton>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          className={`${units.pill} ${units.pillButton} ${styles.removeAll}`}
          disabled={draft.slots.length === 0}
          onClick={() => commit(clearFodder(latest.current))}
        >
          <span className={units.outline}>Remove All</span>
        </button>
        <button
          type="button"
          className={`${units.pill} ${units.pillButton} ${styles.slotConfirm}`}
          onClick={() => onConfirm(latest.current)}
        >
          <span className={units.outline}>Confirm</span>
        </button>
      </div>

      <p className={menu.ticker}>Tap adds a copy, hold adds more. Dimmed units add nothing.</p>
    </div>
  );
}
