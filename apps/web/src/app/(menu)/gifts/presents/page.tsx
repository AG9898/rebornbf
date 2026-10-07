import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import kit from "../../../../components/menu/kit.module.css";
import { OriginalImage } from "../../../../components/menu/OriginalImage.tsx";
import { OriginalTicker, OriginalTitleBar } from "../../../../components/menu/OriginalKit.tsx";
import {
  GIFTS_PATH,
  LOGIN_CALENDAR_COLUMNS,
  LOGIN_LOG_COLUMNS,
  type LoginCalendarRow,
  type LoginLogRow,
  PRESENT_BUTTONS,
  PRESENT_ROW_FRAME,
  PRESENT_SEPARATOR,
  PRESENT_THUMB_BG,
  PRESENT_THUMB_FRAME,
  PRESENT_THUMBS,
  PRESENTS_PATH,
  type PresentRow,
  presentRows,
  presentsTicker,
  utcDate,
} from "../../../../lib/gifts/gift-screen.ts";
import type { OriginalAsset } from "../../../../lib/original/original-assets.ts";
import { createSupabaseServerClient } from "../../../../lib/supabase/server.ts";
import styles from "../gifts.module.css";
import { receiveLoginGift } from "./actions.ts";

export const metadata: Metadata = { title: "Presents · BFR" };

const piece = (stem: string, state: 1 | 2): OriginalAsset => `${stem}${state}.png` as OriginalAsset;

/**
 * The Present Box (M8-12, RESOLVED-98; ART_GUIDE -> UI -> Gifts): the original's Presents list at
 * the positions in art/original/layouts/gifts_presents.json. BFR's gifts are its login calendar
 * steps, read under RLS (`login_calendar`, `login_reward` rows of `wallet_log` and
 * `summon_ticket_log`): today's unclaimed step has Receive, and Receive All claims it too, both
 * through `claim_login_reward()`. Steps already received follow, newest first.
 */
export default async function PresentsPage({
  searchParams,
}: {
  searchParams: Promise<{ received?: string | string[] }>;
}): Promise<ReactNode> {
  const received = (await searchParams).received === "1";
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const userId = claims?.claims.sub;
  if (!supabase || !userId) redirect(`/sign-in?next=${PRESENTS_PATH}`);
  const [calendar, gems, tickets] = await Promise.all([
    supabase
      .from("login_calendar")
      .select(LOGIN_CALENDAR_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle<LoginCalendarRow>(),
    supabase
      .from("wallet_log")
      .select(LOGIN_LOG_COLUMNS)
      .eq("user_id", userId)
      .eq("currency", "gems")
      .eq("reason", "login_reward")
      .order("created_at", { ascending: false })
      .limit(30)
      .overrideTypes<LoginLogRow[], { merge: false }>(),
    supabase
      .from("summon_ticket_log")
      .select(LOGIN_LOG_COLUMNS)
      .eq("user_id", userId)
      .eq("reason", "login_reward")
      .order("created_at", { ascending: false })
      .limit(30)
      .overrideTypes<LoginLogRow[], { merge: false }>(),
  ]);
  const failed = Boolean(calendar.error || gems.error || tickets.error);
  const rows = failed
    ? []
    : presentRows(calendar.data ?? null, gems.data ?? [], tickets.data ?? [], utcDate(new Date()));
  const canReceive = rows.some((row) => row.pending);

  return (
    <div className={kit.page}>
      <OriginalTitleBar
        title="Presents"
        backHref={GIFTS_PATH}
        action={<ReceiveAll enabled={canReceive} />}
      />
      <div className={kit.body}>
        {rows.length > 0 ? (
          <ul className={styles.list} aria-label="Presents">
            {rows.map((row) => (
              <PresentItem key={row.key} row={row} />
            ))}
          </ul>
        ) : null}
      </div>
      <OriginalTicker>
        {failed
          ? "Your gifts could not be loaded. Try again shortly."
          : presentsTicker(rows, received)}
      </OriginalTicker>
    </div>
  );
}

function ReceiveAll({ enabled }: { enabled: boolean }): ReactNode {
  const face = (
    <>
      <OriginalImage asset={piece("common/button/sub_s_btn", 1)} className={kit.normal} />
      <OriginalImage asset={piece("common/button/sub_s_btn", 2)} className={kit.pressed} />
      <OriginalImage
        asset={piece(PRESENT_BUTTONS.receiveAllLabel, 1)}
        className={`${kit.normal} ${kit.layer}`}
      />
      <OriginalImage
        asset={piece(PRESENT_BUTTONS.receiveAllLabel, 2)}
        className={`${kit.pressed} ${kit.layer}`}
      />
    </>
  );
  if (!enabled) {
    return (
      <span
        className={`${kit.button} ${styles.receiveAll}`}
        role="img"
        aria-label="Receive All"
        aria-disabled="true"
        title="No gifts to receive"
      >
        {face}
      </span>
    );
  }
  return (
    <form action={receiveLoginGift} className={styles.form}>
      <button
        type="submit"
        className={`${kit.button} ${styles.receiveAll}`}
        aria-label="Receive All"
      >
        {face}
      </button>
    </form>
  );
}

function PresentItem({ row }: { row: PresentRow }): ReactNode {
  return (
    <li className={styles.row}>
      <OriginalImage asset={PRESENT_ROW_FRAME} className={styles.rowFrame} />
      <OriginalImage asset={PRESENT_THUMB_BG} className={styles.thumb} />
      <OriginalImage asset={PRESENT_THUMBS[row.kind]} className={styles.thumb} />
      <OriginalImage asset={PRESENT_THUMB_FRAME} className={styles.thumb} />
      <span className={`${styles.date} ${kit.text}`}>{row.date}</span>
      <span className={`${styles.name} ${kit.text}`}>{row.name}</span>
      <OriginalImage asset={PRESENT_SEPARATOR} className={styles.separator} />
      <span className={`${styles.note} ${kit.text}`}>{row.note}</span>
      {row.pending ? (
        <form action={receiveLoginGift} className={styles.form}>
          <button type="submit" className={`${kit.button} ${styles.receive}`} aria-label="Receive">
            <OriginalImage asset={piece(PRESENT_BUTTONS.receiveBase, 1)} className={kit.normal} />
            <OriginalImage asset={piece(PRESENT_BUTTONS.receiveBase, 2)} className={kit.pressed} />
            <OriginalImage
              asset={piece(PRESENT_BUTTONS.receiveLabel, 1)}
              className={`${kit.normal} ${kit.layer}`}
            />
            <OriginalImage
              asset={piece(PRESENT_BUTTONS.receiveLabel, 2)}
              className={`${kit.pressed} ${kit.layer}`}
            />
          </button>
        </form>
      ) : (
        <span className={`${styles.received} ${kit.text}`}>Received</span>
      )}
    </li>
  );
}
