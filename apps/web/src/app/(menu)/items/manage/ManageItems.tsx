"use client";

import { type ReactNode, useEffect, useState } from "react";
import { itemIcon } from "../../../../components/menu/item-icon.ts";
import kit from "../../../../components/menu/kit.module.css";
import { OriginalImage } from "../../../../components/menu/OriginalImage.tsx";
import {
  OriginalButton,
  OriginalTicker,
  OriginalWindow,
} from "../../../../components/menu/OriginalKit.tsx";
import { UiImage } from "../../../../components/menu/UiImage.tsx";
import {
  ITEM_MANAGE_BASE,
  ITEM_MANAGE_BUTTONS,
  ITEM_MANAGE_FRAME,
  ITEM_PICK_SELECT,
  ITEM_THUMB_BASE,
  ITEM_THUMB_FRAME,
  type ItemManageButton,
  type ItemStockRow,
} from "../../../../lib/items/item-screen.ts";
import type { OriginalAsset } from "../../../../lib/original/original-assets.ts";
import {
  BATTLE_ITEMS,
  fillUpSlots,
  type ItemSlots,
  type LoadoutEntry,
  restoreItemSlots,
  setSlot,
  slotChoices,
  slotMax,
} from "../../../../lib/quests/item-loadout.ts";
import styles from "../items.module.css";

const SLOT_KEYS = ["first", "second", "third", "fourth", "fifth"] as const;

function piece(stem: string, state: 1 | 2): OriginalAsset {
  return `${stem}${state}.png` as OriginalAsset;
}

/** A battle item's 102 px thumb: backing, BFR icon, green battle-item frame. */
function Thumb({ itemId }: { itemId: string }): ReactNode {
  const icon = itemIcon(itemId);
  return (
    <span className={styles.thumb} aria-hidden>
      <OriginalImage asset={ITEM_THUMB_BASE} className={kit.layer} />
      {icon ? <UiImage name={icon} className={styles.icon} /> : null}
      <OriginalImage asset={ITEM_THUMB_FRAME.battle} className={kit.layer} />
    </span>
  );
}

/** A `sub_m_btn` with an original label overlay; pressed art swaps by opacity while held. */
function ManageButton({
  button,
  onClick,
  className,
}: {
  button: ItemManageButton;
  onClick: (() => void) | null;
  className: string;
}): ReactNode {
  const face = (
    <>
      <OriginalImage asset={piece(ITEM_MANAGE_BASE, 1)} className={`${kit.normal} ${kit.layer}`} />
      <OriginalImage asset={piece(ITEM_MANAGE_BASE, 2)} className={`${kit.pressed} ${kit.layer}`} />
      <OriginalImage asset={piece(button.art, 1)} className={`${kit.normal} ${kit.layer}`} />
      <OriginalImage asset={piece(button.art, 2)} className={`${kit.pressed} ${kit.layer}`} />
    </>
  );
  const cls = `${kit.button} ${styles.manageButton} ${className}`;
  if (!onClick) {
    return (
      <span
        className={cls}
        role="img"
        aria-label={button.label}
        aria-disabled="true"
        title="Coming soon"
      >
        {face}
      </span>
    );
  }
  return (
    <button type="button" className={cls} aria-label={button.label} onClick={onClick}>
      {face}
    </button>
  );
}

/**
 * The Manage Items body (M8-10_1): the five-slot frame, Fill Up / Reset, the disabled Village of
 * the Venturer and Synthesis, and a picker window for one slot. Edits are saved to the squad's
 * remembered loadout in browser storage, the same one quest preparation restores; `stock` is the
 * player's `owned_items` (null when the read failed). Nothing here writes inventory.
 */
