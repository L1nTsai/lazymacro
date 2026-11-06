import { describe, expect, it } from "vitest";
import { planMealIdeas } from "./meal-ideas";

const LEFT = { kcal: 2700, protein: 150, carbs: 300, fat: 90 };
const types = (hour: number, logged: Parameters<typeof planMealIdeas>[2] = []) => planMealIdeas(LEFT, hour, logged).map((idea) => idea.type);

describe("planMealIdeas", () => {
  it("only suggests meals still ahead at this hour", () => {
    expect(types(8)).toEqual(["breakfast", "lunch", "dinner", "snack"]);
    expect(types(12)).toEqual(["lunch", "dinner", "snack"]);
    expect(types(17)).toEqual(["dinner", "snack"]);
    expect(types(23)).toEqual(["snack"]);
    expect(types(2)).toEqual(["snack"]);
  });

  it("skips meals already logged", () => {
    expect(types(8, ["breakfast"])).toEqual(["lunch", "dinner", "snack"]);
  });

  it("falls back to a snack once every meal ahead is logged", () => {
    expect(types(23, ["snack"])).toEqual(["snack"]);
    expect(types(17, ["dinner", "snack"])).toEqual(["snack"]);
  });

  it("splits what's left evenly", () => {
    const ideas = planMealIdeas(LEFT, 12, []);
    expect(ideas).toHaveLength(3);
    for (const idea of ideas) expect(idea).toMatchObject({ kcal: 900, protein: 50, carbs: 100, fat: 30 });
  });

  it("never suggests a negative macro", () => {
    const [idea] = planMealIdeas({ ...LEFT, protein: -20 }, 23, []);
    expect(idea.protein).toBe(0);
    expect(idea.kcal).toBe(2700);
  });

  it("suggests nothing once the calorie target is reached", () => {
    expect(planMealIdeas({ ...LEFT, kcal: 0 }, 12, [])).toEqual([]);
    expect(planMealIdeas({ ...LEFT, kcal: -300 }, 12, [])).toEqual([]);
  });
});
