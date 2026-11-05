import { z } from "zod";
import type { createClient } from "../supabase/server";
import { draftMealSchema, type DraftFood } from "./types";

type Client = Awaited<ReturnType<typeof createClient>>;

export const confirmSchema = z.object({
  meals: z.array(draftMealSchema).min(1).max(10),
  favoriteName: z.string().trim().min(1).max(80).nullable(),
});

/** Adds a food that came from outside the database, and returns its id. */
export async function ensureFood(supabase: Client, food: DraftFood): Promise<string> {
  if (food.id) return food.id;
  if (!food.newFood) throw new Error("Food has neither an id nor a source.");
  const { data, error } = await supabase.rpc("save_food", {
    p: {
      source: food.newFood.source,
      source_id: food.newFood.sourceId,
      source_url: food.sourceUrl,
      confidence: food.trust,
      name: food.name,
      brand: food.brand,
      kcal_per_100g: food.kcal,
      protein_per_100g: food.protein,
      carbs_per_100g: food.carbs,
      fat_per_100g: food.fat,
      serving_grams: food.portions.find((portion) => portion.label === "serving")?.grams ?? null,
    },
  });
  if (error) throw error;
  return data as string;
}
