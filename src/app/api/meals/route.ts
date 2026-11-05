import { NextResponse, type NextRequest } from "next/server";
import { badRequest } from "@/lib/logging/api";
import { confirmSchema, ensureFood } from "@/lib/logging/save";
import { createClient, getUserId } from "@/lib/supabase/server";

/**
 * Confirms drafts. Safe to retry: each meal's client id makes a repeat a no-op,
 * and foods are de-duplicated by name. Macros are computed by the database.
 */
export async function POST(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const parsed = confirmSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Check the meal's items and try again.");
  const { meals, favoriteName } = parsed.data;
  if (meals.some((meal) => meal.items.length === 0)) return badRequest("Add at least one item to each meal.");

  try {
    const supabase = await createClient();
    const payload = await Promise.all(
      meals.map(async (meal) => ({
        client_id: meal.clientId,
        eaten_on: meal.eatenOn,
        meal_type: meal.mealType,
        source: meal.source,
        transcript: meal.transcript,
        items: await Promise.all(
          meal.items.map(async (item) => ({
            food_id: await ensureFood(supabase, item.food),
            phrase: item.phrase,
            parsed_food: item.parsedFood,
            dish: item.dish,
            quantity: item.quantity,
            unit: item.unit,
            grams: item.grams,
            adjusted: item.adjusted,
            corrected: item.corrected,
            assumptions: item.assumptions,
          })),
        ),
      })),
    );

    const { data, error } = await supabase.rpc("confirm_meals", { p_meals: payload });
    if (error) throw error;

    if (favoriteName) {
      const items = payload.flatMap((meal) => meal.items.map(({ food_id, quantity, unit, grams }) => ({ food_id, quantity, unit, grams })));
      const { error: favoriteError } = await supabase.rpc("save_favorite", { p_name: favoriteName, p_items: items });
      if (favoriteError) throw favoriteError;
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("confirm_failed", { message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Your meal wasn't saved. Try again; it won't be logged twice.", retryable: true }, { status: 500 });
  }
}
