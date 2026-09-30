import { describe, expect, it } from "vitest";
import { submitSession } from "./submit-session.ts";

const SESSION = "e1a5119a-1583-4c5c-9cfa-d788330074d0";
const LOG = [{ inputs: [{ type: "attack" as const, tick: 5, actor: "p0" as const }], endTick: 42 }];

describe("session battle submission", () => {
  it("posts the recorded turns and displays only the route's verified rewards", async () => {
    let sent: unknown;
    const request: typeof fetch = async (url, init) => {
      expect(url).toBe("/api/battles/finish");
      expect(init?.method).toBe("POST");
      sent = JSON.parse(String(init?.body));
      return Response.json({
        ok: true,
        result: "win",
        turns: 2,
        rewards: { first_clear: true, gems: 10, zel: 15 },
      });
    };
    expect(await submitSession(SESSION, LOG, request)).toEqual({
      ok: true,
      turns: 2,
      rewards: { first_clear: true, gems: 10, zel: 15 },
    });
    expect(sent).toEqual({ session_id: SESSION, input_log: LOG });
  });

  it("shows the route's rejection and handles network or invalid responses", async () => {
    expect(
      await submitSession(SESSION, LOG, async () =>
        Response.json({ ok: false, error: "This battle has expired." }, { status: 410 }),
      ),
    ).toEqual({ ok: false, error: "This battle has expired." });
    const unavailable = await submitSession(SESSION, LOG, async () => {
      throw new Error("offline");
    });
    expect(unavailable).toMatchObject({ ok: false, error: expect.stringContaining("unavailable") });
    expect(
      await submitSession(SESSION, LOG, async () => new Response("not json", { status: 503 })),
    ).toEqual(unavailable);
  });
});

describe("story starter reward", () => {
  const grant = { owned_unit_id: SESSION, unit_id: "maren", form_id: "maren-4" };
  async function submit(firstClear: boolean, starter: unknown) {
    return submitSession(SESSION, LOG, async () =>
      Response.json({
        ok: true,
        result: "win",
        turns: 2,
        rewards: { first_clear: firstClear, gems: 25, zel: 10, starter },
      }),
    );
  }

  it("includes the granted starter's name, rarity, and owned-unit link id", async () => {
    expect(await submit(true, grant)).toMatchObject({
      ok: true,
      rewards: { starter: { ownedUnitId: SESSION, name: "Maren", rarity: 4 } },
    });
  });

  it("shows no unlock for replays, captures, malformed grants, or a wrong form", async () => {
    for (const [firstClear, grantValue] of [
      [false, grant],
      [true, null],
      [true, { ...grant, owned_unit_id: "bad-id" }],
      [true, { ...grant, form_id: "brand-4" }],
      [true, { ...grant, unit_id: "aurelle", form_id: "aurelle-4" }],
    ] as const) {
      const result = await submit(firstClear, grantValue);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.rewards.starter).toBeUndefined();
    }
  });
});
