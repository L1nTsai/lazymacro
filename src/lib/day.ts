import { localDate } from "./date";
import { createClient } from "./supabase/server";

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];
export const MEAL_LABELS: Record<MealType, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snacks" };

export async function loadToday(userId: string, timezone: string) {
  const supabase = await createClient();
  const today = localDate(timezone);
  const [target, meals] = await Promise.all([
    supabase
      .from("targets")
      .select("kcal, protein_g, carbs_g, fat_g")
      .eq("user_id", userId)
      .lte("effective_from", today)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("meals")
      .select("id, meal_type, log_entries(id, phrase, grams, kcal, protein_g, carbs_g, fat_g)")
      .eq("user_id", userId)
      .eq("eaten_on", today)
      .order("created_at"),
  ]);
  if (target.error) throw target.error;
  if (meals.error) throw meals.error;
  return { goal: target.data, meals: meals.data };
}