export function ManageItems({
  storageKey,
  stock,
  squad,
}: {
  storageKey: string;
  stock: readonly ItemStockRow[] | null;
  /** The squad row (page arrows and "Squad N"), rendered on the server. */
  squad: ReactNode;
}): ReactNode {
  const owned = stock ?? [];
  const [slots, setSlots] = useState<ItemSlots>(Array(5).fill(null));
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<LoadoutEntry | null>(null);

  useEffect(() => {
    let value: unknown = null;
    try {
      value = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    } catch {
      /* Storage is optional. */
    }
    setSlots(restoreItemSlots(value, stock ?? []));
    setReady(true);
  }, [storageKey, stock]);

  function save(next: ItemSlots): void {
    setSlots(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Storage is optional. */
    }
  }

  function open(index: number): void {
    setEditing(index);
    setDraft(slots[index] ?? null);
  }

  function close(): void {
    setEditing(null);
    setDraft(null);
  }

  function commit(entry: LoadoutEntry | null): void {
    if (editing !== null) save(setSlot(slots, editing, entry));
    close();
  }

  const live = ready && stock !== null;
  const actions: Record<"fill" | "reset", () => void> = {
    fill: () => save(fillUpSlots(slots, owned)),
    reset: () => save(Array(5).fill(null)),
  };
  const choices = editing === null ? [] : slotChoices(slots, owned, editing);
  const draftItem = BATTLE_ITEMS.find((item) => item.id === draft?.item);
  const max = draft ? slotMax(owned, draft.item) : 0;
  const setCount = (count: number): void => {
    if (draft) setDraft({ item: draft.item, count: Math.max(1, Math.min(max, count)) });
  };

  const ticker =
    stock === null
      ? "Could not load your items. Try again later."
      : owned.every((row) => !BATTLE_ITEMS.some((item) => item.id === row.item_id && row.count > 0))
        ? "You have no battle items yet. Clear quests to find some."
        : "Select a slot to set the items this squad takes into battle.";

  return (
    <>
      <div className={kit.body}>
        <div className={styles.manageStage}>
          {squad}
          <OriginalImage asset={ITEM_MANAGE_FRAME.caption} className={styles.equipCaption} />
          <div className={styles.slotFrame}>
            <OriginalImage asset={ITEM_MANAGE_FRAME.backing} className={kit.layer} />
            <OriginalImage asset={ITEM_MANAGE_FRAME.frame} className={kit.layer} />
          </div>
          <ul className={styles.slots} aria-label="Battle item slots">
            {SLOT_KEYS.map((key, index) => {
              const entry = slots[index];
              const item = BATTLE_ITEMS.find((candidate) => candidate.id === entry?.item);
              const icon = item ? itemIcon(item.id) : null;
              return (
                <li key={key} className={styles[`slot${index}`]}>
                  <button
                    type="button"
                    className={styles.slot}
                    disabled={!live}
                    aria-label={
                      entry && item
                        ? `Item slot ${index + 1}: ${item.name}, ${entry.count}`
                        : `Empty item slot ${index + 1}`
                    }
                    onClick={() => open(index)}
                  >
                    {icon ? <UiImage name={icon} className={styles.slotIcon} /> : null}
                    {entry ? (
                      <span className={`${styles.slotCount} ${kit.text}`}>×{entry.count}</span>
                    ) : null}
                  </button>
                  {item ? (
                    <span className={`${styles.slotName} ${kit.text}`}>{item.name}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {ITEM_MANAGE_BUTTONS.map((button, index) => (
            <ManageButton
              key={button.label}
              button={button}
              onClick={button.action && live ? actions[button.action] : null}
              className={styles[`manageButton${index}`] ?? ""}
            />
          ))}
        </div>
      </div>
      {editing !== null ? (
        <div className={styles.detailCover}>
          <OriginalWindow variant="system" className={styles.picker}>
            <section aria-label={`Item slot ${editing + 1}`} className={styles.pickerBody}>
              <h2 className={`${styles.pickerTitle} ${kit.text}`}>Item Slot {editing + 1}</h2>
              {choices.length === 0 ? (
                <p className={styles.pickerNote}>No other owned battle items are free.</p>
              ) : (
                <ul className={styles.choices} aria-label="Owned battle items">
                  {choices.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={styles.choice}
                        aria-pressed={draft?.item === item.id}
                        aria-label={`${item.name}, ${owned.find((row) => row.item_id === item.id)?.count ?? 0} owned`}
                        onClick={() =>
                          setDraft(draft?.item === item.id ? draft : { item: item.id, count: 1 })
                        }
                      >
                        <Thumb itemId={item.id} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {draft && draftItem ? (
                <div className={styles.pickDetail}>
                  <p className={`${styles.pickName} ${kit.text}`}>{draftItem.name}</p>
                  <p className={styles.pickText}>
                    Owned ×{owned.find((row) => row.item_id === draft.item)?.count ?? 0} · up to{" "}
                    {max} in one slot
                  </p>
                  <div className={styles.countRow}>
                    <OriginalButton size="sub_sss_btn" onClick={() => setCount(1)}>
                      Min
                    </OriginalButton>
                    <OriginalButton size="sub_sss_btn" onClick={() => setCount(draft.count - 1)}>
                      −
                    </OriginalButton>
                    <output className={`${styles.countValue} ${kit.text}`} aria-label="Count">
                      {draft.count}
                    </output>
                    <OriginalButton size="sub_sss_btn" onClick={() => setCount(draft.count + 1)}>
                      +
                    </OriginalButton>
                    <OriginalButton size="sub_sss_btn" onClick={() => setCount(max)}>
                      Max
                    </OriginalButton>
                  </div>
                </div>
              ) : null}
              <div className={styles.pickerButtons}>
                {slots[editing] ? (
                  <OriginalButton size="sub_s_r_btn" onClick={() => commit(null)}>
                    Remove
                  </OriginalButton>
                ) : (
                  <span className={styles.pickerSpacer} />
                )}
                <OriginalButton size="sub_s_btn" onClick={close}>
                  Close
                </OriginalButton>
                <button
                  type="button"
                  className={`${kit.button} ${styles.selectButton}`}
                  aria-label="Select"
                  disabled={!draft}
                  onClick={() => commit(draft)}
                >
                  <OriginalImage
                    asset={piece("common/button/sub_s_btn", 1)}
                    className={`${kit.normal} ${kit.layer}`}
                  />
                  <OriginalImage
                    asset={piece("common/button/sub_s_btn", 2)}
                    className={`${kit.pressed} ${kit.layer}`}
                  />
                  <OriginalImage
                    asset={piece(ITEM_PICK_SELECT, 1)}
                    className={`${kit.normal} ${kit.layer}`}
                  />
                  <OriginalImage
                    asset={piece(ITEM_PICK_SELECT, 2)}
                    className={`${kit.pressed} ${kit.layer}`}
                  />
                </button>
              </div>
            </section>
          </OriginalWindow>
        </div>
      ) : null}
      <OriginalTicker>{ticker}</OriginalTicker>
    </>
  );
}
