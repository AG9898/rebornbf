import Link from "next/link";
import type { ReactNode } from "react";
import kit from "../../../../components/menu/kit.module.css";
import { OriginalImage } from "../../../../components/menu/OriginalImage.tsx";
import {
  OriginalButton,
  OriginalTicker,
  OriginalTitleBar,
  OriginalWindow,
} from "../../../../components/menu/OriginalKit.tsx";
import { UnitIconFace, unitIconLabel } from "../../../../components/units/UnitIconFace.tsx";
import { UNIT_SORT_LABELS, type UnitSortKey } from "../../../../lib/units/owned-units.ts";
import {
  hasFilter,
  REMOVE_FILTER,
  type UnitFilter,
  unitListFilterHref,
} from "../../../../lib/units/unit-filter.ts";
import {
  pickHref,
  UNIT_HUB_PATH,
  UNIT_PICK_TEXT,
  type UnitPickMode,
} from "../../../../lib/units/unit-hub.ts";
import { LIST_FILTER_BUTTON, unitSortHref } from "../../../../lib/units/unit-list-screen.ts";
import { type CollectionEntry, collectionHref } from "../../../../lib/units/unit-stacks.ts";
import styles from "../units.module.css";
import list from "./unit-list.module.css";

/**
 * The Units list as the original's unit box (M3-03E, M8-04; ART_GUIDE → UI → Units list and sort
 * screen): the kit title bar with the title and its sort line, the red Filter button (opens the sort
 * screen) and the unit count, a five-column grid of thumbs at the positions in
 * art/original/layouts/unit_list.json, and the ticker. A stack of untouched copies (M4-05C) is one
 * tile with a ×N badge. Presentational only; `page.tsx` reads the rows. In a pick mode (M4-06B) the
 * title names the action, units that cannot be picked are dimmed, and a tap opens the action's screen.
 * While a filter is applied (M8-04_1) the Filter button's label is lit and the grid ends in the
 * original's Remove Filter tile, which reopens the list with the same sort and pick mode.
 */
export function UnitsList({
  units,
  total,
  party,
  sort,
  pick,
  filter,
  failed,
}: {
  /** The player's owned rows and stacks, already sorted by `sort` and filtered by `filter`. */
  units: readonly CollectionEntry[];
  /** Units owned, counting every stacked copy. */
  total: number;
  /** `owned_units` ids that sit in any saved squad; they show PARTY. */
  party: ReadonlySet<string>;
  sort: UnitSortKey;
  /** The pick mode (`?pick=`), or null for the plain list. */
  pick: UnitPickMode | null;
  /** The applied filter (`?el=`, `?rar=`, …); empty for none. */
  filter: UnitFilter;
  /** The rows could not be read. */
  failed: boolean;
}): ReactNode {
  const filtered = hasFilter(filter);
  return (
    <div className={kit.page}>
      <OriginalTitleBar
        title={pick ? UNIT_PICK_TEXT[pick].title : "All Units"}
        subtitle={
          <>
            Sort <span className={list.sortValue}>{UNIT_SORT_LABELS[sort]}</span>
          </>
        }
        backHref={UNIT_HUB_PATH}
      >
        <Link
          href={unitSortHref(sort, pick, filter)}
          className={`${kit.button} ${kit.labelButton} ${list.filterButton}`}
          aria-label={filtered ? "Sort and filter (filter on)" : "Sort and filter"}
        >
          <OriginalImage
            asset={`${LIST_FILTER_BUTTON.base}1.png`}
            className={`${kit.normal} ${kit.layer}`}
          />
          <OriginalImage
            asset={`${LIST_FILTER_BUTTON.base}2.png`}
            className={`${kit.pressed} ${kit.layer}`}
          />
          <OriginalImage
            asset={`${LIST_FILTER_BUTTON.art}${filtered ? 1 : 2}.png`}
            className={kit.layer}
          />
        </Link>
        <p className={`${list.count} ${kit.text}`} title="Units owned">
          {failed ? "–" : total}
        </p>
      </OriginalTitleBar>

      <div className={kit.body}>
        {failed ? (
          <OriginalWindow className={list.message}>
            <p className={`${list.messageText} ${kit.text}`}>
              Your units could not be loaded. Try again shortly.
            </p>
          </OriginalWindow>
        ) : units.length === 0 && !filtered ? (
          <OriginalWindow className={list.message}>
            <p className={`${list.messageText} ${kit.text}`}>
              You have no units yet. Your starters join you as you clear the story.
            </p>
            <OriginalButton size="sub_m_btn" href="/home" className={list.messageButton}>
              Home
            </OriginalButton>
          </OriginalWindow>
        ) : (
          <ul className={list.grid}>
            {units.map((unit) => (
              <li key={unit.id}>
                <UnitIcon
                  unit={unit}
                  href={pick ? pickHref(unit, pick) : collectionHref(unit)}
                  inParty={unit.stackCount === null && party.has(unit.id)}
                />
              </li>
            ))}
            {units.length === 0 ? (
              <li className={`${list.empty} ${kit.text}`}>No units match this filter.</li>
            ) : null}
            {filtered ? (
              <li>
                <Link
                  href={unitListFilterHref(sort, pick, {})}
                  className={list.removeFilter}
                  aria-label="Remove filter"
                >
                  <OriginalImage asset={REMOVE_FILTER[0]} className={kit.normal} />
                  <OriginalImage asset={REMOVE_FILTER[1]} className={kit.pressed} />
                </Link>
              </li>
            ) : null}
          </ul>
        )}
      </div>

      <OriginalTicker>
        {pick ? UNIT_PICK_TEXT[pick].ticker : "Select a Unit to view its details."}
      </OriginalTicker>
    </div>
  );
}

/**
 * One grid icon: the form's thumb in its element frame, the level across the bottom, PARTY on top,
 * and a stack's ×N count in the top-right corner. With no `href` (a unit a pick mode cannot take)
 * it is dimmed and not a link.
 */
function UnitIcon({
  unit,
  href,
  inParty,
}: {
  unit: CollectionEntry;
  href: string | null;
  inParty: boolean;
}): ReactNode {
  const label = unitIconLabel(unit, inParty);
  const face = <UnitIconFace unit={unit} inParty={inParty} />;
  if (!href) {
    return (
      <span
        className={`${styles.icon} ${styles.iconDimmed}`}
        data-element={unit.element ?? undefined}
        role="img"
        aria-label={`${label}, cannot be picked`}
      >
        {face}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={styles.icon}
      data-element={unit.element ?? undefined}
      aria-label={label}
    >
      {face}
    </Link>
  );
}
