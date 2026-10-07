import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import kit from "../../../../components/menu/kit.module.css";
import { OriginalTitleBar } from "../../../../components/menu/OriginalKit.tsx";
import {
  ITEM_LIST_PATH,
  ITEM_MENU_PATH,
  type ItemStockRow,
  itemEntries,
} from "../../../../lib/items/item-screen.ts";
import { SIGN_IN_PATH } from "../../../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../../../lib/supabase/server.ts";
import styles from "../items.module.css";
import { ItemList } from "./ItemList.tsx";

export const metadata: Metadata = { title: "All Items · BFR" };

/**
 * All Items, the original's item storage grid (M8-10; ART_GUIDE -> UI -> Items): the player's
 * `owned_items` rows, read under RLS, as item-framed thumbs with counts and names. Tapping one
 * shows its details. Read-only: item counts change only through server RPCs. Protected by
 * `src/proxy.ts`.
 */
export default async function ItemListPage(): Promise<ReactNode> {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const userId = claims?.claims.sub;
  if (!supabase || !userId) redirect(`${SIGN_IN_PATH}?next=${ITEM_LIST_PATH}`);

  const { data, error } = await supabase
    .from("owned_items")
    .select("item_id, count")
    .eq("user_id", userId)
    .overrideTypes<ItemStockRow[], { merge: false }>();

  return (
    <div className={`${kit.page} ${styles.town} ${styles.townList}`}>
      <OriginalTitleBar title="All Items" backHref={ITEM_MENU_PATH} />
      <ItemList items={error ? null : itemEntries(data ?? [])} />
    </div>
  );
}
