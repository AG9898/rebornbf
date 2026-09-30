import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import menu from "../../../components/menu/menu.module.css";
import { textBoxStyle } from "../../../components/menu/text-box.ts";
import { UiImage } from "../../../components/menu/UiImage.tsx";
import { THUMB_ART_SIZE } from "../../../components/menu/ui-assets.ts";
import {
  levelLabel,
  nextUnitSort,
  type OwnedUnitView,
  UNIT_SORT_LABELS,
  type UnitSortKey,
} from "../../../lib/units/owned-units.ts";
import styles from "./units.module.css";

/**
 * The Units list as the original's All Units (M3-03E, ART_GUIDE → UI → Units, Squad, and Unit
 * detail screens): title bar, a five-column grid of element-framed thumbs over `bg-olive`, and
 * the help ticker. Presentational only; `page.tsx` reads the rows.
 */
export function UnitsList({
  units,
  party,
  sort,
  failed,
}: {
  /** The player's units, already sorted by `sort`. */
  units: readonly OwnedUnitView[];
  /** `owned_units` ids that sit in any saved squad; they show PARTY. */
  party: ReadonlySet<string>;
  sort: UnitSortKey;
  /** The rows could not be read. */
  failed: boolean;
}): ReactNode {
  return (
    <div className={styles.listPage}>
      <TitleBar sort={sort} count={failed ? null : units.length} />

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
                <UnitIcon unit={unit} inParty={party.has(unit.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className={menu.ticker}>Select a unit to view its details.</p>
    </div>
  );
}

/** Back, the "All Units" title plate with its sort line, the Sort button, and the count plate. */
function TitleBar({ sort, count }: { sort: UnitSortKey; count: number | null }): ReactNode {
  const next = nextUnitSort(sort);
  return (
    <header className={styles.titleBar}>
      <Link href="/home" className={`${styles.pill} ${styles.backButton}`}>
        <span className={styles.outline}>Back</span>
      </Link>
      <div className={styles.titlePlate}>
        <UiImage name="title-plate" className={styles.titlePlateArt} />
        <div className={styles.titleText} style={textBoxStyle("title-plate")}>
          <h1 className={styles.outline}>All Units</h1>
          <span className={`${styles.sortLine} ${styles.outline}`}>
            Sort: {UNIT_SORT_LABELS[sort]}
          </span>
        </div>
      </div>
      <Link
        href={next === "rarity" ? "/units" : `/units?sort=${next}`}
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

/** One grid icon: the form's thumb in its element frame, the level across the bottom, PARTY on top. */
function UnitIcon({ unit, inParty }: { unit: OwnedUnitView; inParty: boolean }): ReactNode {
  const level = levelLabel(unit);
  return (
    <Link
      href={`/units/${unit.id}`}
      className={styles.icon}
      data-element={unit.element ?? undefined}
      aria-label={`${unit.name}, ${unit.rarityLabel}, ${level}${inParty ? ", in a squad" : ""}`}
    >
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
      <span className={`${styles.level} ${styles.outline}`}>{level}</span>
    </Link>
  );
}
