import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORY_STAGES } from "../lib/quests/quest-map.ts";
import { TRIAL_STAGES } from "../lib/quests/trials.ts";
import { questPreparation } from "./quest-preparation.ts";

const { client, claims, read } = vi.hoisted(() => ({
  client: vi.fn(),
  claims: vi.fn(),
  read: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../lib/supabase/server.ts", () => ({ createSupabaseServerClient: client }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  claims.mockResolvedValue({ data: { claims: { sub: "player-one" } } });
  read.mockResolvedValue({ data: [], error: null });
  client.mockResolvedValue({
    auth: { getClaims: claims },
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (column: string, value: string) => {
          expect(column).toBe("user_id");
          expect(value).toBe("player-one");
          return query;
        },
        overrideTypes: () => read(table),
      };
      return query;
    },
  });
});

describe("shared story/trial preparation reads", () => {
  it.each([...STORY_STAGES.slice(0, 1), ...TRIAL_STAGES])(
    "accepts $name and reads the caller's units, saved squads and item stock",
    async (stage) => {
      const preparation = await questPreparation(stage.id);
      expect(preparation.stage).toEqual(stage);
      expect(preparation.failed).toBe(false);
      expect(preparation.userId).toBe("player-one");
      expect(read.mock.calls.map(([table]) => table)).toEqual([
        "owned_units",
        "squads",
        "owned_items",
      ]);
    },
  );

  it("refuses unknown stage IDs before reading player data", async () => {
    await expect(questPreparation("unknown-stage")).rejects.toThrow("not-found");
    expect(client).not.toHaveBeenCalled();
  });

  it("returns signed-out players to trial Reinforcement after signing in", async () => {
    client.mockResolvedValue(null);
    await expect(questPreparation("trial-01-captain-locke")).rejects.toThrow(
      "redirect:/sign-in?next=%2Fstart%2Ftrial-01-captain-locke",
    );
    expect(read).not.toHaveBeenCalled();
  });

  it("marks failed preparation unavailable so the start controls stay disabled", async () => {
    read.mockResolvedValue({ data: null, error: { message: "Unavailable" } });
    expect(await questPreparation("trial-01-captain-locke")).toMatchObject({
      failed: true,
      owned: [],
      squads: [],
      items: [],
    });
  });
});
