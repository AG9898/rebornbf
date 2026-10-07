import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BatchSchema } from "../schemas/batch.ts";
import type { Burst } from "../schemas/burst.ts";
import { type Form, type Unit, UnitSchema } from "../schemas/unit.ts";

/**
 * The importer reproduces the hand-transcribed launch kits (UNIT_ROADMAP → Batch workflow): every
 * imported character that `replaces` a launch unit must match it field for field, except names,
 * IDs, and evolution recipes (the launch units use BFR's renamed materials). Kit differences BFR
 * set on purpose (ROSTER → Kit Notes) are listed here by launch form ID and the `kit` key they
 * leave out of the comparison (e.g. `"sbb"`).
 */
const KNOWN_DIFFERENCES: Readonly<Record<string, readonly string[]>> = {};

const content = join(import.meta.dirname, "..", "..", "content");

function readUnit(path: string): Unit {
  return UnitSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

const burstKit = ({ name: _name, ...rest }: Burst) => rest;

/** The parts of a form the importer must reproduce. */
function kit(form: Form) {
  return {
    rarity: form.rarity,
    maxLevel: form.maxLevel,
    stats: form.stats,
    impCaps: form.impCaps,
    normalAttack: form.normalAttack,
    bb: burstKit(form.bursts.bb),
    sbb: form.bursts.sbb && burstKit(form.bursts.sbb),
    ubb: form.bursts.ubb && burstKit(form.bursts.ubb),
    leaderSkill: form.leaderSkill?.effects,
    extraSkill: form.extraSkill?.effects,
    sphereSlots: form.sphereSlots,
  };
}

const batchDir = join(content, "original", "batches");
const pairs = (existsSync(batchDir) ? readdirSync(batchDir) : [])
  .map((file) => BatchSchema.parse(JSON.parse(readFileSync(join(batchDir, file), "utf8"))))
  .flatMap((batch) => batch.characters)
  .filter((character) => character.replaces !== undefined)
  .map((character) => ({
    imported: character.unit,
    launch: character.replaces ?? "",
  }));

describe.each(pairs)("$imported replaces $launch", ({ imported, launch }) => {
  const original = readUnit(join(content, "original", "units", `${imported}.json`));
  const renamed = readUnit(join(content, "units", `${launch}.json`));

  it("keeps the element, EXP curve, and form rarities", () => {
    expect(original.element).toBe(renamed.element);
    expect(original.expCurve).toBe(renamed.expCurve);
    expect(original.forms.map((form) => form.rarity)).toEqual(
      renamed.forms.map((form) => form.rarity),
    );
  });

  it.each(renamed.forms.map((form, i) => ({ id: form.id, i })))("matches $id", ({ id, i }) => {
    const want = kit(renamed.forms[i] as Form);
    const got = kit(original.forms[i] as Form);
    for (const key of KNOWN_DIFFERENCES[id] ?? []) {
      delete (want as Record<string, unknown>)[key];
      delete (got as Record<string, unknown>)[key];
    }
    expect(got).toEqual(want);
  });
});
