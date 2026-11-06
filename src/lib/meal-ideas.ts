import type { MealType } from "./logging/clock";

type Left = { kcal: number; protein: number; carbs: number; fat: number };

/** Placeholders until suggestions come from the fridge. */
const EXAMPLE_DISHES: Record<MealType, string> = {
  breakfast: "Eggs on toast with fruit",
  lunch: "Chicken rice bowl",
  dinner: "Salmon, potatoes and greens",
  snack: "Greek yogurt and berries",
};

/** The meals still ahead at this hour of the person's day, in the order they're eaten. */
function mealsAhead(hour: number): MealType[] {
  if (hour < 4 || hour >= 22) return ["snack"];
  if (hour < 11) return ["breakfast", "lunch", "dinner", "snack"];
  if (hour < 15) return ["lunch", "dinner", "snack"];
  return ["dinner", "snack"];
}

/** Splits what's left today evenly across the meals not yet logged. Empty once the target is reached. */
export function planMealIdeas(left: Left, hour: number, logged: MealType[]) {
  if (left.kcal < 1) return [];
  const open = mealsAhead(hour).filter((type) => !logged.includes(type));
  const meals = open.length ? open : (["snack"] as MealType[]);
  const share = (amount: number) => Math.round(Math.max(amount, 0) / meals.length);
  return meals.map((type) => ({
    type,
    dish: EXAMPLE_DISHES[type],
    kcal: share(left.kcal),
    protein: share(left.protein),
    carbs: share(left.carbs),
    fat: share(left.fat),
  }));
}
