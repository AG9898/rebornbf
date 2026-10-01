import { ItemSchema } from "@bfr/data";
import bitterleaf from "@bfr/data/content/items/bitterleaf.json";
import brightTonic from "@bfr/data/content/items/bright-tonic.json";
import dewTonic from "@bfr/data/content/items/dew-tonic.json";
import grandTonic from "@bfr/data/content/items/grand-tonic.json";
import rekindleAsh from "@bfr/data/content/items/rekindle-ash.json";
import valorDraught from "@bfr/data/content/items/valor-draught.json";

export const BATTLE_ITEMS = [
  bitterleaf,
  brightTonic,
  dewTonic,
  grandTonic,
  rekindleAsh,
  valorDraught,
].map((json) => ItemSchema.parse(json));
export type ItemStock = { item_id: string; count: number };
export type LoadoutEntry = { item: string; count: number };

/** Strict action validation; inventory is independently checked/debited by start_battle. */
export function parseItemLoadout(value: unknown): LoadoutEntry[] | null {
  if (!Array.isArray(value) || value.length > 5) return null;
  const result: LoadoutEntry[] = [];
  for (const entry of value) {
    if (
      !entry ||
      typeof entry !== "object" ||
      Object.keys(entry).some((key) => key !== "item" && key !== "count") ||
      !BATTLE_ITEMS.some((item) => item.id === entry.item) ||
      !Number.isInteger(entry.count) ||
      entry.count < 1 ||
      entry.count > 10 ||
      result.some((item) => item.item === entry.item)
    )
      return null;
    result.push({ item: entry.item, count: entry.count });
  }
  return result;
}

/** Remembered slots are untrusted convenience data: remove spent/unknown/duplicate items. */
export function restoreItemSlots(
  value: unknown,
  stock: readonly ItemStock[],
): (LoadoutEntry | null)[] {
  const seen = new Set<string>();
  return Array.from({ length: 5 }, (_, index) => {
    const entry = Array.isArray(value) ? value[index] : null;
    const parsed = parseItemLoadout([entry]);
    const item = parsed?.[0];
    const owned = item ? (stock.find((row) => row.item_id === item.item)?.count ?? 0) : 0;
    if (!item || owned < 1 || seen.has(item.item)) return null;
    seen.add(item.item);
    return { item: item.item, count: Math.min(item.count, owned, 10) };
  });
}

export function itemLoadoutKey(userId: string, slot: number): string {
  return `bfr:item-loadout:${userId}:${slot}`;
}
