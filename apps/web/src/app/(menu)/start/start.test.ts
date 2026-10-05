import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORY_STAGES } from "../../../lib/quests/quest-map.ts";
import { reinforcements } from "../../../lib/quests/reinforcement.ts";
import { TRIAL_STAGES } from "../../../lib/quests/trials.ts";
import { beginQuest } from "./[stage]/begin/actions.ts";
import BeginQuestPage from "./[stage]/begin/page.tsx";
import ReinforcementPage from "./[stage]/page.tsx";

const { rpc, preparation } = vi.hoisted(() => ({ rpc: vi.fn(), preparation: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
  notFound: () => {
    throw new Error("not-found");
  },
}));
vi.mock("../../../lib/supabase/server.ts", () => ({
  createSupabaseServerClient: async () => ({ rpc }),
}));
vi.mock("../../../server/quest-preparation.ts", () => ({ questPreparation: preparation }));

const stage = STORY_STAGES[0];
if (!stage) throw new Error("Missing story fixture");
const stageId = stage.id;
const id = "00000000-0000-4000-8000-000000000001";
const owned = [{ id, unit_id: "brand", form_id: "brand-3", level: 1, exp: 0 }];

beforeEach(() => {
  vi.clearAllMocks();
  preparation.mockResolvedValue({
    stage,
    owned,
    squads: [{ slot: 7, unit_ids: [id], leader_index: 0 }],
    items: [{ item_id: "dew-tonic", count: 3 }],
    userId: "player-one",
    failed: false,
  });
  rpc.mockResolvedValue({ data: { id: "session-id" }, error: null });
});

