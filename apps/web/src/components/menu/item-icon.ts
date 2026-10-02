import { UI_ASSETS, type UiAsset } from "./ui-assets.ts";

/** The `item-<id>` UI piece for an item content ID (M6-10B), when one is exported. */
export function itemIcon(itemId: string): UiAsset | null {
  const name = `item-${itemId}`;
  return name in UI_ASSETS ? (name as UiAsset) : null;
}
