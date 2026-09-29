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
