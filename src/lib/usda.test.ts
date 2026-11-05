import { describe, expect, it } from "vitest";
import { densityFromPortion, normalizePortion, pickEnergy } from "./usda";

describe("pickEnergy", () => {
  it("prefers measured energy over Atwater estimates", () => {
    expect(pickEnergy(100, 110, 120)).toBe(100);
    expect(pickEnergy(undefined, 110, 120)).toBe(110);
    expect(pickEnergy(undefined, undefined, 120)).toBe(120);
  });
  it("keeps a real zero rather than falling through", () => {
    expect(pickEnergy(0, 110, 120)).toBe(0);
  });
  it("returns undefined when nothing is known", () => {
    expect(pickEnergy(undefined, undefined, undefined)).toBeUndefined();
  });
});

describe("normalizePortion", () => {
  const base = { amount: 1, gramWeight: 244, unit: "", description: "", modifier: "" };

  it("reads SR Legacy portions, which keep the unit in the modifier", () => {
    expect(normalizePortion({ ...base, unit: "undetermined", modifier: "cup" })).toEqual({ label: "cup", grams: 244 });
  });
  it("scales the weight to one unit", () => {
    expect(normalizePortion({ ...base, amount: 2, unit: "tablespoon", gramWeight: 30 })).toEqual({ label: "tbsp", grams: 15 });
  });
  it("falls back to the description and strips its leading count", () => {
    expect(normalizePortion({ ...base, unit: "undetermined", description: "1 large egg", gramWeight: 50 })).toEqual({ label: "large egg", grams: 50 });
  });
  it("rejects portions with no usable weight or meaning", () => {
    expect(normalizePortion({ ...base, gramWeight: 0, modifier: "cup" })).toBeNull();
    expect(normalizePortion({ ...base, unit: "undetermined", description: "Quantity not specified" })).toBeNull();
  });
});

describe("densityFromPortion", () => {
  it("derives milk at about 1.03 g/ml from a cup", () => {
    expect(densityFromPortion({ label: "cup", grams: 244 })).toBeCloseTo(1.031, 3);
  });
  it("ignores loose-piece and non-volume portions", () => {
    expect(densityFromPortion({ label: "cup, chopped", grams: 150 })).toBeNull();
    expect(densityFromPortion({ label: "large egg", grams: 50 })).toBeNull();
  });
});
