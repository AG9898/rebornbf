import { describe, expect, it } from "vitest";
import { ORIGINAL_ASSETS } from "../original/original-assets.ts";
import {
  parseUnitPick,
  pickHref,
  UNIT_HUB_BASE,
  UNIT_HUB_BUTTONS,
  UNIT_LIST_PATH,
  unitListHref,
} from "./unit-hub.ts";

const ROW = "00000000-0000-4000-8000-000000000001";

describe("Unit hub (M4-06B)", () => {
  it("lists the six buttons in the original's order, with Sell Unit closed", () => {
    expect(UNIT_HUB_BUTTONS.map((b) => [b.label, b.href])).toEqual([
      ["View Units", "/units/list"],
      ["Manage Squad", "/squad"],
      ["Fusion", "/fusion"],
      ["Evolve Unit", "/units/list?pick=evolve"],
      ["Equip Sphere", "/units/list?pick=sphere"],
      ["Sell Unit", null],
    ]);
  });

  it("draws every button from imported original normal and pressed art (M8-03)", () => {
    const imported = (asset: string): boolean => asset in ORIGINAL_ASSETS;
    for (const state of [1, 2]) {
      expect(imported(`${UNIT_HUB_BASE}${state}.png`)).toBe(true);
      for (const b of UNIT_HUB_BUTTONS) {
        expect(imported(`${b.art}${state}.png`), b.label).toBe(true);
      }
    }
  });

  it("builds the All Units URL, keeping sort and pick", () => {
    expect(unitListHref("rarity")).toBe(UNIT_LIST_PATH);
    expect(unitListHref("level")).toBe("/units/list?sort=level");
    expect(unitListHref("rarity", "evolve")).toBe("/units/list?pick=evolve");
    expect(unitListHref("name", "evolve")).toBe("/units/list?sort=name&pick=evolve");
  });

  it("parses only known pick modes", () => {
    expect(parseUnitPick("evolve")).toBe("evolve");
    expect(parseUnitPick(["evolve", "x"])).toBe("evolve");
    expect(parseUnitPick("sphere")).toBe("sphere");
    expect(parseUnitPick("sell")).toBeNull();
    expect(parseUnitPick(undefined)).toBeNull();
  });

  it("lets Evolve pick only owned rows whose form has a next form", () => {
    const row = { id: ROW, unitId: "brand", stackCount: null };
    expect(pickHref({ ...row, formId: "brand-3" }, "evolve")).toBe(`/units/${ROW}/evolve`);
    expect(pickHref({ ...row, formId: "brand-omni" }, "evolve")).toBeNull();
    expect(
      pickHref(
        { id: ROW, unitId: "cinder-mote", formId: "cinder-mote-1", stackCount: 4 },
        "evolve",
      ),
    ).toBeNull();
  });

  it("lets Equip Sphere pick any owned row but not a stack (M4-06J)", () => {
    expect(
      pickHref({ id: ROW, unitId: "brand", formId: "brand-omni", stackCount: null }, "sphere"),
    ).toBe(`/units/${ROW}/spheres`);
    expect(
      pickHref(
        { id: ROW, unitId: "cinder-mote", formId: "cinder-mote-1", stackCount: 4 },
        "sphere",
      ),
    ).toBeNull();
  });
});
