import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ItemSchema, MaterialItemSchema } from "./schemas/item.ts";
import { type EvolutionRecipe, UnitSchema } from "./schemas/unit.ts";

/**
 * Reference tests for transcribed evolution recipes (GAME_DESIGN §6 → Evolution materials,
 * RESOLVED-66/67). Each expected recipe is the homage form page's `evomats` / `evoitem` /
 * `evozelcost`, mapped to BFR materials (ROSTER.md → Evolution materials), keyed by the form that
 * evolves. Materials keep the page's order.
 */

const unitsDir = join(import.meta.dirname, "..", "content", "units");
const itemsDir = join(import.meta.dirname, "..", "content", "items");

function recipesOf(id: string): Record<string, EvolutionRecipe | undefined> {
  const unit = UnitSchema.parse(JSON.parse(readFileSync(join(unitsDir, `${id}.json`), "utf8")));
  return Object.fromEntries(unit.forms.map((form) => [form.id, form.evolution]));
}

const one = (unit: string) => ({ unit, count: 1 });

describe("Brand evolution recipes (M4-02E)", () => {
  // Source: bravefrontierglobal.fandom.com form pages of Brand's homage unit (ROSTER.md), read 2026-09-29. Homage IDs:
  // 10130 Fire Nymph → cinder-mote, 10131 Fire Spirit → cinder-sprite, 10132 Fire Idol →
  // cinder-effigy, 10133 Fire Totem → cinder-cairn, 10354 Fire Mecha God → cinder-colossus,
  // 50354 Miracle Totem → prism-cairn, Legend Stone → crown-shard. The Zenith Core is BFR's own
  // Omni key material (RESOLVED-69) with no homage.
  const recipes = recipesOf("brand");

  it("has no 2★→3★ recipe (starters are granted from 3★) and none on the last (Omni) form", () => {
    expect(recipes["brand-2"]).toBeUndefined();
    expect(recipes["brand-omni"]).toBeUndefined();
  });

  it("Forge Hand 3★→4★: cinder effigy, cinder sprite, 100,000 Zel", () => {
    expect(recipes["brand-3"]).toEqual({
      units: [one("cinder-effigy"), one("cinder-sprite")],
      zel: 100_000,
    });
  });

  it("Forge Guard 4★→5★: cinder cairn, effigy, sprite, mote ×2, 200,000 Zel", () => {
    expect(recipes["brand-4"]).toEqual({
      units: [
        one("cinder-cairn"),
        one("cinder-effigy"),
        one("cinder-sprite"),
        { unit: "cinder-mote", count: 2 },
      ],
      zel: 200_000,
    });
  });

  it("Flame Guard 5★→6★: prism cairn, cinder cairn, effigy, sprite, mote, 500,000 Zel", () => {
    expect(recipes["brand-5"]).toEqual({
      units: [
        one("prism-cairn"),
        one("cinder-cairn"),
        one("cinder-effigy"),
        one("cinder-sprite"),
        one("cinder-mote"),
      ],
      zel: 500_000,
    });
  });

  it("Ember Knight 6★→7★: cinder colossus, prism cairn, cairn, effigy, Crown Shard, 1,500,000 Zel", () => {
    expect(recipes["brand-6"]).toEqual({
      units: [
        one("cinder-colossus"),
        one("prism-cairn"),
        one("cinder-cairn"),
        one("cinder-effigy"),
      ],
      items: [{ item: "crown-shard", count: 1 }],
      zel: 1_500_000,
    });
  });

  it("Forge Legend 7★→Omni (M4-02M): colossus ×2, prism cairn, cairn, effigy, sprite, mote, Crown Shard, Zenith Core, 3,000,000 Zel", () => {
    // Homage 7★ form page (RESOLVED-69 shape B0); the original's 1,000,000 Karma is dropped.
    expect(recipes["brand-7"]).toEqual({
      units: [
        { unit: "cinder-colossus", count: 2 },
        one("prism-cairn"),
        one("cinder-cairn"),
        one("cinder-effigy"),
        one("cinder-sprite"),
        one("cinder-mote"),
      ],
      items: [
        { item: "crown-shard", count: 1 },
        { item: "zenith-core", count: 1 },
      ],
      zel: 3_000_000,
    });
  });
});

