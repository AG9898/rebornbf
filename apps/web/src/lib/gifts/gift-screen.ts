/**
 * The Gifts screens (M8-12, RESOLVED-98; ART_GUIDE -> UI -> Gifts): the original's Rewards grid
 * (`/gifts`) and Present Box (`/gifts/presents`), at the positions in
 * art/original/layouts/gifts.json and gifts_presents.json. BFR's only gifts are its login calendar
 * steps (GAME_DESIGN §8 Login rewards, RESOLVED-68), so the Present Box lists today's unclaimed
 * step with a Receive button and the steps already received. Pure helpers; no I/O.
 */
import type { OriginalAsset } from "../original/original-assets.ts";

export const GIFTS_PATH = "/gifts";
export const PRESENTS_PATH = "/gifts/presents";

/**
 * The Rewards grid in the original's reading order; only Present Box has a BFR screen. `lines`
 * are the caption's line breaks as the original sets them; `small` captions shrink to fit two.
 */
export const REWARD_BUTTONS: readonly {
  label: string;
  lines: readonly string[];
  href: string | null;
  small?: boolean;
}[] = [
  { label: "Level Up Campaign", lines: ["Level Up", "Campaign"], href: null },
  {
    label: "Brave Points and Rewards",
    lines: ["Brave Points", "and Rewards"],
    href: null,
    small: true,
  },
  { label: "Present Box", lines: ["Present", "Box"], href: PRESENTS_PATH },
  { label: "Keys", lines: ["Keys"], href: null },
  { label: "Slots", lines: ["Slots"], href: null },
  { label: "Mystery Chest", lines: ["Mystery", "Chest"], href: null },
  { label: "Daily Spin", lines: ["Daily", "Spin"], href: null },
];

/** Button pairs without their state suffix (`1` normal, `2` pressed). */
export const PRESENT_BUTTONS = {
  /** The blue square Receive button: base and its baked English caption, both 112x90. */
  receiveBase: "common/button/sub_square1_btn",
  receiveLabel: "common/button/gift_do_recieve_btn_label",
  /** The title bar's Receive All caption, over the kit's `sub_s_btn`. */
  receiveAllLabel: "common/button/label/sub_s_btn_reward_receipt_label",
} as const;

export const PRESENT_ROW_FRAME: OriginalAsset = "common/list_frame1.png";
export const PRESENT_SEPARATOR: OriginalAsset = "common/list_frame0/separator.png";
export const PRESENT_THUMB_BG: OriginalAsset = "common/item_frame_bg.png";
export const PRESENT_THUMB_FRAME: OriginalAsset = "common/item_frame_0.png";

export type PresentKind = "gems" | "ticket";

export const PRESENT_THUMBS: Readonly<Record<PresentKind, OriginalAsset>> = {
  gems: "common/gem_thum.png",
  ticket: "summon_ticket_v2/anniversary_ticket_thum.png",
};

/** Every original piece the Gifts screens draw (for the asset-existence test). */
export const GIFT_SCREEN_ASSETS: readonly string[] = [
  ...[1, 2].flatMap((state) => Object.values(PRESENT_BUTTONS).map((b) => `${b}${state}.png`)),
  "common/button/sub_s_btn1.png",
  "common/button/sub_s_btn2.png",
  "common/button/main_s_btn1.png",
  "common/button/main_s_btn2.png",
  PRESENT_ROW_FRAME,
  PRESENT_SEPARATOR,
  PRESENT_THUMB_BG,
  PRESENT_THUMB_FRAME,
  ...Object.values(PRESENT_THUMBS),
];

/** The calendar's last day; it ends after this step. */
export const LOGIN_CALENDAR_DAYS = 30;

/**
 * What one calendar step grants. Mirrors `claim_login_reward()` (migration
 * 20261001120000_login_calendar.sql): day 1 is 30 gems and one free 10-pull ticket, days 2-30 are
 * 5 gems. The server grants; this only labels the unclaimed row.
 */
export function loginStepReward(day: number): { gems: number; tickets: number } {
  return day === 1 ? { gems: 30, tickets: 1 } : { gems: 5, tickets: 0 };
}

