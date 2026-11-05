import { describe, expect, it } from "vitest";
import {
  calorieTarget,
  DEFAULT_FORMULA,
  formulaIsValid,
  isBelowCommonMinimum,
  macrosFor,
  restingEnergy,
  type BodyDetails,
  type MacroFormula,
} from "./targets";

const man: BodyDetails = { sex: "male", age: 30, heightCm: 180, weightKg: 80, activity: "moderate", goal: "maintain", paceKgPerWeek: 0 };
const macroKcal = (t: { proteinG: number; carbsG: number; fatG: number }) => t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9;

describe("restingEnergy", () => {
  it("applies Mifflin–St Jeor for each sex", () => {
    expect(restingEnergy(man)).toBe(1780);
    expect(restingEnergy({ ...man, sex: "female" })).toBe(1614);
  });
});

describe("calorieTarget", () => {
  it("multiplies by activity at maintenance", () => {
    expect(calorieTarget(man)).toBe(2759);
  });
  it("uses the pace for losing and gaining", () => {
    expect(calorieTarget({ ...man, goal: "lose", paceKgPerWeek: 0.5 })).toBe(2209);
    expect(calorieTarget({ ...man, goal: "gain", paceKgPerWeek: 0.5 })).toBe(3309);
  });
});

describe("macrosFor", () => {
  it("defaults to 1 g of protein per lb and 25% fat, with carbs taking the rest", () => {
    expect(macrosFor(2209, 176, DEFAULT_FORMULA)).toEqual({ kcal: 2209, proteinG: 176, carbsG: 239, fatG: 61, raised: false });
  });
  it("uses the chosen protein ratio", () => {
    expect(macrosFor(2209, 176, { ...DEFAULT_FORMULA, proteinGPerLb: 0.8 }).proteinG).toBe(141);
  });
  it("takes fat as a share of calories", () => {
    expect(macrosFor(2700, 150, { ...DEFAULT_FORMULA, fatValue: 20 }).fatG).toBe(60);
    expect(macrosFor(2700, 150, { ...DEFAULT_FORMULA, fatValue: 30 }).fatG).toBe(90);
  });
  it("keeps fat grams fixed when calories change", () => {
    const grams: MacroFormula = { ...DEFAULT_FORMULA, fatUnit: "grams", fatValue: 70 };
    expect(macrosFor(2200, 150, grams).fatG).toBe(70);
    expect(macrosFor(2800, 150, grams).fatG).toBe(70);
  });
  it("raises calories to fit protein and a fat share", () => {
    expect(macrosFor(1059, 243, DEFAULT_FORMULA)).toEqual({ kcal: 1296, proteinG: 243, carbsG: 0, fatG: 36, raised: true });
  });
  it("raises calories to fit protein and fixed fat grams", () => {
    expect(macrosFor(500, 100, { ...DEFAULT_FORMULA, fatUnit: "grams", fatValue: 50 })).toEqual({ kcal: 850, proteinG: 100, carbsG: 0, fatG: 50, raised: true });
  });
  it("handles a calculated target below zero", () => {
    expect(macrosFor(-200, 100, DEFAULT_FORMULA).raised).toBe(true);
    expect(macrosFor(-200, 100, DEFAULT_FORMULA).kcal).toBeGreaterThan(0);
  });
  it("always adds up to the calories, within rounding", () => {
    const formulas: MacroFormula[] = [
      DEFAULT_FORMULA,
      { proteinGPerLb: 0.7, fatUnit: "percent", fatValue: 20 },
      { proteinGPerLb: 1.2, fatUnit: "percent", fatValue: 33.3 },
      { proteinGPerLb: 3, fatUnit: "percent", fatValue: 90 },
      { proteinGPerLb: 0, fatUnit: "percent", fatValue: 0 },
      { proteinGPerLb: 1, fatUnit: "grams", fatValue: 65.5 },
    ];
    for (const formula of formulas) {
      for (const kcal of [200, 1059, 1800, 2700, 4000]) {
        for (const weightLb of [90, 176, 331]) {
          const t = macrosFor(kcal, weightLb, formula);
          expect(Math.abs(macroKcal(t) - t.kcal)).toBeLessThanOrEqual(2);
          expect(t.carbsG).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe("formulaIsValid", () => {
  it("accepts the default and rejects values outside the ranges", () => {
    expect(formulaIsValid(DEFAULT_FORMULA)).toBe(true);
    expect(formulaIsValid({ ...DEFAULT_FORMULA, proteinGPerLb: NaN })).toBe(false);
    expect(formulaIsValid({ ...DEFAULT_FORMULA, proteinGPerLb: 3.1 })).toBe(false);
    expect(formulaIsValid({ ...DEFAULT_FORMULA, fatValue: 91 })).toBe(false);
    expect(formulaIsValid({ ...DEFAULT_FORMULA, fatUnit: "grams", fatValue: 91 })).toBe(true);
    expect(formulaIsValid({ ...DEFAULT_FORMULA, fatValue: -1 })).toBe(false);
  });
});

describe("isBelowCommonMinimum", () => {
  it("uses 1,500 for men and 1,200 otherwise", () => {
    expect(isBelowCommonMinimum(1499, "male")).toBe(true);
    expect(isBelowCommonMinimum(1500, "male")).toBe(false);
    expect(isBelowCommonMinimum(1199, "female")).toBe(true);
    expect(isBelowCommonMinimum(1200, null)).toBe(false);
  });
});
