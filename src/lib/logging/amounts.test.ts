import { describe, expect, it } from "vitest";
import { macrosFor, normalizeUnit, servingToPer100g, toGrams } from "./amounts";

const milk = { densityGPerMl: 1.03, portions: [{ label: "cup", grams: 244 }] };
const egg = { densityGPerMl: null, portions: [{ label: "large", grams: 50 }, { label: "extra large", grams: 56 }, { label: "cup, chopped", grams: 136 }] };
const plain = { densityGPerMl: null, portions: [] };

describe("toGrams", () => {
  it("takes weights as given, in any unit", () => {
    expect(toGrams(60, "grams", plain)).toEqual({ grams: 60, assumption: null });
    expect(toGrams(1, "kilo", plain).grams).toBe(1000);
    expect(toGrams(4, "oz", plain).grams).toBe(113.4);
    expect(toGrams(1, "lb", plain).grams).toBe(453.6);
  });
  it("converts volume with density, and milk at about 1.03 g/ml", () => {
    expect(toGrams(300, "ml", milk).grams).toBe(309);
  });
  it("prefers the food's own measured cup over density", () => {
    expect(toGrams(2, "cups", milk)).toEqual({ grams: 488, assumption: null });
  });
  it("flags volume when density is unknown", () => {
    const result = toGrams(100, "ml", plain);
    expect(result.grams).toBe(100);
    expect(result.assumption).toMatch(/water/);
  });
  it("uses named portions and says so", () => {
    expect(toGrams(2, "large", egg)).toEqual({ grams: 100, assumption: "Assumed 1 large is 50 g" });
  });
  it("uses a typical size for vague amounts", () => {
    expect(toGrams(1, "scoop", plain)).toEqual({ grams: 30, assumption: "Assumed 1 scoop is 30 g" });
    expect(toGrams(2, "handfuls", plain).grams).toBe(60);
  });
  it("uses a person's saved portion without flagging it", () => {
    expect(toGrams(1, "scoop", plain, 32)).toEqual({ grams: 32, assumption: null });
  });
  it("still honours explicit weight over a saved portion", () => {
    expect(toGrams(50, "g", plain, 32).grams).toBe(50);
  });
  it("treats a food's saved serving as known, so a repeat keeps its calories", () => {
    expect(toGrams(1, "serving", { densityGPerMl: null, portions: [{ label: "serving", grams: 123 }] })).toEqual({ grams: 123, assumption: null });
  });
  it("flags anything it can't size", () => {
    const result = toGrams(2, "thing", plain);
    expect(result.grams).toBe(200);
    expect(result.assumption).toMatch(/Assumed/);
  });
});

describe("normalizeUnit", () => {
  it("understands how people say units", () => {
    expect(normalizeUnit("Tablespoons")).toBe("tbsp");
    expect(normalizeUnit("fluid ounces")).toBe("fl oz");
    expect(normalizeUnit("g.")).toBe("g");
  });
});

describe("macrosFor", () => {
  it("reproduces the plan's worked example", () => {
    const oats = macrosFor({ kcal: 379, protein: 13.15, carbs: 67.7, fat: 6.5 }, 60);
    expect(oats.kcal).toBe(227.4);
    expect(oats.protein).toBe(7.9);
  });
});

describe("servingToPer100g", () => {
  const sandwich = { kcal: 490, protein: 32, carbs: 40, fat: 22 };

  it("uses the published weight", () => {
    const { grams, per100g } = servingToPer100g(sandwich, 245);
    expect(grams).toBe(245);
    expect(per100g.kcal).toBe(200);
  });
  it("gives back the listed calories when the weight isn't published", () => {
    const { grams, per100g } = servingToPer100g(sandwich, null);
    expect(macrosFor(per100g, grams).kcal).toBeCloseTo(490, 0);
  });
  it("stays within what a real food can hold for a huge item", () => {
    const { per100g } = servingToPer100g({ kcal: 1800, protein: 80, carbs: 150, fat: 95 }, null);
    expect(per100g.kcal).toBeLessThanOrEqual(1000);
    expect(per100g.protein + per100g.carbs + per100g.fat).toBeLessThanOrEqual(100.5);
  });
  it("ignores a published weight that can't be right", () => {
    const { grams } = servingToPer100g(sandwich, 10);
    expect(grams).toBeGreaterThan(50);
  });
});
