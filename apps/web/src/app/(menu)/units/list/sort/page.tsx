import type { Metadata } from "next";
import type { ReactNode } from "react";
import { parseUnitSort } from "../../../../../lib/units/owned-units.ts";
import { parseUnitFilter } from "../../../../../lib/units/unit-filter.ts";
import { parseUnitPick } from "../../../../../lib/units/unit-hub.ts";
import { SortScreen } from "./SortScreen.tsx";

export const metadata: Metadata = { title: "Sort Units · BFR" };

/**
 * The Units list's sort screen, the original's Sort tab (M8-04; ART_GUIDE → UI → Units list and
 * sort screen), opened by the list's Filter button. It keeps the list's `?sort=`, `?pick=`, and filter
 * parameters (M8-04_1); Select returns to the list with the chosen sort and filter, Back without them. Protected by `src/proxy.ts`; it reads
 * no rows.
 */
export default async function UnitSortPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  return (
    <SortScreen
      sort={parseUnitSort(params.sort)}
      pick={parseUnitPick(params.pick)}
      filter={parseUnitFilter(params)}
    />
  );
}
