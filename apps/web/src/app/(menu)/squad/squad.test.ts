import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fillSquadSlots, type SquadDraft } from "../../../lib/squad/squad-editor.ts";
import { toOwnedUnitView } from "../../../lib/units/owned-units.ts";
import { saveSquad } from "./actions.ts";
import { type EditorUnit, SquadEditor } from "./SquadEditor.tsx";

const { rpc, revalidatePath } = vi.hoisted(() => ({
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("../../../lib/supabase/server.ts", () => ({
  createSupabaseServerClient: async () => ({ rpc }),
}));

const views = ["brand", "maren", "rook", "garrick", "solen"].map((unit, i) =>
  toOwnedUnitView({
    id: `00000000-0000-4000-8000-00000000000${i + 1}`,
    unit_id: unit,
    form_id: `${unit}-3`,
    level: 1,
    exp: 0,
  }),
);
const owned = views.map(
  (view): EditorUnit => ({
    ...view,
    stats: view.currentStats,
    leaderSkill: null,
  }),
);
const ids = views.map((view) => view.id);
const saved: SquadDraft = { unitIds: ids.slice(0, 2), leaderIndex: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ error: null });
});

describe("squad multi-pick integration (M4-06F)", () => {
  it("renders three accessible empty-pedestal buttons and filled-slot removal controls", () => {
    const html = renderToStaticMarkup(
      createElement(SquadEditor, {
        slot: 0,
        units: owned,
        pickerUnits: views.map((view) => ({ ...view, stackCount: null })),
        saved,
      }),
    );
    expect(html.match(/aria-label="Add units to the squad"/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Remove Brand from the squad"');
    expect(html).toContain('aria-label="Remove Maren from the squad"');
    expect(html).not.toContain("ally slot");
    expect(html).not.toContain("Guests");
    expect(html).not.toContain('aria-label="Tapping a unit adds it to"');
  });

  it("saves the confirmed three-unit fill through save_squad, then revalidates the page", async () => {
    const filled = fillSquadSlots(saved, ids.slice(2), new Set(ids));
    expect(await saveSquad(4, filled)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_squad", {
      p_slot: 4,
      p_unit_ids: ids,
      p_leader_index: 1,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/squad");
  });

  it("does not report success or revalidate when the save RPC refuses the draft", async () => {
    rpc.mockResolvedValue({ error: { code: "22023", message: "save_squad: unknown unit" } });
    expect(await saveSquad(0, saved)).toEqual({ ok: false, message: "Unknown unit" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
