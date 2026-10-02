"use client";

import type { Element } from "@bfr/data";
import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import styles from "../../app/(menu)/units/units.module.css";
import {
  ELEMENT_LABELS,
  nextUnitSort,
  UNIT_SORT_LABELS,
  type UnitSortKey,
} from "../../lib/units/owned-units.ts";
import {
  nextPickerFilter,
  type PickResult,
  type PickRules,
  pickedCopies,
  pickerEntries,
  pickNumber,
  pickResult,
  setPickCopies,
  togglePick,
  type UnitPicks,
} from "../../lib/units/unit-picker.ts";
import type { CollectionEntry } from "../../lib/units/unit-stacks.ts";
import menu from "../menu/menu.module.css";
import { textBoxStyle } from "../menu/text-box.ts";
import { UiImage } from "../menu/UiImage.tsx";
import { UnitIconFace, unitIconLabel } from "./UnitIconFace.tsx";

/**
 * The shared multi-select unit picker (M4-06N, RESOLVED-83; ART_GUIDE → UI → Multi-select picker):
 * the All Units grid with a context title, Sort and Filter, and the count plate. Pickable icons
 * carry a grey tick circle, picked icons a red badge numbered in pick order, and ineligible icons
 * are dimmed and inert. A picked stack shows a stepper for its copies; every copy counts against
 * `limit`. Confirm hands `onConfirm` the picked row ids and stack copies (`pickResult`). Squad
 * fill (M4-06F) and the fusion base picker use it, and sell adopts it (M4-06I); fusion fodder has its own
 * tap/hold slot picker (`FodderPicker`, M4-01F) that shares `PickerTitleBar`.
 */
