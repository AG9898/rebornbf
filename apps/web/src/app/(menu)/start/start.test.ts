import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DUNGEON_STAGES } from "../../../lib/quests/dungeons.ts";
import { STORY_STAGES } from "../../../lib/quests/quest-map.ts";
import { reinforcements } from "../../../lib/quests/reinforcement.ts";
import { TRIAL_STAGES } from "../../../lib/quests/trials.ts";
import { startBattleSession } from "../../../server/start-battle.ts";
import { beginQuest, beginTrial } from "./[stage]/begin/actions.ts";
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
  useRouter: () => ({ push: vi.fn() }),
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
  it("keeps the vortex through dungeon Reinforcement and Begin Quest and Back returns to its series", async () => {
    const dungeon = DUNGEON_STAGES.find((entry) => entry.dungeon?.series === "sprite");
    if (!dungeon) throw new Error("Missing dungeon fixture");
    preparation.mockResolvedValue({
      stage: dungeon,
      owned,
      squads: [{ slot: 7, unit_ids: [id], leader_index: 0 }],
      items: [],
      userId: "player-one",
      failed: false,
    });
    const reinforcement = renderToStaticMarkup(
      await ReinforcementPage({
        params: Promise.resolve({ stage: dungeon.id }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(reinforcement).toContain('data-backdrop="vortex"');
    expect(reinforcement).toMatch(/<a[^>]* href="\/dungeons\/sprite"[^>]*>Back<\/a>/);
    const prep = renderToStaticMarkup(
      await BeginQuestPage({
        params: Promise.resolve({ stage: dungeon.id }),
        searchParams: Promise.resolve({ slot: "7" }),
      }),
    );
    expect(prep).toContain('data-backdrop="vortex"');
    expect(prep).toContain("action=");
  });

  it.each(["this dungeon is still locked", "no clears left today for this dungeon"])(
    "preserves the dungeon, squad and ally on start_battle refusal: %s",
    async (message) => {
      const stageId = "dungeon-vital-hob";
      rpc.mockResolvedValue({ error: { code: "22023", message: `start_battle: ${message}` } });
      await expect(beginQuest(stageId, 7, "aurelle")).rejects.toThrow(
        `redirect:/start/${stageId}/begin?slot=7&ally=aurelle&error=`,
      );
      expect(rpc).toHaveBeenCalledWith(
        "start_battle",
        expect.objectContaining({ p_stage_id: stageId, p_squad_slot: 7, p_ally: "aurelle" }),
      );
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
    await expect(beginQuest(trial.id, 10, null)).rejects.toThrow("redirect:/conclave/lab");
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

describe("three-squad trial start (M6-01J)", () => {
  it("sends reserve squads and their allies to start_battle only when given", async () => {
    const trial = TRIAL_STAGES[0];
    if (!trial) throw new Error("Missing trial fixture");
    const reserves = [
      { slot: 2, ally: "aurelle" },
      { slot: 4, ally: null },
    ];
    await expect(
      startBattleSession(trial.id, "/conclave/lab", 0, id, [], reserves),
    ).rejects.toThrow("redirect:/battle?session=session-id");
    expect(rpc).toHaveBeenCalledWith("start_battle", {
      p_stage_id: trial.id,
      p_squad_slot: 0,
      p_ally: id,
      p_items: [],
      p_reserves: reserves,
    });
  });
});

describe("three-squad trial preparation (M6-01K)", () => {
  const members = ["brand", "maren", "rook", "garrick", "solen", "morrick"].map((unit, i) => ({
    id: `00000000-0000-4000-8000-00000000001${i}`,
    unit_id: unit,
    form_id: `${unit}-3`,
    level: 1,
    exp: 0,
  }));
  const ids = members.map((member) => member.id);

  function prepare(trial: (typeof TRIAL_STAGES)[number]): void {
    preparation.mockResolvedValue({
      stage: trial,
      squadCount: 3,
      owned: members,
      squads: [
        { slot: 0, unit_ids: ids.slice(0, 3), leader_index: 1 },
        { slot: 1, unit_ids: ids.slice(3, 5), leader_index: 0 },
        { slot: 4, unit_ids: ids.slice(5), leader_index: 0 },
      ],
      items: [{ item_id: "dew-tonic", count: 3 }],
      userId: "player-one",
      failed: false,
    });
  }

  it.each(TRIAL_STAGES)(
    "walks $name through Edit Squad, three allies and Challenge",
    async (trial) => {
      prepare(trial);
      const edit = renderToStaticMarkup(
        await ReinforcementPage({
          params: Promise.resolve({ stage: trial.id }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(edit).toContain('data-backdrop="proving-lab"');
      expect(edit).toContain("Edit Squad");
      expect(edit).toMatch(/<a[^>]* href="\/conclave\/lab"[^>]*>Back<\/a>/);
      for (const party of [1, 2, 3]) expect(edit).toContain(`aria-label="Party ${party}"`);
      expect(edit).toContain(">Squad 1<");
      expect(edit).toContain(">Squad 2<");
      expect(edit).toContain(">Squad 3<");
      expect(edit).toContain('aria-label="Maren, Lv.1, leader: remove"');
      expect(edit).toContain(
        "Pick units for three squads. Up to fifteen, and no unit fights twice!",
      );
      expect(edit).toContain("/assets/ui/dialogue-panel.webp");
      expect(edit).toContain("Select Ally");

      const guest = reinforcements(members).find((unit) => !unit.yours);
      if (!guest) throw new Error("Missing guest preview");
      const plan = "s=0%2C1%2C4";
      const ally1 = renderToStaticMarkup(
        await ReinforcementPage({
          params: Promise.resolve({ stage: trial.id }),
          searchParams: Promise.resolve({ s: "0,1,4", party: "1" }),
        }),
      );
      expect(ally1).toContain("Choose an ally for Party 1 of 3");
      expect(ally1).toContain(`href="/start/${trial.id}?s=0,1,4"`);
      expect(ally1).toContain(`/start/${trial.id}?${plan}&amp;a1=${guest.id}&amp;party=2`);

      const ally3 = renderToStaticMarkup(
        await ReinforcementPage({
          params: Promise.resolve({ stage: trial.id }),
          searchParams: Promise.resolve({ s: "0,1,4", a1: guest.id, a2: ids[0], party: "3" }),
        }),
      );
      expect(ally3).toContain(">Party 1<");
      expect(ally3).toContain(">Party 2<");
      expect(ally3).toContain(
        `/start/${trial.id}/begin?${plan}&amp;a1=${guest.id}&amp;a2=${ids[0]}&amp;squad=0`,
      );

      const prep = renderToStaticMarkup(
        await BeginQuestPage({
          params: Promise.resolve({ stage: trial.id }),
          searchParams: Promise.resolve({ s: "0,1,4", a1: guest.id, a2: ids[0], squad: "1" }),
        }),
      );
      expect(prep).toContain("Trials cannot be continued");
      expect(prep).toContain(">Squad 2<");
      expect(prep).toContain('aria-label="Garrick, Lv.1, leader"');
      expect(prep).toContain('aria-label="Brand, Lv.1, ally"');
      // The shown squad's panel plus one page dot per party.
      expect(prep.match(/aria-label="Squad \d"/g)).toHaveLength(4);
      expect(prep).toContain("Challenge");
      expect(prep).not.toContain("Begin Quest");
      expect(prep).toContain(
        `href="/start/${trial.id}?${plan}&amp;a1=${guest.id}&amp;a2=${ids[0]}&amp;party=3"`,
      );
      expect(rpc).not.toHaveBeenCalled();

      const form = new FormData();
      const items = [{ item: "dew-tonic", count: 3 }];
      form.set("items", JSON.stringify(items));
      await expect(
        beginTrial(trial.id, { slots: [0, 1, 4], allies: [guest.id, ids[0], null] }, form),
      ).rejects.toThrow("redirect:/battle?session=session-id");
      expect(rpc).toHaveBeenCalledWith("start_battle", {
        p_stage_id: trial.id,
        p_squad_slot: 0,
        p_ally: guest.id,
        p_items: items,
        p_reserves: [
          { slot: 1, ally: ids[0] },
          { slot: 4, ally: null },
        ],
      });
    },
  );

  it("returns trial refusals to the prep screen and refuses bad plans and story stages", async () => {
    const trial = TRIAL_STAGES[0];
    if (!trial) throw new Error("Missing trial fixture");
    rpc.mockResolvedValue({
      error: { code: "22023", message: "start_battle: no unit may fight in two squads" },
    });
    await expect(
      beginTrial(trial.id, { slots: [2, 3], allies: [null, "aurelle"] }),
    ).rejects.toThrow(
      `redirect:/start/${trial.id}/begin?s=2%2C3&a2=aurelle&squad=0&error=No+unit+may+fight+in+two+squads`,
    );
    await expect(beginTrial(trial.id, { slots: [1, 1], allies: [null, null] })).rejects.toThrow(
      "redirect:/conclave/lab",
    );
    await expect(beginTrial(stageId, { slots: [0], allies: [null] })).rejects.toThrow(
      "redirect:/quests",
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("refuses a prep plan with an unknown ally or no squads", async () => {
    const trial = TRIAL_STAGES[0];
    if (!trial) throw new Error("Missing trial fixture");
    prepare(trial);
    for (const query of [{ s: "0,1", a2: "foreign" }, {}]) {
      await expect(
        BeginQuestPage({
          params: Promise.resolve({ stage: trial.id }),
          searchParams: Promise.resolve(query),
        }),
      ).rejects.toThrow("not-found");
    }
  });
});
