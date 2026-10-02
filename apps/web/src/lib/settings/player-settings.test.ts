import { describe, expect, it } from "vitest";
import { DEFAULT_VOLUME } from "../../game/audio/sounds.ts";
import {
  audioLevels,
  autoSettingsArgs,
  autoSettingsUnits,
  battleSettingsArgs,
  DEFAULT_PLAYER_SETTINGS,
  parsePlayerSettings,
} from "./player-settings.ts";

describe("player settings (M7-01_1)", () => {
  it("gives the documented defaults when there is no row", () => {
    expect(parsePlayerSettings(null)).toEqual(DEFAULT_PLAYER_SETTINGS);
    expect(parsePlayerSettings({})).toEqual(DEFAULT_PLAYER_SETTINGS);
  });
  it("default volumes match the audio system's defaults", () => {
    expect(audioLevels(DEFAULT_PLAYER_SETTINGS)).toEqual(DEFAULT_VOLUME);
  });
  it("reads a saved row", () => {
    expect(
      parsePlayerSettings({
        spark_assist: true,
        battle_speed: 2,
        music_volume: 0,
        sfx_volume: 100,
        reduced_motion: true,
        unit_auto_modes: { a: "ubb", b: "guard" },
        sbb_priority: true,
        forced_bb_priority: true,
        od_ubb_priority: true,
      }),
    ).toEqual({
      sparkAssist: true,
      battleSpeed: 2,
      musicVolume: 0,
      sfxVolume: 100,
      reducedMotion: true,
      unitAutoModes: { a: "ubb", b: "guard" },
      sbbPriority: true,
      forcedBbPriority: true,
      odUbbPriority: true,
    });
  });
  it("falls back to defaults for malformed fields", () => {
    const parsed = parsePlayerSettings({
      spark_assist: "yes",
      battle_speed: 3,
      music_volume: 101,
      sfx_volume: 1.5,
      unit_auto_modes: { a: "heal", b: "bb" },
    });
    expect(parsed).toEqual({ ...DEFAULT_PLAYER_SETTINGS, unitAutoModes: { b: "bb" } });
    expect(parsePlayerSettings({ unit_auto_modes: ["bb"] }).unitAutoModes).toEqual({});
  });
});

describe("settings screen save arguments (M7-01_2)", () => {
  it("maps a draft to save_settings arguments for only its own fields", () => {
    expect(battleSettingsArgs({ sparkAssist: true, battleSpeed: 2, reducedMotion: false })).toEqual(
      {
        p_spark_assist: true,
        p_battle_speed: 2,
        p_reduced_motion: false,
      },
    );
  });
  it("refuses malformed drafts", () => {
    expect(battleSettingsArgs(null)).toBeNull();
    expect(
      battleSettingsArgs({ sparkAssist: true, battleSpeed: 3, reducedMotion: false }),
    ).toBeNull();
    expect(
      battleSettingsArgs({ sparkAssist: "yes", battleSpeed: 1, reducedMotion: false }),
    ).toBeNull();
    expect(battleSettingsArgs({ sparkAssist: false, battleSpeed: 1 })).toBeNull();
  });
});

describe("auto-battle settings save arguments (M7-01_3)", () => {
  const draft = {
    unitAutoModes: { "unit-a": "guard", "unit-b": "auto", "unit-c": "ubb" },
    sbbPriority: true,
    forcedBbPriority: false,
    odUbbPriority: true,
  };
  it("maps a draft to save_settings arguments, dropping Auto entries", () => {
    expect(autoSettingsArgs(draft)).toEqual({
      p_unit_auto_modes: { "unit-a": "guard", "unit-c": "ubb" },
      p_sbb_priority: true,
      p_forced_bb_priority: false,
      p_od_ubb_priority: true,
    });
  });
  it("refuses malformed drafts", () => {
    expect(autoSettingsArgs(null)).toBeNull();
    expect(autoSettingsArgs({ ...draft, unitAutoModes: { "unit-a": "nuke" } })).toBeNull();
    expect(autoSettingsArgs({ ...draft, unitAutoModes: ["guard"] })).toBeNull();
    expect(autoSettingsArgs({ ...draft, sbbPriority: "yes" })).toBeNull();
    expect(autoSettingsArgs({ unitAutoModes: {} })).toBeNull();
  });
});

describe("auto-settings unit list (M7-01_3)", () => {
  const owned = [
    { id: "a", name: "Brand", rarityLabel: "3★", level: 10 },
    { id: "b", name: "Maren", rarityLabel: "3★", level: 5 },
    { id: "c", name: "Rook", rarityLabel: "4★", level: 1 },
  ];
  it("lists each saved squad member once with its squads, and drops unowned saved modes", () => {
    const { units, modes } = autoSettingsUnits(
      [
        { slot: 2, unit_ids: ["c", "a"] },
        { slot: 0, unit_ids: ["a", "b", "gone"] },
      ],
      owned,
      { a: "guard", gone: "bb", c: "ubb" },
    );
    expect(units.map((unit) => [unit.id, unit.squads])).toEqual([
      ["a", [1, 3]],
      ["b", [1]],
      ["c", [3]],
    ]);
    expect(modes).toEqual({ a: "guard", c: "ubb" });
  });
});
