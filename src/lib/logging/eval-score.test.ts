import { describe, expect, it } from "vitest";
import { scoreCase } from "./eval-score";
import type { DraftMeal } from "./types";

const meal = (...items: [string, number][]): DraftMeal =>
  ({ items: items.map(([name, grams]) => ({ grams, food: { name } })) }) as unknown as DraftMeal;

describe("scoreCase", () => {
  it("counts a matching food within 15% of the weight", () => {
    expect(scoreCase([["^Milk", 300]], [meal(["Milk, whole", 309])]).correct).toBe(1);
  });
  it("rejects the right food at the wrong amount", () => {
    const score = scoreCase([["^Milk", 300]], [meal(["Milk, whole", 100])]);
    expect(score.correct).toBe(0);
    expect(score.misses[0]).toMatch(/about 300 g/);
  });
  it("ignores weight when the amount was vague", () => {
    expect(scoreCase([["almonds", null]], [meal(["Nuts, almonds", 30])]).correct).toBe(1);
  });
  it("doesn't let one found item satisfy two expected ones", () => {
    expect(scoreCase([["rice", 100], ["rice", 100]], [meal(["Rice, white", 100])]).correct).toBe(1);
  });
  it("reports food that was invented", () => {
    const score = scoreCase([["rice", 100]], [meal(["Rice, white", 100], ["Chicken", 50])]);
    expect(score.extras).toBe(1);
  });
  it("expects nothing from a sentence with no food", () => {
    expect(scoreCase([], []).mealsRight).toBe(true);
    expect(scoreCase([], [meal(["Rice", 1])]).mealsRight).toBe(false);
  });
  it("checks how many meals it split into", () => {
    expect(scoreCase([["a", null]], [meal(["a", 1]), meal(["a", 1])], 1).mealsRight).toBe(false);
  });
});
