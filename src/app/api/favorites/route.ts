import { NextResponse } from "next/server";
import { createClient, getUserId } from "@/lib/supabase/server";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("favorites")
    .select("id, name, favorite_items(grams, foods(kcal_per_100g))")
    .eq("user_id", userId)
    .order("name");
  if (error) {
    console.error("favorites_load_failed", { code: error.code });
    return NextResponse.json({ error: "Favorites didn't load. Try again." }, { status: 500 });
  }
  const favorites = data.map((favorite) => ({
    id: favorite.id,
    name: favorite.name,
    kcal: Math.round(
      favorite.favorite_items.reduce((total, item) => {
        const food = item.foods as unknown as { kcal_per_100g: number | string };
        return total + (Number(food.kcal_per_100g) * Number(item.grams)) / 100;
      }, 0),
    ),
  }));
  return NextResponse.json({ favorites });
}
