import { describe, expect, it } from "vitest";
import {
  buildExport,
  type FacePoints,
  FORMS,
  formKey,
  parseSave,
  pointsFromRow,
  rowFromPoints,
  SPLASH_FORMS,
  savedByKey,
  webToMaster,
} from "./face-points.ts";

const POINTS: FacePoints = { leftEye: [400, 300], rightEye: [460, 302], chin: [430, 380] };

describe("SPLASH_FORMS", () => {
  it("lists all six forms of all eight launch units", () => {
    expect(SPLASH_FORMS).toHaveLength(48);
    const units = new Set(SPLASH_FORMS.map((f) => f.unit));
    expect([...units].sort()).toEqual(
      ["aurelle", "brand", "garrick", "maren", "morrick", "rook", "solen", "vespera"].sort(),
    );
    for (const unit of units) {
      expect(SPLASH_FORMS.filter((f) => f.unit === unit).map((f) => f.form)).toEqual(FORMS);
    }
  });

  it("points each form at its web splash", () => {
    const brand = SPLASH_FORMS.find((f) => f.unit === "brand" && f.form === "omni");
    expect(brand?.src).toBe("/assets/units/brand/illustration-omni.png");
  });
});

describe("webToMaster", () => {
  it("maps a hand-set ui.json face point back to itself through the splash frame", () => {
    // Brand 6★'s card face in ui.json is [853, 470] master pixels.
    const brand = SPLASH_FORMS.find((f) => f.unit === "brand" && f.form === "6star");
    if (!brand) throw new Error("brand 6star missing");
    const { frame } = brand;
    const web: [number, number] = [
      (853 - frame.origin[0]) * frame.scale + frame.offset[0],
      (470 - frame.origin[1]) * frame.scale + frame.offset[1],
    ];
    expect(webToMaster(frame, web)).toEqual([853, 470]);
  });
});

describe("rows", () => {
  it("round-trips a face_points row", () => {
    const row = rowFromPoints("maren", "6star", POINTS);
    expect(row).toMatchObject({ unit_id: "maren", form: "6star", chin_y: 380 });
    expect(pointsFromRow(row)).toEqual(POINTS);
  });

  it("keys saved rows by unit and form and drops unknown forms", () => {
    const saved = savedByKey([
      rowFromPoints("maren", "6star", POINTS),
      { ...rowFromPoints("maren", "6star", POINTS), unit_id: "nobody" },
    ]);
    expect(Object.keys(saved)).toEqual([formKey("maren", "6star")]);
  });
});

describe("parseSave", () => {
  it("accepts a known form with three in-range points and rounds to 0.1 px", () => {
    const parsed = parseSave("rook", "omni", { ...POINTS, chin: [430.123, 380.06] });
    expect(parsed).toEqual({
      unit: "rook",
      form: "omni",
      points: { ...POINTS, chin: [430.1, 380.1] },
    });
  });

  it("rejects unknown units and forms, missing markers, and points off the splash", () => {
    expect(parseSave("nobody", "6star", POINTS)).toBeNull();
    expect(parseSave("rook", "8star", POINTS)).toBeNull();
    expect(parseSave("rook", "6star", { leftEye: [1, 1], rightEye: [2, 2] })).toBeNull();
    expect(parseSave("rook", "6star", { ...POINTS, chin: [2000, 10] })).toBeNull();
    expect(parseSave("rook", "6star", { ...POINTS, chin: [Number.NaN, 10] })).toBeNull();
  });
});

describe("buildExport", () => {
  it("keys master-pixel points by unit and form in ui.json's cards shape", () => {
    const out = buildExport({
      [formKey("maren", "6star")]: POINTS,
      [formKey("maren", "omni")]: POINTS,
      [formKey("brand", "3star")]: POINTS,
    });
    expect(Object.keys(out.cards.units).sort()).toEqual(["brand", "maren"]);
    expect(Object.keys(out.cards.units.maren?.faces ?? {})).toEqual(["6star", "omni"]);
    const maren = SPLASH_FORMS.find((f) => f.unit === "maren" && f.form === "6star");
    if (!maren) throw new Error("maren 6star missing");
    expect(out.cards.units.maren?.faces["6star"]?.chin).toEqual(
      webToMaster(maren.frame, POINTS.chin),
    );
    expect(out.cards.faceNote).toMatch(/master splash pixels/);
  });
});
