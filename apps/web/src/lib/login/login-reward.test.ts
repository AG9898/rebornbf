import { describe, expect, it } from "vitest";
import { loginRewardView, parseLoginClaim } from "./login-reward.ts";

const DAY_ONE = { claimed: true, day: 1, gems: 30, tickets: 1, gems_after: 30, tickets_after: 1 };

describe("parseLoginClaim", () => {
  it("reads the RPC payload", () => {
    expect(parseLoginClaim(DAY_ONE)).toEqual({
      claimed: true,
      day: 1,
      gems: 30,
      tickets: 1,
      gemsAfter: 30,
      ticketsAfter: 1,
    });
  });

  it("rejects a malformed payload", () => {
    expect(parseLoginClaim(null)).toBeNull();
    expect(parseLoginClaim("claimed")).toBeNull();
    expect(parseLoginClaim({ ...DAY_ONE, claimed: "yes" })).toBeNull();
    expect(parseLoginClaim({ ...DAY_ONE, gems_after: undefined })).toBeNull();
    expect(parseLoginClaim({ ...DAY_ONE, day: -1 })).toBeNull();
    expect(parseLoginClaim({ ...DAY_ONE, gems: 2.5 })).toBeNull();
  });
});

describe("loginRewardView", () => {
  it("shows the gems and the free ticket on day 1", () => {
    expect(loginRewardView(parseLoginClaim(DAY_ONE))).toEqual({
      title: "Day 1",
      lines: [
        { kind: "gems", label: "30 Gems" },
        { kind: "ticket", label: "Free 10-pull ticket" },
      ],
    });
  });

  it("shows only gems on later days", () => {
    const claim = parseLoginClaim({ ...DAY_ONE, day: 12, gems: 5, tickets: 0, gems_after: 85 });
    expect(loginRewardView(claim)).toEqual({
      title: "Day 12",
      lines: [{ kind: "gems", label: "5 Gems" }],
    });
  });

  it("shows nothing when nothing was claimed", () => {
    const repeat = {
      claimed: false,
      day: 3,
      gems: 0,
      tickets: 0,
      gems_after: 40,
      tickets_after: 1,
    };
    expect(loginRewardView(parseLoginClaim(repeat))).toBeNull();
    expect(loginRewardView(null)).toBeNull();
  });

  it("shows nothing for a claim that granted nothing", () => {
    expect(loginRewardView(parseLoginClaim({ ...DAY_ONE, gems: 0, tickets: 0 }))).toBeNull();
  });
});