describe("Maren evolution recipes (M4-02F)", () => {
  // Source: bravefrontierglobal.fandom.com form pages of Maren's homage unit (ROSTER.md), read
  // 2026-09-29. Homage IDs: 20130 Water Nymph → rill-mote, 20131 Water Spirit → rill-sprite,
  // 20132 Water Idol → rill-effigy, 20133 Water Totem → rill-cairn, 20344 Water Mecha God →
  // rill-colossus, 50354 Miracle Totem → prism-cairn, Legend Stone → crown-shard. The 7★→Omni
  // step drops the page's 1,000,000 Karma and adds the Zenith Core (RESOLVED-69).
  const recipes = recipesOf("maren");

  it("has no 2★→3★ recipe (starters are granted from 3★) and none on the last (Omni) form", () => {
    expect(recipes["maren-2"]).toBeUndefined();
    expect(recipes["maren-omni"]).toBeUndefined();
  });

  it("Pass Guide 3★→4★: rill effigy, rill sprite, 100,000 Zel", () => {
    expect(recipes["maren-3"]).toEqual({
      units: [one("rill-effigy"), one("rill-sprite")],
      zel: 100_000,
    });
  });

  it("Frost Guide 4★→5★: rill cairn, effigy, sprite, mote ×2, 200,000 Zel", () => {
    expect(recipes["maren-4"]).toEqual({
      units: [
        one("rill-cairn"),
        one("rill-effigy"),
        one("rill-sprite"),
        { unit: "rill-mote", count: 2 },
      ],
      zel: 200_000,
    });
  });

  it("Snow Warden 5★→6★: prism cairn, rill cairn, effigy, sprite, mote, 500,000 Zel", () => {
    expect(recipes["maren-5"]).toEqual({
      units: [
        one("prism-cairn"),
        one("rill-cairn"),
        one("rill-effigy"),
        one("rill-sprite"),
        one("rill-mote"),
      ],
      zel: 500_000,
    });
  });

  it("Frost Warden 6★→7★: rill colossus, prism cairn, cairn, effigy, Crown Shard, 1,500,000 Zel", () => {
    expect(recipes["maren-6"]).toEqual({
      units: [one("rill-colossus"), one("prism-cairn"), one("rill-cairn"), one("rill-effigy")],
      items: [{ item: "crown-shard", count: 1 }],
      zel: 1_500_000,
    });
  });

  it("Glacier Legend 7★→Omni: colossus ×2, prism cairn, cairn, effigy, sprite, mote, Crown Shard, Zenith Core, 3,000,000 Zel", () => {
    expect(recipes["maren-7"]).toEqual({
      units: [
        { unit: "rill-colossus", count: 2 },
        one("prism-cairn"),
        one("rill-cairn"),
        one("rill-effigy"),
        one("rill-sprite"),
        one("rill-mote"),
      ],
      items: [
        { item: "crown-shard", count: 1 },
        { item: "zenith-core", count: 1 },
      ],
      zel: 3_000_000,
    });
  });
});

