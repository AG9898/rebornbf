/**
 * Login calendar claims (GAME_DESIGN §8 Login rewards, RESOLVED-68). `claim_login_reward()`
 * returns `{claimed, day, gems, tickets, gems_after, tickets_after}`; these helpers read that
 * payload and turn a claim into the home popup's lines, with no I/O.
 */

/** A parsed `claim_login_reward()` result. */
export type LoginClaim = {
  claimed: boolean;
  /** The calendar day just claimed (1–30), or the last one claimed (0 if none) when nothing was. */
  day: number;
  gems: number;
  tickets: number;
  gemsAfter: number;
  ticketsAfter: number;
};

/** One reward line in the popup: the gem icon for gems, the ticket label for the free 10-pull. */
export type LoginRewardLine = { kind: "gems" | "ticket"; label: string };

/** What the home popup shows for a claim. */
export type LoginRewardView = { title: string; lines: LoginRewardLine[] };

function wholeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Reads the RPC's JSON; anything malformed is null, so the home screen shows no popup. */
export function parseLoginClaim(data: unknown): LoginClaim | null {
  if (typeof data !== "object" || data === null) return null;
  const row = data as Record<string, unknown>;
  const day = wholeNumber(row.day);
  const gems = wholeNumber(row.gems);
  const tickets = wholeNumber(row.tickets);
  const gemsAfter = wholeNumber(row.gems_after);
  const ticketsAfter = wholeNumber(row.tickets_after);
  if (
    typeof row.claimed !== "boolean" ||
    day === null ||
    gems === null ||
    tickets === null ||
    gemsAfter === null ||
    ticketsAfter === null
  ) {
    return null;
  }
  return { claimed: row.claimed, day, gems, tickets, gemsAfter, ticketsAfter };
}

/** The popup for a claim, or null when there is nothing to show (nothing claimed or granted). */
export function loginRewardView(claim: LoginClaim | null): LoginRewardView | null {
  if (!claim?.claimed || claim.day < 1) return null;
  const lines: LoginRewardLine[] = [];
  if (claim.gems > 0) {
    lines.push({ kind: "gems", label: `${claim.gems} ${claim.gems === 1 ? "Gem" : "Gems"}` });
  }
  if (claim.tickets > 0) {
    const label = "Free 10-pull ticket";
    lines.push({
      kind: "ticket",
      label: claim.tickets === 1 ? label : `${label} ×${claim.tickets}`,
    });
  }
  if (lines.length === 0) return null;
  return { title: `Day ${claim.day}`, lines };
}
