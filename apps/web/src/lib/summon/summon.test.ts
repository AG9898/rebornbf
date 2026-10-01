import { describe, expect, it } from "vitest";
import {
  bannerArt,
  bannerRates,
  featuredNames,
  formatRate,
  isSummonCount,
  parseSummonResult,
  SUMMON_BANNERS,
  summonProblem,
  summonTreatment,
  TICKET_BANNER_ID,
  ticketOffered,
} from "./summon.ts";

const ROW = "11111111-1111-4111-8111-111111111111";
const STACK = "22222222-2222-4222-8222-222222222222";

function result(unit: Record<string, unknown>, featured = false) {
  return { unit, featured, pity: false, pity_after: 1 };
}

describe("summonTreatment", () => {
  it("maps rarity to the gate treatment", () => {
    expect(summonTreatment(2)).toBe("gold");
    expect(summonTreatment(3)).toBe("gold");
    expect(summonTreatment(4)).toBe("red");
    expect(summonTreatment(5)).toBe("rainbow");
    expect(summonTreatment("omni")).toBe("rainbow");
    expect(summonTreatment(null)).toBe("gold");
  });
});

describe("launch banner", () => {
  const banner = SUMMON_BANNERS[0];

  it("has key art and lists every form with its rate, featured first", () => {
    expect(banner?.id).toBe("launch-summon");
    expect(bannerArt("launch-summon")).toBe("summon-banner-launch");
    expect(bannerArt("unknown")).toBeNull();
    if (!banner) return;
    const rates = bannerRates(banner);
    expect(rates).toHaveLength(banner.featured.length + banner.pool.length);
    expect(rates.slice(0, 2)).toEqual([
      { unitId: "aurelle", name: "Aurelle", rarityLabel: "5★", rate: "1.5%", featured: true },
      { unitId: "vespera", name: "Vespera", rarityLabel: "5★", rate: "1.5%", featured: true },
    ]);
    expect(featuredNames(banner)).toEqual(["Aurelle", "Vespera"]);
  });

  it("formats basis points as percents", () => {
    expect(formatRate(150)).toBe("1.5%");
    expect(formatRate(1300)).toBe("13%");
    expect(formatRate(25)).toBe("0.25%");
  });
});

describe("parseSummonResult", () => {
  it("reads pulls in order with their treatment, art, and page", () => {
    const out = parseSummonResult({
      batch_id: "b",
      gems: 45,
      pity_after: 0,
      results: [
        result({
          stacked: true,
          owned_unit_id: null,
          stack_id: STACK,
          unit_id: "cinder-sprite",
          form_id: "cinder-sprite-2",
        }),
        result(
          {
            stacked: false,
            owned_unit_id: ROW,
            stack_id: null,
            unit_id: "aurelle",
            form_id: "aurelle-5",
          },
          true,
        ),
      ],
    });
    expect(out?.gems).toBe(45);
    expect(out?.pityAfter).toBe(0);
    expect(out?.ticketsAfter).toBeNull();
    expect(out?.pulls.map((p) => [p.index, p.treatment, p.href])).toEqual([
      [1, "gold", `/units/stack/${STACK}`],
      [2, "rainbow", `/units/${ROW}`],
    ]);
    expect(out?.pulls[1]).toMatchObject({
      name: "Aurelle",
      rarityLabel: "5★",
      featured: true,
      sprite: "/assets/units/aurelle/battle-idle-5star.png",
      thumb: "/assets/ui/cards/thumb/aurelle-5star.webp",
    });
  });

  it("reads the ticket path's tickets left", () => {
    const pull = result({ unit_id: "cinder-sprite", form_id: "cinder-sprite-2" });
    const base = { batch_id: "b", gems: 7, pity_after: 3, results: [pull] };
    expect(parseSummonResult({ ...base, tickets_after: 0 })?.ticketsAfter).toBe(0);
    expect(parseSummonResult({ ...base, tickets_after: -1 })).toBeNull();
  });

  it("rejects a malformed payload", () => {
    expect(parseSummonResult(null)).toBeNull();
    expect(parseSummonResult({ gems: 1, pity_after: 0, results: [] })).toBeNull();
    expect(parseSummonResult({ gems: -1, pity_after: 0, results: [result({})] })).toBeNull();
    expect(
      parseSummonResult({ gems: 1, pity_after: 0, results: [result({ unit_id: "aurelle" })] }),
    ).toBeNull();
  });
});

describe("summon checks", () => {
  it("offers the ticket only on the launch banner while one is held", () => {
    expect(ticketOffered(TICKET_BANNER_ID, 1)).toBe(true);
    expect(ticketOffered(TICKET_BANNER_ID, 0)).toBe(false);
    expect(ticketOffered(TICKET_BANNER_ID, null)).toBe(false);
    expect(ticketOffered("other-banner", 1)).toBe(false);
  });

  it("accepts only the RPC's pull counts", () => {
    expect(isSummonCount(1)).toBe(true);
    expect(isSummonCount(11)).toBe(true);
    expect(isSummonCount(10)).toBe(false);
    expect(isSummonCount("1")).toBe(false);
  });

  it("needs the gem price", () => {
    expect(summonProblem(5, 1)).toBeNull();
    expect(summonProblem(49, 11)).toBe("Not enough gems.");
    expect(summonProblem(null, 1)).toBe("Your gems could not be loaded.");
  });
});