describe("Rook evolution recipes (M4-02G)", () => {
  // Source: bravefrontierglobal.fandom.com form pages of Rook's homage unit (ROSTER.md), read
  // 2026-09-29. Homage IDs: 40130 Thunder Nymph → volt-mote, 40131 Thunder Spirit → volt-sprite,
  // 40132 Thunder Idol → volt-effigy, 40133 Thunder Totem → volt-cairn, 40334 Thunder Mecha God →
  // volt-colossus, 50354 Miracle Totem → prism-cairn, Legend Stone → crown-shard. The 7★→Omni
  // step drops the page's 1,000,000 Karma and adds the Zenith Core (RESOLVED-69).
  const recipes = recipesOf("rook");

  it("has no 2★→3★ recipe (starters are granted from 3★) and none on the last (Omni) form", () => {
    expect(recipes["rook-2"]).toBeUndefined();
    expect(recipes["rook-omni"]).toBeUndefined();
  });

  it("Spark Rigger 3★→4★: volt effigy, volt sprite, 100,000 Zel", () => {
    expect(recipes["rook-3"]).toEqual({
      units: [one("volt-effigy"), one("volt-sprite")],
      zel: 100_000,
    });
  });

  it("Storm Rigger 4★→5★: volt cairn, effigy, sprite, mote ×2, 200,000 Zel", () => {
    expect(recipes["rook-4"]).toEqual({
      units: [
        one("volt-cairn"),
        one("volt-effigy"),
        one("volt-sprite"),
        { unit: "volt-mote", count: 2 },
      ],
      zel: 200_000,
    });
  });

  it("Thunder Rigger 5★→6★: prism cairn, volt cairn, effigy, sprite, mote, 500,000 Zel", () => {
    expect(recipes["rook-5"]).toEqual({
      units: [
        one("prism-cairn"),
        one("volt-cairn"),
        one("volt-effigy"),
        one("volt-sprite"),
        one("volt-mote"),
      ],
      zel: 500_000,
    });
  });

  it("Stormcaller 6★→7★: volt colossus, prism cairn, cairn, effigy, Crown Shard, 1,500,000 Zel", () => {
    expect(recipes["rook-6"]).toEqual({
      units: [one("volt-colossus"), one("prism-cairn"), one("volt-cairn"), one("volt-effigy")],
      items: [{ item: "crown-shard", count: 1 }],
      zel: 1_500_000,
    });
  });

  it("Storm Legend 7★→Omni: colossus ×2, prism cairn, cairn, effigy, sprite, mote, Crown Shard, Zenith Core, 3,000,000 Zel", () => {
    expect(recipes["rook-7"]).toEqual({
      units: [
        { unit: "volt-colossus", count: 2 },
        one("prism-cairn"),
        one("volt-cairn"),
        one("volt-effigy"),
        one("volt-sprite"),
        one("volt-mote"),
      ],
      items: [
        { item: "crown-shard", count: 1 },
        { item: "zenith-core", count: 1 },
      ],
      zel: 3_000_000,
    });
  });
});

describe("Garrick evolution recipes (M4-02H)", () => {
  // Source: bravefrontierglobal.fandom.com form pages of Garrick's homage unit (ROSTER.md), read
  // 2026-09-29. Homage IDs: 30130 Earth Nymph → moss-mote, 30131 Earth Spirit → moss-sprite,
  // 30132 Earth Idol → moss-effigy, 30133 Earth Totem → moss-cairn, 30334 Earth Mecha God →
  // moss-colossus, 50354 Miracle Totem → prism-cairn, Legend Stone → crown-shard. The 7★→Omni
  // step drops the page's 1,000,000 Karma and adds the Zenith Core (RESOLVED-69).
  const recipes = recipesOf("garrick");

  it("has no 2★→3★ recipe (starters are granted from 3★) and none on the last (Omni) form", () => {
    expect(recipes["garrick-2"]).toBeUndefined();
    expect(recipes["garrick-omni"]).toBeUndefined();
  });

  it("Quarry Hand 3★→4★: moss effigy, moss sprite, 100,000 Zel", () => {
    expect(recipes["garrick-3"]).toEqual({
      units: [one("moss-effigy"), one("moss-sprite")],
      zel: 100_000,
    });
  });

  it("Stone Guard 4★→5★: moss cairn, effigy, sprite, mote ×2, 200,000 Zel", () => {
    expect(recipes["garrick-4"]).toEqual({
      units: [
        one("moss-cairn"),
        one("moss-effigy"),
        one("moss-sprite"),
        { unit: "moss-mote", count: 2 },
      ],
      zel: 200_000,
    });
  });

  it("Bulwark Guard 5★→6★: prism cairn, moss cairn, effigy, sprite, mote, 500,000 Zel", () => {
    expect(recipes["garrick-5"]).toEqual({
      units: [
        one("prism-cairn"),
        one("moss-cairn"),
        one("moss-effigy"),
        one("moss-sprite"),
        one("moss-mote"),
      ],
      zel: 500_000,
    });
  });

  it("Stonewall 6★→7★: moss colossus, prism cairn, cairn, effigy, Crown Shard, 1,500,000 Zel", () => {
    expect(recipes["garrick-6"]).toEqual({
      units: [one("moss-colossus"), one("prism-cairn"), one("moss-cairn"), one("moss-effigy")],
      items: [{ item: "crown-shard", count: 1 }],
      zel: 1_500_000,
    });
  });

  it("Bastion Legend 7★→Omni: colossus ×2, prism cairn, cairn, effigy, sprite, mote, Crown Shard, Zenith Core, 3,000,000 Zel", () => {
    expect(recipes["garrick-7"]).toEqual({
      units: [
        { unit: "moss-colossus", count: 2 },
        one("prism-cairn"),
        one("moss-cairn"),
        one("moss-effigy"),
        one("moss-sprite"),
        one("moss-mote"),
      ],
      items: [
        { item: "crown-shard", count: 1 },
        { item: "zenith-core", count: 1 },
      ],
      zel: 3_000_000,
    });
  });
});

