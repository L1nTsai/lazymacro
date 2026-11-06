import { localDate } from "./date";
import { createClient } from "./supabase/server";

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];
export const MEAL_LABELS: Record<MealType, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snacks" };

const ENTRY_COLUMNS = "id, phrase, grams, kcal, protein_g, carbs_g, fat_g, confidence, foods(name)";

export type DayEntry = {
  id: string;
  phrase: string | null;
  grams: number | string;
  kcal: number | string;
  protein_g: number | string;
  carbs_g: number | string;
  fat_g: number | string;
  confidence: "verified" | "estimated" | "rough";
  foods: { name: string } | null;
};
export type DayMeal = { id: string; meal_type: MealType; log_entries: DayEntry[] };

/** Targets in force on a date, so past days keep the goal they had. */
export async function loadDay(userId: string, date: string) {
  const supabase = await createClient();
  const [target, meals] = await Promise.all([
    supabase
      .from("targets")
      .select("kcal, protein_g, carbs_g, fat_g")
      .eq("user_id", userId)
      .lte("effective_from", date)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("meals")
      .select(`id, meal_type, log_entries(${ENTRY_COLUMNS})`)
      .eq("user_id", userId)
      .eq("eaten_on", date)
      .order("created_at"),
  ]);
  if (target.error) throw target.error;
  if (meals.error) throw meals.error;
  return { goal: target.data, meals: meals.data as unknown as DayMeal[] };
}

/** Calories per day so far this month, and the target in force on any date. */
export async function loadMonth(userId: string, today: string) {
  const supabase = await createClient();
  const [meals, targets] = await Promise.all([
    supabase.from("meals").select("eaten_on, log_entries(kcal)").eq("user_id", userId).gte("eaten_on", `${today.slice(0, 8)}01`).lte("eaten_on", today),
    supabase.from("targets").select("effective_from, kcal").eq("user_id", userId).lte("effective_from", today).order("effective_from", { ascending: false }),
  ]);
  if (meals.error) throw meals.error;
  if (targets.error) throw targets.error;

  const eaten = new Map<string, number>();
  for (const meal of meals.data) {
    const kcal = meal.log_entries.reduce((total, entry) => total + Number(entry.kcal), 0);
    eaten.set(meal.eaten_on, (eaten.get(meal.eaten_on) ?? 0) + kcal);
  }
  const targetOn = (date: string) => targets.data.find((target) => target.effective_from <= date)?.kcal ?? null;
  return { eaten, targetOn };
}

export const loadToday = (userId: string, timezone: string) => loadDay(userId, localDate(timezone));

export function totals(meals: DayMeal[]) {
  const entries = meals.flatMap((meal) => meal.log_entries);
  const sum = (key: "kcal" | "protein_g" | "carbs_g" | "fat_g") => entries.reduce((total, entry) => total + Number(entry[key]), 0);
  return {
    entries,
    kcal: sum("kcal"),
    protein: sum("protein_g"),
    carbs: sum("carbs_g"),
    fat: sum("fat_g"),
    hasEstimates: entries.some((entry) => entry.confidence !== "verified"),
  };
}
