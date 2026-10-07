import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import kit from "../../../../components/menu/kit.module.css";
import { OriginalImage } from "../../../../components/menu/OriginalImage.tsx";
import { OriginalTitleBar } from "../../../../components/menu/OriginalKit.tsx";
import {
  ITEM_MANAGE_PATH,
  ITEM_MENU_PATH,
  type ItemStockRow,
  itemManageHref,
} from "../../../../lib/items/item-screen.ts";
import { itemLoadoutKey } from "../../../../lib/quests/item-loadout.ts";
import { parseSquadSlot, stepSquadSlot } from "../../../../lib/squad/squad-editor.ts";
import { SIGN_IN_PATH } from "../../../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../../../lib/supabase/server.ts";
import styles from "../items.module.css";
import { ManageItems } from "./ManageItems.tsx";

export const metadata: Metadata = { title: "Manage Items · BFR" };

/**
 * Manage Items, the original's battle-item loadout screen (M8-10_1; ART_GUIDE -> UI -> Items):
 * five slots in `item_edit/item_frame_edit` with Fill Up / Reset. It edits the loadout quest
 * preparation remembers per squad (`itemLoadoutKey`, browser storage) against `owned_items` read
 * under RLS. It never writes inventory: start_battle checks and debits the items when a quest
 * begins. `?slot=` picks the squad (0-9). Protected by `src/proxy.ts`.
 */
export default async function ManageItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ slot?: string | string[] }>;
}): Promise<ReactNode> {
  const slot = parseSquadSlot((await searchParams).slot);
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const userId = claims?.claims.sub;
  if (!supabase || !userId) redirect(`${SIGN_IN_PATH}?next=${ITEM_MANAGE_PATH}`);

  const { data, error } = await supabase
    .from("owned_items")
    .select("item_id, count")
    .eq("user_id", userId)
    .overrideTypes<ItemStockRow[], { merge: false }>();

  const storageKey = itemLoadoutKey(userId, slot);
  return (
    <div className={`${kit.page} ${styles.town}`}>
      <OriginalTitleBar title="Manage Items" backHref={ITEM_MENU_PATH} />
      <ManageItems
        key={storageKey}
        storageKey={storageKey}
        stock={error ? null : (data ?? [])}
        squad={
          <nav aria-label="Squad" className={styles.squadRow}>
            <Link
              href={itemManageHref(stepSquadSlot(slot, -1))}
              className={`${styles.squadArrow} ${styles.squadArrowL}`}
              aria-label="Previous squad"
            >
              <OriginalImage asset="common/page_feed_arrow_l.png" />
            </Link>
            <span className={`${styles.squadName} ${kit.text}`}>Squad {slot + 1}</span>
            <Link
              href={itemManageHref(stepSquadSlot(slot, 1))}
              className={`${styles.squadArrow} ${styles.squadArrowR}`}
              aria-label="Next squad"
            >
              <OriginalImage asset="common/page_feed_arrow_r.png" />
            </Link>
          </nav>
        }
      />
    </div>
  );
}