describe("Solen evolution recipes (M4-02I)", () => {
  // Source: bravefrontierglobal.fandom.com form pages of Solen's homage unit (ROSTER.md), read
  // 2026-09-29. Homage IDs: 50120 Light Nymph → glint-mote, 50121 Light Spirit → glint-sprite,
  // 50122 Light Idol → glint-effigy, 50123 Light Totem → glint-cairn, 50394 Light Mecha God →
  // glint-colossus, 50354 Miracle Totem → prism-cairn, Legend Stone → crown-shard. The 7★→Omni
  // step drops the page's 1,000,000 Karma and adds the Zenith Core (RESOLVED-69).
  const recipes = recipesOf("solen");

  it("has no 2★→3★ recipe (starters are granted from 3★) and none on the last (Omni) form", () => {
    expect(recipes["solen-2"]).toBeUndefined();
    expect(recipes["solen-omni"]).toBeUndefined();
  });

  it("Almanac Apprentice 3★→4★: glint effigy, glint sprite, 100,000 Zel", () => {
    expect(recipes["solen-3"]).toEqual({
      units: [one("glint-effigy"), one("glint-sprite")],
      zel: 100_000,
    });
  });

  it("Sunwatch Scholar 4★→5★: glint cairn, effigy, sprite, mote ×2, 200,000 Zel", () => {
    expect(recipes["solen-4"]).toEqual({
      units: [
        one("glint-cairn"),
        one("glint-effigy"),
        one("glint-sprite"),
        { unit: "glint-mote", count: 2 },
      ],
      zel: 200_000,
    });
  });

  it("Sunwatch Sage 5★→6★: prism cairn, glint cairn, effigy, sprite, mote, 500,000 Zel", () => {
    expect(recipes["solen-5"]).toEqual({
      units: [
        one("prism-cairn"),
        one("glint-cairn"),
        one("glint-effigy"),
        one("glint-sprite"),
        one("glint-mote"),
      ],
      zel: 500_000,
    });
  });

  it("Dawnbearer 6★→7★: glint colossus, prism cairn, cairn, effigy, Crown Shard, 1,500,000 Zel", () => {
    expect(recipes["solen-6"]).toEqual({
      units: [one("glint-colossus"), one("prism-cairn"), one("glint-cairn"), one("glint-effigy")],
      items: [{ item: "crown-shard", count: 1 }],
      zel: 1_500_000,
    });
  });

  it("Zenith Legend 7★→Omni: colossus ×2, prism cairn, cairn, effigy, sprite, mote, Crown Shard, Zenith Core, 3,000,000 Zel", () => {
    expect(recipes["solen-7"]).toEqual({
      units: [
        { unit: "glint-colossus", count: 2 },
        one("prism-cairn"),
        one("glint-cairn"),
        one("glint-effigy"),
        one("glint-sprite"),
        one("glint-mote"),
      ],
      items: [
        { item: "crown-shard", count: 1 },
        { item: "zenith-core", count: 1 },
      ],
      zel: 3_000_000,
    });
  });
});

