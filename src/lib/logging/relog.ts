import { localDate } from "../date";
import type { createClient } from "../supabase/server";
import { hourIn, mealFromHour, type MealType } from "./clock";

type Client = Awaited<ReturnType<typeof createClient>>;

export type RelogItem = { food_id: string; quantity: number | string; unit: string; grams: number | string };

/** Logs known items again as a new meal, with today's values from the database. */
export async function relog(
  supabase: Client,
  options: { clientId: string; timezone: string; items: RelogItem[]; mealType?: MealType; source?: "manual" },
) {
  const now = new Date();
  const { data, error } = await supabase.rpc("confirm_meals", {
    p_meals: [
      {
        client_id: options.clientId,
        eaten_on: localDate(options.timezone, now),
        meal_type: options.mealType ?? mealFromHour(hourIn(options.timezone, now)),
        source: options.source ?? "manual",
        transcript: null,
        items: options.items.map((item) => ({
          food_id: item.food_id,
          phrase: null,
          parsed_food: null,
          dish: null,
          quantity: Number(item.quantity),
          unit: item.unit,
          grams: Number(item.grams),
          adjusted: false,
          corrected: false,
          assumptions: [],
        })),
      },
    ],
  });
  if (error) throw error;
  return data;
}