describe("quest preparation integration (M3-04I)", () => {
  it.each(TRIAL_STAGES)(
    "prepares $name with an ally, squad and items before starting",
    async (trial) => {
      const members = ["brand", "maren", "rook", "garrick", "solen"].map((unit, i) => ({
        id: `00000000-0000-4000-8000-00000000000${i + 1}`,
        unit_id: unit,
        form_id: `${unit}-3`,
        level: 1,
        exp: 0,
      }));
      preparation.mockResolvedValue({
        stage: trial,
        owned: members,
        squads: [{ slot: 7, unit_ids: members.map((member) => member.id), leader_index: 0 }],
        items: [{ item_id: "dew-tonic", count: 3 }],
        userId: "player-one",
        failed: false,
      });
      const picker = renderToStaticMarkup(
        await ReinforcementPage({
          params: Promise.resolve({ stage: trial.id }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(picker).toMatch(/<a[^>]* href="\/trials"[^>]*>Back<\/a>/);
      expect(picker).toContain('data-backdrop="vortex"');
      expect(picker).toContain("No continues");
      expect(picker).toContain(`/start/${trial.id}/begin?slot=0`);
      expect(picker).toContain(`ally=${id}`);
      const guest = reinforcements(members).find((unit) => !unit.yours);
      if (!guest) throw new Error("Missing guest preview");
      expect(picker).toContain(`ally=${guest.id}`);

      for (const ally of [guest.id, id, null]) {
        const preview = renderToStaticMarkup(
          await BeginQuestPage({
            params: Promise.resolve({ stage: trial.id }),
            searchParams: Promise.resolve({ slot: "7", ...(ally ? { ally } : {}) }),
          }),
        );
        expect(preview).toContain(trial.name);
        expect(preview).toContain('data-backdrop="vortex"');
        expect(preview).toContain("Trials cannot be continued");
        expect(preview).toContain(`href="/start/${trial.id}"`);
        expect(preview).toContain("Squad 8");
        expect(preview).toContain('aria-label="Brand, Lv.1, leader"');
        expect(preview).not.toContain('aria-label="Empty squad slot"');
        expect(preview).toContain(ally ? ', ally"' : 'aria-label="No ally"');
        expect(preview).toContain(
          `/start/${trial.id}/begin?slot=8${ally ? `&amp;ally=${ally}` : ""}`,
        );
        expect(preview.match(/aria-label="Empty item slot/g)).toHaveLength(5);
        expect(preview).toContain("Begin Quest");
        expect(rpc).not.toHaveBeenCalled();
      }
      const form = new FormData();
      const items = [{ item: "dew-tonic", count: 3 }];
      form.set("items", JSON.stringify(items));
      await expect(beginQuest(trial.id, 7, guest.id, form)).rejects.toThrow("redirect:/battle");
      expect(rpc).toHaveBeenCalledWith("start_battle", {
        p_stage_id: trial.id,
        p_squad_slot: 7,
        p_ally: guest.id,
        p_items: items,
      });
    },
  );

  it("retains trial, ally and squad after a trial gate refusal", async () => {
    const trial = TRIAL_STAGES[0];
    if (!trial) throw new Error("Missing trial fixture");
    rpc.mockResolvedValue({
      error: { code: "22023", message: "start_battle: this trial is still locked" },
    });
    await expect(beginQuest(trial.id, 7, "aurelle")).rejects.toThrow(
      `redirect:/start/${trial.id}/begin?slot=7&ally=aurelle&error=This+trial+is+still+locked`,
    );
    await expect(beginQuest(trial.id, 10, null)).rejects.toThrow("redirect:/trials");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([1, 2])("returns from Reinforcement to chapter %i's quest list", async (chapter) => {
    const areaStage = STORY_STAGES.find((entry) => entry.story?.chapter === chapter);
    if (!areaStage) throw new Error(`Missing chapter ${chapter}`);
    preparation.mockResolvedValue({ stage: areaStage, owned: [], failed: false });
    const html = renderToStaticMarkup(
      await ReinforcementPage({
        params: Promise.resolve({ stage: areaStage.id }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(html).toMatch(new RegExp(`<a[^>]* href="/quests/${chapter}"[^>]*>Back</a>`));
  });

  it("links No Ally and owned duplicate choices to Begin Quest", async () => {
    const html = renderToStaticMarkup(
      await ReinforcementPage({
        params: Promise.resolve({ stage: stageId }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(html).toContain("No Ally");
    expect(html).toContain("Brand · Yours");
    expect(html).toContain(`ally=${id}`);
    expect(html).toContain("/assets/ui/title-plate.webp");
    expect(html).toContain("/assets/ui/unit-frame-fire.webp");
  });
  it("renders the selected squad in one party row, retaining the ally in squad links", async () => {
    const html = renderToStaticMarkup(
      await BeginQuestPage({
        params: Promise.resolve({ stage: stageId }),
        searchParams: Promise.resolve({ slot: "7", ally: id }),
      }),
    );
    expect(html).toContain("Squad 8");
    expect(html).toContain('aria-label="Brand, Lv.1, leader"');
    expect(html).toContain('aria-label="Brand, Lv.1, ally"');
    expect(html).toContain("Leader Skill ▸");
    expect(html).toContain("◂ Ally Skill");
    expect(html.match(/aria-label="Empty squad slot"/g)).toHaveLength(4);
    expect(html).toContain("slot=8&amp;ally=");
    expect(html.match(/aria-label="Empty item slot/g)).toHaveLength(5);
    for (const piece of [
      "title-plate",
      "section-tab",
      "unit-frame-fire",
      "badge-leader",
      "squad-arrow",
      "dot-on",
      "dot-off",
      "item-slot",
      "btn-hub",
    ]) {
      expect(html).toContain(`/assets/ui/${piece}.webp`);
    }
    expect(html).toContain("/assets/ui/cards/thumb/brand-3star.webp");
    expect(html).toContain("ALLY");
    expect(html).toContain("ATK +25% (Fire allies)");
    expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(2);
    expect(html).toContain('aria-current="page"');
    expect(html).toContain(">Lv.1<");
    // Every decorative image wired into this screen must have a real public export.
    for (const match of html.matchAll(/src="(\/assets\/[^"]+)"/g)) {
      expect(existsSync(new URL(`../../../../public${match[1]}`, import.meta.url))).toBe(true);
    }
  });
  it("disables starting an empty squad and renders No Ally", async () => {
    const html = renderToStaticMarkup(
      await BeginQuestPage({
        params: Promise.resolve({ stage: stageId }),
        searchParams: Promise.resolve({ slot: "0" }),
      }),
    );
    expect(html).toContain('aria-label="No ally"');
    expect(html).toContain("Save a squad");
    expect(html).toContain('disabled=""');
  });
  it("refuses an unknown or foreign ally instead of silently selecting none", async () => {
    await expect(
      BeginQuestPage({
        params: Promise.resolve({ stage: stageId }),
        searchParams: Promise.resolve({ ally: "foreign" }),
      }),
    ).rejects.toThrow("not-found");
  });
  it("keeps the art-backed start button disabled when preparation fails", async () => {
    preparation.mockResolvedValue({
      stage,
      owned: [],
      squads: [],
      items: [],
      userId: "player-one",
      failed: true,
    });
    const html = renderToStaticMarkup(
      await BeginQuestPage({
        params: Promise.resolve({ stage: stageId }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(html).toContain("Your squad could not be loaded");
    expect(html).toContain("/assets/ui/btn-hub.webp");
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""/);
  });
  it("sends the selected squad and duplicate ally to start_battle and opens the battle", async () => {
    await expect(beginQuest(stageId, 7, id)).rejects.toThrow("redirect:/battle?session=session-id");
    expect(rpc).toHaveBeenCalledWith("start_battle", {
      p_stage_id: stageId,
      p_squad_slot: 7,
      p_ally: id,
      p_items: [],
    });
  });
  it("submits No Ally as null and supports a guest id", async () => {
    for (const ally of [null, "guest-aurelle"]) {
      await expect(beginQuest(stageId, 2, ally)).rejects.toThrow("redirect:/battle");
      expect(rpc).toHaveBeenLastCalledWith("start_battle", {
        p_stage_id: stageId,
        p_squad_slot: 2,
        p_ally: ally,
        p_items: [],
      });
    }
  });
  it("keeps the ally and squad when returning an RPC refusal", async () => {
    rpc.mockResolvedValue({ error: { code: "22023", message: "start_battle: stage is locked" } });
    await expect(beginQuest(stageId, 7, id)).rejects.toThrow(
      `begin?slot=7&ally=${id}&error=Stage+is+locked`,
    );
  });
  it("refuses invalid slots before calling the RPC", async () => {
    await expect(beginQuest(stageId, 10, null)).rejects.toThrow("redirect:/quests");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("sends the picked item IDs/counts to start_battle", async () => {
    const form = new FormData();
    const items = [
      { item: "dew-tonic", count: 3 },
      { item: "bitterleaf", count: 10 },
    ];
    form.set("items", JSON.stringify(items));
    await expect(beginQuest(stageId, 7, id, form)).rejects.toThrow("redirect:/battle");
    expect(rpc).toHaveBeenCalledWith("start_battle", {
      p_stage_id: stageId,
      p_squad_slot: 7,
      p_ally: id,
      p_items: items,
    });
  });
  it("refuses malformed, duplicate, material and out-of-range loadouts before the RPC", async () => {
    for (const value of [
      "not-json",
      "null",
      JSON.stringify([{ item: "crown-shard", count: 1 }]),
      JSON.stringify([{ item: "dew-tonic", count: 11 }]),
      JSON.stringify([
        { item: "dew-tonic", count: 1 },
        { item: "dew-tonic", count: 1 },
      ]),
    ]) {
      const form = new FormData();
      form.set("items", value);
      await expect(beginQuest(stageId, 7, id, form)).rejects.toThrow("error=Invalid+item+loadout");
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("returns inventory refusals to the same squad and ally", async () => {
    rpc.mockResolvedValue({
      error: { code: "22023", message: "start_battle: insufficient item stock" },
    });
    const form = new FormData();
    form.set("items", JSON.stringify([{ item: "dew-tonic", count: 3 }]));
    await expect(beginQuest(stageId, 7, id, form)).rejects.toThrow(
      `begin?slot=7&ally=${id}&error=Insufficient+item+stock`,
    );
  });
});