describe("Morrick evolution recipes (M4-02J)", () => {
  // Source: bravefrontierglobal.fandom.com form pages of Morrick's homage unit (ROSTER.md), read
  // 2026-09-29. Homage IDs: 60120 Dark Nymph → dusk-mote, 60121 Dark Spirit → dusk-sprite,
  // 60122 Dark Idol → dusk-effigy, 60123 Dark Totem → dusk-cairn, 60344 Dark Mecha God →
  // dusk-colossus, 50354 Miracle Totem → prism-cairn, Legend Stone → crown-shard. The 7★→Omni
  // step drops the page's 1,000,000 Karma and adds the Zenith Core (RESOLVED-69).
  const recipes = recipesOf("morrick");

  it("has no 2★→3★ recipe (starters are granted from 3★) and none on the last (Omni) form", () => {
    expect(recipes["morrick-2"]).toBeUndefined();
    expect(recipes["morrick-omni"]).toBeUndefined();
  });

  it("Driftwood Wisp 3★→4★: dusk effigy, dusk sprite, 100,000 Zel", () => {
    expect(recipes["morrick-3"]).toEqual({
      units: [one("dusk-effigy"), one("dusk-sprite")],
      zel: 100_000,
    });
  });

  it("Shade Oarsman 4★→5★: dusk cairn, effigy, sprite, mote ×2, 200,000 Zel", () => {
    expect(recipes["morrick-4"]).toEqual({
      units: [
        one("dusk-cairn"),
        one("dusk-effigy"),
        one("dusk-sprite"),
        { unit: "dusk-mote", count: 2 },
      ],
      zel: 200_000,
    });
  });

  it("Shade Boatman 5★→6★: prism cairn, dusk cairn, effigy, sprite, mote, 500,000 Zel", () => {
    expect(recipes["morrick-5"]).toEqual({
      units: [
        one("prism-cairn"),
        one("dusk-cairn"),
        one("dusk-effigy"),
        one("dusk-sprite"),
        one("dusk-mote"),
      ],
      zel: 500_000,
    });
  });

  it("Dusk Ferryman 6★→7★: dusk colossus, prism cairn, cairn, effigy, Crown Shard, 1,500,000 Zel", () => {
    expect(recipes["morrick-6"]).toEqual({
      units: [one("dusk-colossus"), one("prism-cairn"), one("dusk-cairn"), one("dusk-effigy")],
      items: [{ item: "crown-shard", count: 1 }],
      zel: 1_500_000,
    });
  });

  it("Duskwater Legend 7★→Omni: colossus ×2, prism cairn, cairn, effigy, sprite, mote, Crown Shard, Zenith Core, 3,000,000 Zel", () => {
    expect(recipes["morrick-7"]).toEqual({
      units: [
        { unit: "dusk-colossus", count: 2 },
        one("prism-cairn"),
        one("dusk-cairn"),
        one("dusk-effigy"),
        one("dusk-sprite"),
        one("dusk-mote"),
      ],
      items: [
        { item: "crown-shard", count: 1 },
        { item: "zenith-core", count: 1 },
      ],
      zel: 3_000_000,
    });
  });
});

describe("Aurelle evolution recipes (M4-02K)", () => {
  // Source: bravefrontierglobal.fandom.com form pages of Aurelle's homage unit (ROSTER.md), read
  // 2026-09-29 (5★→6★ and 6★→7★ also match the 2017-09-29 evo_list.json export). Homage IDs:
  // 50122 Light Idol → glint-effigy, 50123 Light Totem → glint-cairn, 50394 Light Mecha God →
  // glint-colossus, 50354 Miracle Totem → prism-cairn, 50191 Light Pot → glint-urn, 60144 Dragon
  // Mimic → wyrm-coffer, Legend Stone → crown-shard. The 7★ page lists 60224 Metal Mimic, which
  // BFR maps to wyrm-coffer (RESOLVED-74); the 7★→Omni step drops the page's 1,000,000 Karma and
  // adds the Zenith Core (RESOLVED-69).
  const recipes = recipesOf("aurelle");

  it("has no 3★→4★ or 4★→5★ recipe (summoned at 5★) and none on the last (Omni) form", () => {
    expect(recipes["aurelle-3"]).toBeUndefined();
    expect(recipes["aurelle-4"]).toBeUndefined();
    expect(recipes["aurelle-omni"]).toBeUndefined();
  });

  it("Eightfold Dancer 5★→6★: prism cairn, glint cairn ×2, glint effigy, wyrm coffer, 500,000 Zel", () => {
    expect(recipes["aurelle-5"]).toEqual({
      units: [
        one("prism-cairn"),
        { unit: "glint-cairn", count: 2 },
        one("glint-effigy"),
        one("wyrm-coffer"),
      ],
      zel: 500_000,
    });
  });

  it("Haloblade 6★→7★: glint colossus, prism cairn, glint cairn, glint urn, Crown Shard, 1,500,000 Zel", () => {
    expect(recipes["aurelle-6"]).toEqual({
      units: [one("glint-colossus"), one("prism-cairn"), one("glint-cairn"), one("glint-urn")],
      items: [{ item: "crown-shard", count: 1 }],
      zel: 1_500_000,
    });
  });

  it("Bladewing Legend 7★→Omni: colossus ×2, prism cairn, cairn, urn ×2, wyrm coffer, Crown Shard, Zenith Core, 3,000,000 Zel", () => {
    expect(recipes["aurelle-7"]).toEqual({
      units: [
        { unit: "glint-colossus", count: 2 },
        one("prism-cairn"),
        one("glint-cairn"),
        { unit: "glint-urn", count: 2 },
        one("wyrm-coffer"),
      ],
      items: [
        { item: "crown-shard", count: 1 },
        { item: "zenith-core", count: 1 },
      ],
      zel: 3_000_000,
    });
  });
});

