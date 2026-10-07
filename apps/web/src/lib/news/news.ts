/**
 * Info / News (M8-13, RESOLVED-98; ART_GUIDE -> UI -> Info / News): BFR's notices drawn on the
 * original's Announcements window, at the positions in art/original/layouts/news.json and
 * news_detail.json. The notices are BFR's own text; the pieces are the `news` import set. Pure
 * data and helpers; no I/O.
 */
import type { OriginalAsset } from "../original/original-assets.ts";

export const NEWS_PATH = "/news";

/** The original's notice type badges (`menu_notice_list/new_label<n>_l.png`, 106x82). */
export type NoticeKind = "important" | "apology" | "event" | "update" | "notice";

export const NOTICE_BADGES: Readonly<Record<NoticeKind, OriginalAsset>> = {
  important: "menu_notice_list/new_label1_l.png",
  apology: "menu_notice_list/new_label2_l.png",
  event: "menu_notice_list/new_label3_l.png",
  update: "menu_notice_list/new_label4_l.png",
  notice: "menu_notice_list/new_label5_l.png",
};

export const NOTICE_LABELS: Readonly<Record<NoticeKind, string>> = {
  important: "Important",
  apology: "Apology",
  event: "Event",
  update: "Update",
  notice: "Notice",
};

/** The window and frame pieces. */
export const NEWS_PIECES = {
  window: "menu_notice_list/info_web_bg.jpg",
  close: "notice/notice_close_btn.png",
  cellTop: "menu_notice_list/info_list_frame2/cell_top.png",
  head: "menu_notice_list/info_list_frame2/head.png",
  body: "menu_notice_list/info_list_frame2/body.png",
  foot: "menu_notice_list/info_list_frame2/foot.png",
} as const satisfies Record<string, OriginalAsset>;

/** Every original piece the Info screens draw (for the asset-existence test). */
export const NEWS_SCREEN_ASSETS: readonly string[] = [
  ...Object.values(NEWS_PIECES),
  ...Object.values(NOTICE_BADGES),
];

export type Notice = {
  id: string;
  kind: NoticeKind;
  title: string;
  /** Publication date, `YYYY-MM-DD`. */
  date: string;
  /** Paragraphs. */
  body: readonly string[];
};

/** BFR's notices, newest first. */
export const NOTICES: readonly Notice[] = [
  {
    id: "original-screens",
    kind: "update",
    title: "Screens Return to the Original",
    date: "2026-10-07",
    body: [
      "BFR is rebuilding its screens from the original Brave Frontier pieces, one screen at a time.",
      "Home, Menu, Units, Manage Squad, Fusion, Evolve, Spheres, Items, Summon, Gifts, and this Info window are done. Fonts, audio, maps, quests, and the original units follow.",
    ],
  },
  {
    id: "free-and-unofficial",
    kind: "important",
    title: "BFR Is Free and Unofficial",
    date: "2026-10-07",
    body: [
      "BFR is a free, non-commercial fan revival of Brave Frontier. It is not affiliated with Alim Co., Ltd. or gumi Inc.",
      "There are no payments of any kind: every Gem is earned in game.",
    ],
  },
  {
    id: "daily-login",
    kind: "notice",
    title: "Daily Login Rewards",
    date: "2026-10-07",
    body: [
      "Log in once a day to step through the 30-day login calendar. Day 1 gives 30 Gems and a Summon Ticket; every later day gives 5 Gems.",
      "Received rewards are listed under Gifts, in the Present Box.",
    ],
  },
];

export function noticeById(id: string): Notice | undefined {
  return NOTICES.find((notice) => notice.id === id);
}

/** Where the window's close button returns: the Menu when opened from its News button. */
export function newsCloseHref(from: string | undefined): string {
  return from === "menu" ? "/other" : "/home";
}

/** A notice's link, carrying where the window was opened from. */
export function noticeHref(id: string, from: string | undefined): string {
  return `${NEWS_PATH}/${id}${from === "menu" ? "?from=menu" : ""}`;
}

/** The list's link back from a notice. */
export function newsListHref(from: string | undefined): string {
  return from === "menu" ? `${NEWS_PATH}?from=menu` : NEWS_PATH;
}

/** Dates as the original's notice list shows them: `2026/10/07`. */
export function noticeDate(date: string): string {
  return date.replaceAll("-", "/");
}
