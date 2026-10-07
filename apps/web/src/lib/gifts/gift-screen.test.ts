import { describe, expect, it } from "vitest";
import { ORIGINAL_ASSETS } from "../original/original-assets.ts";
import {
  GIFT_SCREEN_ASSETS,
  loginStepReward,
  PRESENTS_PATH,
  pendingLoginDay,
  presentRows,
  presentsTicker,
  REWARD_BUTTONS,
  utcDate,
} from "./gift-screen.ts";

describe("Gifts screens (M8-12)", () => {
  it("draws only imported original pieces", () => {
    expect(GIFT_SCREEN_ASSETS.length).toBeGreaterThan(0);
    for (const asset of GIFT_SCREEN_ASSETS) expect(asset in ORIGINAL_ASSETS, asset).toBe(true);
  });

  it("opens only the Present Box from the Rewards grid", () => {
    expect(REWARD_BUTTONS.map((b) => b.label)).toEqual([
      "Level Up Campaign",
      "Brave Points and Rewards",
      "Present Box",
      "Keys",
      "Slots",
      "Mystery Chest",
      "Daily Spin",
    ]);
    expect(REWARD_BUTTONS.filter((b) => b.href).map((b) => b.href)).toEqual([PRESENTS_PATH]);
  });

  it("mirrors claim_login_reward's step rewards", () => {
    expect(loginStepReward(1)).toEqual({ gems: 30, tickets: 1 });
    expect(loginStepReward(2)).toEqual({ gems: 5, tickets: 0 });
    expect(loginStepReward(30)).toEqual({ gems: 5, tickets: 0 });
  });

  it("opens the next step once per UTC day until day 30", () => {
    expect(pendingLoginDay(null, "2026-10-07")).toBe(1);
    expect(pendingLoginDay({ days_claimed: 3, last_claim_on: "2026-10-06" }, "2026-10-07")).toBe(4);
    expect(
      pendingLoginDay({ days_claimed: 3, last_claim_on: "2026-10-07" }, "2026-10-07"),
    ).toBeNull();
    expect(
      pendingLoginDay({ days_claimed: 30, last_claim_on: "2026-10-01" }, "2026-10-07"),
    ).toBeNull();
    expect(utcDate(new Date("2026-10-07T23:59:59Z"))).toBe("2026-10-07");
  });

  it("lists today's step, then received steps newest first with day 1's ticket", () => {
    const rows = presentRows(
      { days_claimed: 2, last_claim_on: "2026-10-06" },
      [
        { delta: 30, ref_id: "a", created_at: "2026-10-05T10:00:00Z" },
        { delta: 5, ref_id: "b", created_at: "2026-10-06T10:00:00Z" },
      ],
      [{ delta: 1, ref_id: "a", created_at: "2026-10-05T10:00:00Z" }],
      "2026-10-07",
    );
    expect(rows.map((r) => [r.name, r.note, r.date, r.pending])).toEqual([
      ["5 Gems", "Daily Login Reward Day 3", "2026-10-07", true],
      ["5 Gems", "Daily Login Reward Day 2", "2026-10-06", false],
      ["30 Gems", "Daily Login Reward Day 1", "2026-10-05", false],
      ["Summon Ticket", "Daily Login Reward Day 1", "2026-10-05", false],
    ]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    expect(presentsTicker(rows, false)).toBe("These are all the Gifts you can receive.");
  });

  it("offers day 1 as two rows to a new player", () => {
    const rows = presentRows(null, [], [], "2026-10-07");
    expect(rows.map((r) => [r.kind, r.name, r.pending])).toEqual([
      ["gems", "30 Gems", true],
      ["ticket", "Summon Ticket", true],
    ]);
  });

  it("says when nothing waits", () => {
    expect(presentsTicker([], false)).toBe("There are no Gifts to receive.");
    expect(presentsTicker([], true)).toBe("Gifts received.");
  });
});