describe("Vespera evolution recipes (M4-02L)", () => {
  // Source: bravefrontierglobal.fandom.com form pages of Vespera's homage unit (ROSTER.md), read
  // 2026-09-29 (5★→6★ and 6★→7★ also match the 2017-09-29 evo_list.json export). Homage IDs:
  // 60122 Dark Idol → dusk-effigy, 60123 Dark Totem → dusk-cairn, 60344 Dark Mecha God →
  // dusk-colossus, 50354 Miracle Totem → prism-cairn, 60201 Dark Pot → dusk-urn, 60144 Dragon
  // Mimic → wyrm-coffer, Legend Stone → crown-shard. The 7★ page lists 60224 Metal Mimic, which
  // BFR maps to wyrm-coffer (RESOLVED-74); the 7★→Omni step drops the page's 1,000,000 Karma and
  // adds the Zenith Core (RESOLVED-69).
  const recipes = recipesOf("vespera");

  it("has no 3★→4★ or 4★→5★ recipe (summoned at 5★) and none on the last (Omni) form", () => {
    expect(recipes["vespera-3"]).toBeUndefined();
    expect(recipes["vespera-4"]).toBeUndefined();
    expect(recipes["vespera-omni"]).toBeUndefined();
  });

  it("Scarlet Pin Idol 5★→6★: prism cairn, dusk cairn ×2, dusk effigy, wyrm coffer, 500,000 Zel", () => {
    expect(recipes["vespera-5"]).toEqual({
      units: [
        one("prism-cairn"),
        { unit: "dusk-cairn", count: 2 },
        one("dusk-effigy"),
        one("wyrm-coffer"),
      ],
      zel: 500_000,
    });
  });

  it("Gravebloom 6★→7★: dusk colossus, prism cairn, dusk cairn, dusk urn, Crown Shard, 1,500,000 Zel", () => {
    expect(recipes["vespera-6"]).toEqual({
      units: [one("dusk-colossus"), one("prism-cairn"), one("dusk-cairn"), one("dusk-urn")],
      items: [{ item: "crown-shard", count: 1 }],
      zel: 1_500_000,
    });
  });

  it("Scarlet Threadwing 7★→Omni: colossus ×2, prism cairn, cairn, urn ×2, wyrm coffer, Crown Shard, Zenith Core, 3,000,000 Zel", () => {
    expect(recipes["vespera-7"]).toEqual({
      units: [
        { unit: "dusk-colossus", count: 2 },
        one("prism-cairn"),
        one("dusk-cairn"),
        { unit: "dusk-urn", count: 2 },
        one("wyrm-coffer"),
      ],
      items: [
        { item: "crown-shard", count: 1 },
        { item: "zenith-core", count: 1 },
      ],
      zel: 3_000_000,
    });
  });
});

describe("Zenith Core item (M4-02M)", () => {
  const data: unknown = JSON.parse(readFileSync(join(itemsDir, "zenith-core.json"), "utf8"));

  it("is a material item that cannot be used in battle", () => {
    expect(MaterialItemSchema.parse(data)).toMatchObject({ id: "zenith-core", kind: "material" });
    expect(ItemSchema.safeParse(data).success).toBe(false);
  });
});
