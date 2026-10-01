import Link from "next/link";
import type { ReactNode } from "react";
import menu from "../../../../components/menu/menu.module.css";
import { textBoxStyle } from "../../../../components/menu/text-box.ts";
import { UiImage } from "../../../../components/menu/UiImage.tsx";
import { UnitIconFace, unitIconLabel } from "../../../../components/units/UnitIconFace.tsx";
import {
  nextUnitSort,
  UNIT_SORT_LABELS,
  type UnitSortKey,
} from "../../../../lib/units/owned-units.ts";
import {
  pickHref,
  UNIT_HUB_PATH,
  UNIT_PICK_TEXT,
  type UnitPickMode,
  unitListHref,
} from "../../../../lib/units/unit-hub.ts";
import { type CollectionEntry, collectionHref } from "../../../../lib/units/unit-stacks.ts";
import styles from "../units.module.css";

/**
 * The Units list as the original's All Units (M3-03E, ART_GUIDE → UI → Units, Squad, and Unit
 * detail screens): title bar, a five-column grid of element-framed thumbs over `bg-olive`, and
 * the help ticker. A stack of untouched copies (M4-05C) is one tile with a ×N badge. Presentational
 * only; `page.tsx` reads the rows. In a pick mode (M4-06B) the title names the action, units that
 * cannot be picked are dimmed, and a tap opens the action's screen.
 */
export function UnitsList({
  units,
  total,
  party,
  sort,
  pick,
  failed,
}: {
  /** The player's owned rows and stacks, already sorted by `sort`. */
  units: readonly CollectionEntry[];
  /** Units owned, counting every stacked copy. */
  total: number;
  /** `owned_units` ids that sit in any saved squad; they show PARTY. */
  party: ReadonlySet<string>;
  sort: UnitSortKey;
  /** The pick mode (`?pick=`), or null for the plain list. */
  pick: UnitPickMode | null;
  /** The rows could not be read. */
  failed: boolean;
}): ReactNode {
  return (
    <div className={styles.listPage}>
      <TitleBar sort={sort} pick={pick} count={failed ? null : total} />

      <div className={styles.list}>
        {failed ? (
          <section className={menu.panel}>
            <p className={menu.panelText}>Your units could not be loaded. Try again shortly.</p>
          </section>
        ) : units.length === 0 ? (
          <section className={menu.panel}>
            <p className={menu.panelText}>
              You have no units yet. Your starters join you as you clear the story.
            </p>
            <Link href="/home" className={menu.panelLink}>
              Back to Home
            </Link>
          </section>
        ) : (
          <ul className={styles.grid}>
            {units.map((unit) => (
              <li key={unit.id}>
                <UnitIcon
                  unit={unit}
                  href={pick ? pickHref(unit, pick) : collectionHref(unit)}
                  inParty={unit.stackCount === null && party.has(unit.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className={menu.ticker}>
        {pick ? UNIT_PICK_TEXT[pick].ticker : "Select a unit to view its details."}
      </p>
    </div>
  );
}

/**
 * Back to the Unit hub, the title plate ("All Units", or the pick mode's action) with its sort
 * line, the Sort button, and the count plate.
 */
function TitleBar({
  sort,
  pick,
  count,
}: {
  sort: UnitSortKey;
  pick: UnitPickMode | null;
  count: number | null;
}): ReactNode {
  const next = nextUnitSort(sort);
  return (
    <header className={styles.titleBar}>
      <Link href={UNIT_HUB_PATH} className={`${styles.pill} ${styles.backButton}`}>
        <span className={styles.outline}>Back</span>
      </Link>
      <div className={styles.titlePlate}>
        <UiImage name="title-plate" className={styles.titlePlateArt} />
        <div className={styles.titleText} style={textBoxStyle("title-plate")}>
          <h1 className={styles.outline}>{pick ? UNIT_PICK_TEXT[pick].title : "All Units"}</h1>
          <span className={`${styles.sortLine} ${styles.outline}`}>
            Sort: {UNIT_SORT_LABELS[sort]}
          </span>
        </div>
      </div>
      <Link
        href={unitListHref(next, pick)}
        className={`${styles.pill} ${styles.sortButton}`}
        aria-label={`Sort by ${UNIT_SORT_LABELS[next]}`}
        title={`Sort by ${UNIT_SORT_LABELS[next]}`}
        replace
      >
        <span className={styles.outline}>Sort</span>
      </Link>
      <div className={`${styles.pill} ${styles.countPlate}`}>
        <span className={`${styles.countLabel} ${styles.outline}`}>Units</span>
        <span className={`${styles.countValue} ${styles.outline}`}>{count ?? "–"}</span>
      </div>
    </header>
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
