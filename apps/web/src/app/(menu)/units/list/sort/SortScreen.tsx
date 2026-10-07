"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CSSProperties, type ReactNode, useState } from "react";
import kit from "../../../../../components/menu/kit.module.css";
import { OriginalImage } from "../../../../../components/menu/OriginalImage.tsx";
import { OriginalButton, OriginalTicker } from "../../../../../components/menu/OriginalKit.tsx";
import type { OriginalAsset } from "../../../../../lib/original/original-assets.ts";
import type { UnitSortKey } from "../../../../../lib/units/owned-units.ts";
import {
  allFilterKeys,
  FILTER_TAB_ASSETS as F,
  FILTER_BASE_SIZE,
  FILTER_BASES,
  FILTER_ROWS,
  FILTER_SCROLL_HEIGHT,
  type FilterOption,
  filterFromSelection,
  filterLabelAsset,
  optionKey,
  selectionFromFilter,
  type UnitFilter,
  unitListFilterHref,
} from "../../../../../lib/units/unit-filter.ts";
import type { UnitPickMode } from "../../../../../lib/units/unit-hub.ts";
import {
  SORT_SCREEN_ASSETS as A,
  SORT_OPTION_BASE,
  SORT_OPTIONS,
  type SortOption,
  sortLabelAsset,
} from "../../../../../lib/units/unit-list-screen.ts";
import list from "../unit-list.module.css";

type Tab = "sort" | "filter";

/**
 * The original's sort screen over the header (M8-04, M8-04_1; positions from
 * art/original/layouts/unit_sort.json and unit_filter.json): Back, the Sort and Filter tabs, and
 * the ticker. The Sort tab is a 3×5 grid of sort keys with Ascending / Select / Descending; the
 * Filter tab is the original's scrolled option rows with Clear Selection / Select / Select All.
 * Select opens the list with the chosen sort and filter, Back with neither changed. Keys and
 * filters BFR has no data for, and the fixed sort order, are disabled ("Coming soon").
 */
