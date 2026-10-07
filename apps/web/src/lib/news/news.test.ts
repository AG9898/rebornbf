import { describe, expect, it } from "vitest";
import { MENU_NEWS } from "../../components/menu/menu-screen-data.ts";
import { ORIGINAL_ASSETS } from "../original/original-assets.ts";
import {
  NEWS_SCREEN_ASSETS,
  NOTICE_BADGES,
  NOTICES,
  newsCloseHref,
  newsListHref,
  noticeById,
  noticeDate,
  noticeHref,
} from "./news.ts";

describe("Info / News (M8-13)", () => {
  it("draws only imported original pieces", () => {
    expect(NEWS_SCREEN_ASSETS.length).toBeGreaterThan(0);
    for (const asset of NEWS_SCREEN_ASSETS) expect(asset in ORIGINAL_ASSETS, asset).toBe(true);
    for (const notice of NOTICES) expect(NOTICE_BADGES[notice.kind] in ORIGINAL_ASSETS).toBe(true);
  });

  it("keeps notices unique, dated, and newest first", () => {
    expect(NOTICES.length).toBeGreaterThan(0);
    expect(new Set(NOTICES.map((n) => n.id)).size).toBe(NOTICES.length);
    for (const notice of NOTICES) {
      expect(notice.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(notice.body.length).toBeGreaterThan(0);
      expect(noticeById(notice.id)).toBe(notice);
    }
    const dates = NOTICES.map((n) => n.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(noticeById("missing")).toBeUndefined();
  });

  it("closes back to the screen that opened it", () => {
    expect(MENU_NEWS.href).toBe("/news?from=menu");
    expect(newsCloseHref("menu")).toBe("/other");
    expect(newsCloseHref(undefined)).toBe("/home");
    expect(newsCloseHref("https://example.com")).toBe("/home");
    expect(noticeHref("daily-login", "menu")).toBe("/news/daily-login?from=menu");
    expect(noticeHref("daily-login", undefined)).toBe("/news/daily-login");
    expect(newsListHref("menu")).toBe("/news?from=menu");
    expect(newsListHref(undefined)).toBe("/news");
  });

  it("shows dates as the original's list does", () => {
    expect(noticeDate("2026-10-07")).toBe("2026/10/07");
  });
});
