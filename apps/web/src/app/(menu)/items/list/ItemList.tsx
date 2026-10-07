"use client";

import { type ReactNode, useState } from "react";
import kit from "../../../../components/menu/kit.module.css";
import { OriginalImage } from "../../../../components/menu/OriginalImage.tsx";
import {
  OriginalButton,
  OriginalTicker,
  OriginalWindow,
} from "../../../../components/menu/OriginalKit.tsx";
import { UiImage } from "../../../../components/menu/UiImage.tsx";
import {
  ITEM_THUMB_BASE,
  ITEM_THUMB_FRAME,
  type ItemEntry,
} from "../../../../lib/items/item-screen.ts";
import styles from "../items.module.css";

/** An item's 102 px thumb: backing, BFR icon, then the type-coloured original frame. */
function ItemThumb({ item }: { item: ItemEntry }): ReactNode {
  return (
    <span className={styles.thumb} aria-hidden>
      <OriginalImage asset={ITEM_THUMB_BASE} className={kit.layer} />
      {item.icon ? <UiImage name={item.icon} className={styles.icon} /> : null}
      <OriginalImage asset={ITEM_THUMB_FRAME[item.kind]} className={kit.layer} />
    </span>
  );
}

/**
 * The All Items grid (five columns, 126 x 113 px cells from screen (16, 300); layouts/
 * items_list.json) and the detail window a tap opens. `items` is null when the read failed.
 */
export function ItemList({ items }: { items: ItemEntry[] | null }): ReactNode {
  const [open, setOpen] = useState<ItemEntry | null>(null);
  const ticker =
    items === null
      ? "Could not load your items. Try again later."
      : items.length === 0
        ? "You have no items yet. Clear quests to find some."
        : "Select an Item to view its detailed information.";
  return (
    <>
      <div className={kit.body}>
        <ul className={styles.grid} aria-label="All items">
          {(items ?? []).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={styles.cell}
                aria-label={`${item.name}, ${item.count} owned`}
                onClick={() => setOpen(item)}
              >
                <ItemThumb item={item} />
                <span className={`${styles.count} ${kit.text}`}>×{item.count}</span>
                <span className={`${styles.name} ${kit.text}`}>{item.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {open ? (
        <div className={styles.detailCover}>
          <OriginalWindow variant="system" className={styles.detail}>
            <section aria-label={`${open.name} details`} className={styles.detailBody}>
              <ItemThumb item={open} />
              <h2 className={`${styles.detailName} ${kit.text}`}>{open.name}</h2>
              <p className={`${styles.detailKind} ${kit.text}`}>
                {open.kind === "battle" ? "Battle item" : "Material"} · Owned ×{open.count}
              </p>
              <p className={styles.detailText}>{open.description}</p>
              <OriginalButton
                size="sub_s_btn"
                onClick={() => setOpen(null)}
                className={styles.detailClose}
              >
                Close
              </OriginalButton>
            </section>
          </OriginalWindow>
        </div>
      ) : null}
      <OriginalTicker>{ticker}</OriginalTicker>
    </>
  );
}