export function SortScreen({
  sort,
  pick,
  filter,
}: {
  sort: UnitSortKey;
  pick: UnitPickMode | null;
  filter: UnitFilter;
}): ReactNode {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("sort");
  const [chosen, setChosen] = useState<UnitSortKey>(sort);
  const [lit, setLit] = useState<ReadonlySet<string>>(() => selectionFromFilter(filter));
  const select = () => router.replace(unitListFilterHref(chosen, pick, filterFromSelection(lit)));
  const toggle = (key: string) =>
    setLit((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  return (
    <div className={list.sortPage}>
      <div className={list.sortBoard}>
        <OriginalImage asset={A.tabBase} className={list.tabBase} />
        <Link
          href={unitListFilterHref(sort, pick, filter)}
          replace
          className={`${kit.button} ${list.sortBack}`}
          aria-label="Back"
        >
          <OriginalImage asset={A.back[0]} className={kit.normal} />
          <OriginalImage asset={A.back[1]} className={kit.pressed} />
        </Link>
        <TabButton
          label="Sort"
          lit={tab === "sort"}
          art={[F.sortTabLit, F.sortTab]}
          className={list.sortTab}
          onSelect={() => setTab("sort")}
        />
        <TabButton
          label="Filter"
          lit={tab === "filter"}
          art={[F.filterTabLit, F.filterTab]}
          className={list.filterTab}
          onSelect={() => setTab("filter")}
        />

        {tab === "sort" ? (
          <>
            <ul className={list.options} aria-label="Sort by">
              {SORT_OPTIONS.map((option, i) => (
                <li key={option.label}>
                  <SortOptionButton
                    option={option}
                    selected={option.sort !== null && option.sort === chosen}
                    onSelect={setChosen}
                    style={{
                      left: `calc(var(--u) * ${8 + 204 * (i % 3)})`,
                      top: `calc(var(--u) * ${218 + 120 * Math.floor(i / 3)})`,
                    }}
                  />
                </li>
              ))}
            </ul>
            <span
              className={`${list.order} ${list.ascending}`}
              role="img"
              aria-label="Ascending"
              aria-disabled="true"
              title="Coming soon"
            >
              <OriginalImage asset={A.orderLit} />
              <OriginalImage asset={A.ascending} />
            </span>
            <span
              className={`${list.order} ${list.descending}`}
              role="img"
              aria-label="Descending"
              aria-disabled="true"
              title="Coming soon"
            >
              <OriginalImage asset={A.orderDim} />
              <OriginalImage asset={A.descending} />
            </span>
          </>
        ) : (
          <>
            <div className={list.filterScroll}>
              <ul
                className={list.filterRows}
                style={{ height: `calc(var(--u) * ${FILTER_SCROLL_HEIGHT})` }}
                aria-label="Filter by"
              >
                {FILTER_ROWS.flatMap((row) =>
                  row.options.map((option) => (
                    <li key={option.label}>
                      <FilterOptionButton
                        option={option}
                        lit={
                          option.group !== null &&
                          option.value !== null &&
                          lit.has(optionKey(option.group, option.value))
                        }
                        onToggle={toggle}
                        style={{
                          left: `calc(var(--u) * ${option.x})`,
                          top: `calc(var(--u) * ${row.y})`,
                        }}
                      />
                    </li>
                  )),
                )}
              </ul>
            </div>
            <OriginalButton
              size="sub_s_r_btn"
              className={list.clearSelection}
              onClick={() => setLit(new Set())}
            >
              Clear Selection
            </OriginalButton>
            <OriginalButton
              size="sub_s_r_btn"
              className={list.selectAll}
              onClick={() => setLit(allFilterKeys())}
            >
              Select All
            </OriginalButton>
          </>
        )}

        <OriginalButton size="sub_m_btn" className={list.select} onClick={select}>
          Select
        </OriginalButton>
        <OriginalImage asset={A.divider} className={list.divider} />
      </div>
      <OriginalTicker>
        {tab === "sort" ? "You can sort Units here." : "You can filter Units here."}
      </OriginalTicker>
    </div>
  );
}

/** A header tab: the lit piece while open, the dim piece (a button) otherwise. */
function TabButton({
  label,
  lit,
  art,
  className,
  onSelect,
}: {
  label: string;
  lit: boolean;
  art: readonly [lit: OriginalAsset, dim: OriginalAsset];
  className: string | undefined;
  onSelect: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      className={`${list.tab} ${className}`}
      aria-pressed={lit}
      onClick={onSelect}
    >
      <OriginalImage asset={lit ? art[0] : art[1]} alt={label} />
    </button>
  );
}

/**
 * One filter option: lit base and label while it is in the filter, dim otherwise; held, it shows
 * the state a tap gives. An option with no BFR filter is a disabled span.
 */
function FilterOptionButton({
  option,
  lit,
  onToggle,
  style,
}: {
  option: FilterOption;
  lit: boolean;
  onToggle: (key: string) => void;
  style: CSSProperties;
}): ReactNode {
  const [width, height] = FILTER_BASE_SIZE[option.base];
  const box: CSSProperties = {
    ...style,
    width: `calc(var(--u) * ${width})`,
    height: `calc(var(--u) * ${height})`,
  };
  const labelClass = option.small ? list.filterSmallLabel : undefined;
  const pieces = (state: boolean, cls?: string) => (
    <>
      <OriginalImage asset={FILTER_BASES[option.base][state ? 0 : 1]} className={cls} />
      <OriginalImage
        asset={filterLabelAsset(option, state)}
        className={[cls, labelClass].filter(Boolean).join(" ")}
      />
    </>
  );
  const { group, value } = option;
  if (group === null || value === null) {
    return (
      <span
        className={`${list.filterOption} ${list.filterDisabled}`}
        style={box}
        role="img"
        aria-label={option.label}
        aria-disabled="true"
        title="Coming soon"
      >
        {pieces(false)}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={list.filterOption}
      style={box}
      aria-label={option.label}
      aria-pressed={lit}
      onClick={() => onToggle(optionKey(group, value))}
    >
      {pieces(lit, kit.normal)}
      {pieces(!lit, kit.pressed)}
    </button>
  );
}

/**
 * One sort key on `sub_m_option_btn`: lit base and label when selected, dim otherwise (lit while
 * held). A key with no BFR sort is a disabled span.
 */
function SortOptionButton({
  option,
  selected,
  onSelect,
  style,
}: {
  option: SortOption;
  selected: boolean;
  onSelect: (sort: UnitSortKey) => void;
  style: CSSProperties;
}): ReactNode {
  const base = selected ? SORT_OPTION_BASE.on : SORT_OPTION_BASE.off;
  const art = option.art;
  const face = (
    <>
      <OriginalImage asset={base.normal} className={kit.normal} />
      <OriginalImage asset={base.pressed} className={kit.pressed} />
      {art ? (
        <>
          <OriginalImage asset={sortLabelAsset(art, selected)} className={kit.normal} />
          <OriginalImage asset={sortLabelAsset(art, true)} className={kit.pressed} />
        </>
      ) : (
        <span className={`${list.optionCaption} ${kit.text}`}>{option.label}</span>
      )}
    </>
  );
  const sort = option.sort;
  if (sort === null) {
    return (
      <span
        className={list.option}
        style={style}
        role="img"
        aria-label={option.label}
        aria-disabled="true"
        title="Coming soon"
      >
        <OriginalImage asset={base.normal} />
        {art ? <OriginalImage asset={sortLabelAsset(art, false)} /> : null}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={list.option}
      style={style}
      aria-label={option.label}
      aria-pressed={selected}
      onClick={() => onSelect(sort)}
    >
      {face}
    </button>
  );
}