/** One row in the Present Box. */
export type PresentRow = {
  key: string;
  kind: PresentKind;
  name: string;
  note: string;
  /** The UTC date shown over the thumb: today for the pending step, the claim date otherwise. */
  date: string;
  /** Pending rows carry a Receive button; received rows say "Received". */
  pending: boolean;
};

/** `login_calendar` columns read under RLS. */
export type LoginCalendarRow = { days_claimed: number; last_claim_on: string | null };

/** A `wallet_log` or `summon_ticket_log` row with reason `login_reward`. */
export type LoginLogRow = { delta: number; ref_id: string | null; created_at: string };

export const LOGIN_CALENDAR_COLUMNS = "days_claimed, last_claim_on";
export const LOGIN_LOG_COLUMNS = "delta, ref_id, created_at";

/** The UTC calendar date (`YYYY-MM-DD`) the server's once-per-day check uses. */
export function utcDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** The next calendar step if it can be claimed today, else null. No row means day 1 is open. */
export function pendingLoginDay(calendar: LoginCalendarRow | null, today: string): number | null {
  const claimed = calendar?.days_claimed ?? 0;
  if (claimed >= LOGIN_CALENDAR_DAYS) return null;
  const last = calendar?.last_claim_on ?? null;
  if (last !== null && last >= today) return null;
  return claimed + 1;
}

function gemsName(gems: number): string {
  return `${gems} ${gems === 1 ? "Gem" : "Gems"}`;
}

function ticketName(tickets: number): string {
  return tickets === 1 ? "Summon Ticket" : `Summon Ticket x${tickets}`;
}

function note(day: number): string {
  return `Daily Login Reward Day ${day}`;
}

function stepRows(
  day: number,
  gems: number,
  tickets: number,
  date: string,
  pending: boolean,
): PresentRow[] {
  const rows: PresentRow[] = [];
  const state = pending ? "pending" : "received";
  if (gems > 0) {
    rows.push({
      key: `${state}-${day}-gems`,
      kind: "gems",
      name: gemsName(gems),
      note: note(day),
      date,
      pending,
    });
  }
  if (tickets > 0) {
    rows.push({
      key: `${state}-${day}-ticket`,
      kind: "ticket",
      name: ticketName(tickets),
      note: note(day),
      date,
      pending,
    });
  }
  return rows;
}

/**
 * The Present Box rows: today's unclaimed step first (one row per reward), then each step already
 * received, newest first. Each claim wrote one `login_reward` gem row (and, on day 1, a ticket row
 * sharing its `ref_id`), so the newest gem row is step `days_claimed`, the next one step below.
 */
export function presentRows(
  calendar: LoginCalendarRow | null,
  gemLog: readonly LoginLogRow[],
  ticketLog: readonly LoginLogRow[],
  today: string,
): PresentRow[] {
  const rows: PresentRow[] = [];
  const pending = pendingLoginDay(calendar, today);
  if (pending !== null) {
    const reward = loginStepReward(pending);
    rows.push(...stepRows(pending, reward.gems, reward.tickets, today, true));
  }
  const newestFirst = [...gemLog].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const claimed = calendar?.days_claimed ?? newestFirst.length;
  newestFirst.forEach((gem, i) => {
    const day = claimed - i;
    if (day < 1) return;
    const tickets = ticketLog
      .filter((t) => t.ref_id !== null && t.ref_id === gem.ref_id)
      .reduce((sum, t) => sum + t.delta, 0);
    rows.push(...stepRows(day, gem.delta, tickets, gem.created_at.slice(0, 10), false));
  });
  return rows;
}

/** The ticker line: help while gifts wait, otherwise what happened. */
export function presentsTicker(rows: readonly PresentRow[], received: boolean): string {
  if (received) return "Gifts received.";
  if (rows.some((row) => row.pending)) return "These are all the Gifts you can receive.";
  return rows.length > 0
    ? "There are no Gifts to receive. Come back tomorrow."
    : "There are no Gifts to receive.";
}