export function UnitPicker({
  title,
  units,
  limit,
  ineligible = [],
  party = [],
  initialPicks = [],
  initialSort = "rarity",
  backHref,
  onBack,
  confirmLabel = "Confirm",
  ticker,
  busy = false,
  onConfirm,
}: {
  /** The context title on the plate, e.g. "Select Units" or "Sell Units". */
  title: string;
  /** Every tile the player owns (rows and stacks), in any order. */
  units: readonly CollectionEntry[];
  /** The most copies one confirm may return. */
  limit: number;
  /** Tile ids that cannot be picked; they are dimmed. */
  ineligible?: readonly string[];
  /** `owned_units` ids in a saved squad; they show PARTY. */
  party?: readonly string[];
  initialPicks?: UnitPicks;
  initialSort?: UnitSortKey;
  /** Where Back goes. */
  backHref: string;
  /** When set, Back calls it instead of navigating (a picker opened over its consumer's screen). */
  onBack?: () => void;
  confirmLabel?: string;
  /** The help line under the grid. */
  ticker?: string;
  /** The consumer is working on the last confirm; Confirm is disabled. */
  busy?: boolean;
  onConfirm: (result: PickResult) => void;
}): ReactNode {
  const rules: PickRules = useMemo(
    () => ({ limit, ineligible: new Set(ineligible) }),
    [limit, ineligible],
  );
  const partySet = useMemo(() => new Set(party), [party]);
  const [sort, setSort] = useState<UnitSortKey>(initialSort);
  const [filter, setFilter] = useState<Element | null>(null);
  const [picks, setPicks] = useState<UnitPicks>(() => pickResultPicks(initialPicks, units, rules));
  const shown = useMemo(() => pickerEntries(units, sort, filter), [units, sort, filter]);
  const copies = pickedCopies(picks);
  const total = units.reduce((sum, unit) => sum + (unit.stackCount ?? 1), 0);

  return (
    <div className={styles.listPage}>
      <PickerTitleBar
        title={title}
        sort={sort}
        onSort={setSort}
        filter={filter}
        onFilter={setFilter}
        total={total}
        backHref={backHref}
        onBack={onBack}
      />

      <div className={styles.list}>
        {shown.length === 0 ? (
          <section className={menu.panel}>
            <p className={menu.panelText}>
              {units.length === 0 ? "You have no units to choose from." : "No units match."}
            </p>
          </section>
        ) : (
          <ul className={styles.grid}>
            {shown.map((unit) => {
              const number = pickNumber(picks, unit.id);
              const pick = picks.find((entry) => entry.id === unit.id);
              return (
                <li key={unit.id} className={styles.pickCell}>
                  <PickIcon
                    unit={unit}
                    inParty={unit.stackCount === null && partySet.has(unit.id)}
                    eligible={!rules.ineligible.has(unit.id)}
                    number={number}
                    onToggle={() => setPicks((current) => togglePick(current, unit, rules))}
                  />
                  {pick && unit.stackCount !== null ? (
                    <StackStepper
                      name={unit.name}
                      copies={pick.copies}
                      held={unit.stackCount}
                      canAdd={copies < limit && pick.copies < unit.stackCount}
                      onChange={(wanted) =>
                        setPicks((current) => setPickCopies(current, unit, wanted, rules))
                      }
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={styles.pickerBar}>
        <span className={`${styles.pickerCount} ${styles.outline}`} aria-live="polite">
          Picked {copies}/{limit}
        </span>
        <button
          type="button"
          className={`${styles.pill} ${styles.pillButton} ${styles.confirmPill}`}
          disabled={busy || copies === 0}
          onClick={() => onConfirm(pickResult(picks, units, rules))}
        >
          <span className={styles.outline}>{confirmLabel}</span>
        </button>
      </div>

      {ticker ? <p className={menu.ticker}>{ticker}</p> : null}
    </div>
  );
}

/**
 * The picker's title bar (shared with the fusion fodder picker, M4-01F): Back, the title plate with
 * "Sort: X · element", Sort, Filter cycling All then each element, and the Units count plate.
 */
export function PickerTitleBar({
  title,
  sort,
  onSort,
  filter,
  onFilter,
  total,
  backHref,
  onBack,
}: {
  title: string;
  sort: UnitSortKey;
  onSort: (sort: UnitSortKey) => void;
  filter: Element | null;
  onFilter: (filter: Element | null) => void;
  /** Copies owned in all (the count plate). */
  total: number;
  backHref: string;
  onBack?: () => void;
}): ReactNode {
  const filterLabel = filter === null ? "All" : ELEMENT_LABELS[filter];
  return (
    <header className={styles.titleBar}>
      {onBack ? (
        <button
          type="button"
          className={`${styles.pill} ${styles.pillButton} ${styles.backButton}`}
          onClick={onBack}
        >
          <span className={styles.outline}>Back</span>
        </button>
      ) : (
        <Link href={backHref} className={`${styles.pill} ${styles.backButton}`}>
          <span className={styles.outline}>Back</span>
        </Link>
      )}
      <div className={`${styles.titlePlate} ${styles.pickerTitlePlate}`}>
        <UiImage name="title-plate" className={styles.titlePlateArt} />
        <div className={styles.titleText} style={textBoxStyle("title-plate")}>
          <h1 className={styles.outline}>{title}</h1>
          <span className={`${styles.sortLine} ${styles.outline}`}>
            Sort: {UNIT_SORT_LABELS[sort]} · {filterLabel}
          </span>
        </div>
      </div>
      <button
        type="button"
        className={`${styles.pill} ${styles.pillButton} ${styles.sortButton}`}
        onClick={() => onSort(nextUnitSort(sort))}
        aria-label={`Sort by ${UNIT_SORT_LABELS[nextUnitSort(sort)]}`}
      >
        <span className={styles.outline}>Sort</span>
      </button>
      <button
        type="button"
        className={`${styles.pill} ${styles.pillButton} ${styles.sortButton}`}
        onClick={() => onFilter(nextPickerFilter(filter))}
        aria-label={`Show ${filterNextLabel(filter)}`}
      >
        <span className={styles.outline}>Filter</span>
      </button>
      <div className={`${styles.pill} ${styles.countPlate}`}>
        <span className={`${styles.countLabel} ${styles.outline}`}>Units</span>
        <span className={`${styles.countValue} ${styles.outline}`}>{total}</span>
      </div>
    </header>
  );
}

/** Starting picks, cleaned by the same rules as Confirm (unknown, ineligible, or over-limit dropped). */
function pickResultPicks(
  initial: UnitPicks,
  units: readonly CollectionEntry[],
  rules: PickRules,
): UnitPicks {
  const result = pickResult(initial, units, rules);
  return initial.flatMap((pick) => {
    if (result.unitIds.includes(pick.id)) return [{ id: pick.id, copies: 1 }];
    const stacked = result.stacks[pick.id];
    return stacked ? [{ id: pick.id, copies: stacked }] : [];
  });
}

function filterNextLabel(filter: Element | null): string {
  const next = nextPickerFilter(filter);
  return next === null ? "all units" : `${ELEMENT_LABELS[next]} units`;
}

/**
 * One picker icon: the grid face plus a grey tick circle (pickable) or a red pick-order badge
 * (picked). An ineligible icon is dimmed and disabled.
 */
function PickIcon({
  unit,
  inParty,
  eligible,
  number,
  onToggle,
}: {
  unit: CollectionEntry;
  inParty: boolean;
  eligible: boolean;
  number: number | null;
  onToggle: () => void;
}): ReactNode {
  const label = unitIconLabel(unit, inParty);
  return (
    <button
      type="button"
      className={`${styles.icon} ${styles.pickIcon}${eligible ? "" : ` ${styles.iconDimmed}`}`}
      data-element={unit.element ?? undefined}
      aria-pressed={number !== null}
      aria-label={
        eligible
          ? number === null
            ? label
            : `${label}, pick ${number}`
          : `${label}, cannot be picked`
      }
      disabled={!eligible}
      onClick={onToggle}
    >
      <UnitIconFace unit={unit} inParty={inParty} />
      {number !== null ? (
        <span
          className={`${styles.pickBadge} ${styles.outline}`}
          data-testid="pick-badge"
          aria-hidden
        >
          {number}
        </span>
      ) : eligible ? (
        <span className={styles.pickTick} data-testid="pick-tick" aria-hidden />
      ) : null}
    </button>
  );
}

/** A picked stack's copies: − and + around "n/held". */
function StackStepper({
  name,
  copies,
  held,
  canAdd,
  onChange,
}: {
  name: string;
  copies: number;
  held: number;
  canAdd: boolean;
  onChange: (wanted: number) => void;
}): ReactNode {
  return (
    <div className={styles.stepper}>
      <button
        type="button"
        className={styles.stepperButton}
        aria-label={`One fewer ${name}`}
        onClick={() => onChange(copies - 1)}
      >
        −
      </button>
      <span className={`${styles.stepperValue} ${styles.outline}`}>
        {copies}/{held}
      </span>
      <button
        type="button"
        className={styles.stepperButton}
        aria-label={`One more ${name}`}
        disabled={!canAdd}
        onClick={() => onChange(copies + 1)}
      >
        +
      </button>
    </div>
  );
}
