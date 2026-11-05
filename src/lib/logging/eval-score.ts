import type { DraftMeal } from "./types";

export type ExpectedItem = [pattern: string, grams: number | null];

const GRAMS_TOLERANCE = 0.15;

/**
 * An item counts as right only if the person wouldn't need to edit it: the food
 * matches and the amount is close. Each found item can satisfy one expected item.
 */
export function scoreCase(expected: ExpectedItem[], meals: DraftMeal[], expectedMeals = 1) {
  const found = meals.flatMap((meal) => meal.items);
  const remaining = [...found];
  const misses: string[] = [];
  let correct = 0;

  for (const [pattern, grams] of expected) {
    const regex = new RegExp(pattern, "i");
    const index = remaining.findIndex((item) => regex.test(item.food.name));
    if (index === -1) {
      misses.push(`expected /${pattern}/, got: ${found.map((i) => i.food.name).join(" | ") || "nothing"}`);
      continue;
    }
    const [item] = remaining.splice(index, 1);
    if (grams !== null && Math.abs(item.grams - grams) > grams * GRAMS_TOLERANCE) {
      misses.push(`${item.food.name}: expected about ${grams} g, got ${item.grams} g`);
      continue;
    }
    correct++;
  }

  const extras = remaining.length;
  if (extras > 0) misses.push(`extra items: ${remaining.map((i) => i.food.name).join(" | ")}`);
  const mealsRight = expected.length === 0 ? meals.length === 0 : meals.length === expectedMeals;
  if (!mealsRight) misses.push(`expected ${expected.length === 0 ? 0 : expectedMeals} meal(s), got ${meals.length}`);

  return { correct, total: expected.length, extras, mealsRight, misses };
}
