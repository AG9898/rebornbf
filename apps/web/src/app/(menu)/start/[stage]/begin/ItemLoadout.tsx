"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { itemIcon } from "../../../../../components/menu/item-icon.ts";
import { UiImage } from "../../../../../components/menu/UiImage.tsx";
import {
  BATTLE_ITEMS,
  type ItemStock,
  type LoadoutEntry,
  restoreItemSlots,
} from "../../../../../lib/quests/item-loadout.ts";
import styles from "../../start.module.css";

function BeginButton({ disabled }: { disabled: boolean }): ReactNode {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.begin} disabled={disabled || pending}>
      {pending ? "Starting…" : "Begin Quest"}
    </button>
  );
}

export function ItemLoadout({
  stock,
  storageKey,
  disabled,
  action,
}: {
  stock: readonly ItemStock[];
  storageKey: string;
  disabled: boolean;
  action: (data: FormData) => Promise<void>;
}): ReactNode {
  const [slots, setSlots] = useState<(LoadoutEntry | null)[]>(Array(5).fill(null));
  const [editing, setEditing] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let value: unknown = null;
    try {
      value = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    } catch {
      /* Storage is optional. */
    }
    setSlots(restoreItemSlots(value, stock));
    setReady(true);
  }, [storageKey, stock]);

  function update(entry: LoadoutEntry | null): void {
    const next = slots.map((current, index) => (index === editing ? entry : current));
    setSlots(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Storage is optional. */
    }
  }
  const selected = editing === null ? null : slots[editing];
  const choices = BATTLE_ITEMS.filter(
    (item) =>
      (stock.find((row) => row.item_id === item.id)?.count ?? 0) > 0 &&
      !slots.some((entry, index) => index !== editing && entry?.item === item.id),
  );
  const maxCount = Math.min(10, stock.find((row) => row.item_id === selected?.item)?.count ?? 0);
  return (
    <form action={action}>
      <button
        type="button"
        className={styles.manageItems}
        disabled={disabled || !ready}
        aria-expanded={editing !== null}
        onClick={() => setEditing(editing === null ? 0 : null)}
      >
        Manage Items
      </button>
      <section className={styles.items} aria-label="Battle items">
        {["first", "second", "third", "fourth", "fifth"].map((key, index) => {
          const entry = slots[index];
          const item = BATTLE_ITEMS.find((item) => item.id === entry?.item);
          const icon = item ? itemIcon(item.id) : null;
          return (
            <button
              type="button"
              key={key}
              disabled={disabled || !ready}
              aria-label={
                entry
                  ? `Item slot ${index + 1}: ${item?.name}, ${entry.count}`
                  : `Empty item slot ${index + 1}`
              }
              aria-pressed={editing === index}
              onClick={() => setEditing(index)}
            >
              <UiImage name="item-slot" />
              {icon ? <UiImage name={icon} className={styles.itemIcon} /> : null}
              <span>
                {item?.name ?? "Empty"}
                {entry ? ` ×${entry.count}` : ""}
              </span>
            </button>
          );
        })}
      </section>
      {editing !== null ? (
        <fieldset className={styles.itemPicker}>
          <legend>Item slot {editing + 1}</legend>
          <label>
            Battle item{" "}
            <select
              value={selected?.item ?? ""}
              onChange={(event) =>
                update(event.target.value ? { item: event.target.value, count: 1 } : null)
              }
            >
              <option value="">Empty</option>
              {choices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} (owned: {stock.find((row) => row.item_id === item.id)?.count})
                </option>
              ))}
            </select>
          </label>
          {selected ? (
            <label>
              Count{" "}
              <select
                value={selected.count}
                onChange={(event) =>
                  update({ item: selected.item, count: Number(event.target.value) })
                }
              >
                {Array.from({ length: maxCount }, (_, index) => index + 1).map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {choices.length === 0 ? <p>No other owned battle items available.</p> : null}
          <button type="button" onClick={() => setEditing(null)}>
            Done
          </button>
        </fieldset>
      ) : null}
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(slots.filter((entry) => entry !== null))}
      />
      <BeginButton disabled={disabled || !ready} />
    </form>
  );
}
