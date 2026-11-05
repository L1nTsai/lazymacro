import { describe, expect, it } from "vitest";
import { calculateTargets, isBelowCommonMinimum, restingEnergy, type BodyDetails } from "./targets";

const man: BodyDetails = { sex: "male", age: 30, heightCm: 180, weightKg: 80, activity: "moderate", goal: "maintain", paceKgPerWeek: 0 };

describe("restingEnergy", () => {
  it("applies Mifflin–St Jeor for each sex", () => {
    expect(restingEnergy(man)).toBe(1780);
    expect(restingEnergy({ ...man, sex: "female" })).toBe(1614);
  });
});

describe("calculateTargets", () => {
  it("multiplies by activity at maintenance", () => {
    expect(calculateTargets(man).kcal).toBe(2759);
  });
  it("uses the pace for losing and gaining", () => {
    expect(calculateTargets({ ...man, goal: "lose", paceKgPerWeek: 0.5 }).kcal).toBe(2209);
    expect(calculateTargets({ ...man, goal: "gain", paceKgPerWeek: 0.5 }).kcal).toBe(3309);
  });
  it("sets protein at 1.6 g/kg and splits the rest between fat and carbs", () => {
    const t = calculateTargets({ ...man, goal: "lose", paceKgPerWeek: 0.5 });
    expect(t.proteinG).toBe(128);
    expect(t.fatG).toBe(67);
    expect(t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9).toBeCloseTo(t.kcal, -1);
  });
  it("never produces negative carbs", () => {
    const t = calculateTargets({ ...man, sex: "female", age: 80, heightCm: 150, weightKg: 150, activity: "sedentary", goal: "lose", paceKgPerWeek: 1.5 });
    expect(t.carbsG).toBeGreaterThanOrEqual(0);
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
