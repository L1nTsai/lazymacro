import { buildDish, estimateFood, lookupRestaurant, pickFoods } from "../ai/claude";
import type { createClient } from "../supabase/server";
import { FOOD_COLUMNS, searchBrandedFoods, searchFoods, toDraftFood } from "./foods-db";
import { withBroaderSearch, type ResolveDeps } from "./resolve";

type Client = Awaited<ReturnType<typeof createClient>>;

const CANDIDATE_LIMIT = 40;

export function resolveDeps(supabase: Client, userId: string): ResolveDeps {
  return {
    async alias(phrase) {
      const { data, error } = await supabase
        .from("user_aliases")
        .select(`default_grams, foods(${FOOD_COLUMNS})`)
        .eq("user_id", userId)
        .eq("phrase", phrase)
        .maybeSingle();
      if (error) throw error;
      if (!data?.foods) return null;
      return {
        food: toDraftFood(data.foods as never),
        defaultGrams: data.default_grams === null ? null : Number(data.default_grams),
      };
    },
    async lastChoice(parsedFood) {
      const { data, error } = await supabase
        .from("log_entries")
        .select(`foods(${FOOD_COLUMNS})`)
        .eq("user_id", userId)
        .eq("parsed_food", parsedFood)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.foods ? toDraftFood(data.foods as never) : null;
    },
    savedFoods: (query) => searchFoods(supabase, query, 20, ["custom", "restaurant"]),
    // Everyday foods can rank as low as 37th for a bare word like "milk", because
    // USDA lists many variants, so the matcher needs a long list to choose from.
    usdaCandidates: (query) => withBroaderSearch(query, (q) => searchFoods(supabase, q, CANDIDATE_LIMIT, ["usda"])),
    brandedFoods: (query) => searchBrandedFoods(query),
    pickFoods,
    lookupRestaurant,
    buildDish,
    estimateFood,
  };
}

/** What the parser is told about this person, to resolve "my whey" and the like. */
export async function parseContext(supabase: Client, userId: string) {
  const [aliases, recent] = await Promise.all([
    supabase.from("user_aliases").select("phrase").eq("user_id", userId).limit(100),
    supabase
      .from("log_entries")
      .select("parsed_food")
      .eq("user_id", userId)
      .not("parsed_food", "is", null)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (aliases.error) throw aliases.error;
  if (recent.error) throw recent.error;
  return {
    savedPhrases: aliases.data.map((row) => row.phrase),
    recentFoods: [...new Set(recent.data.map((row) => row.parsed_food as string))].slice(0, 20),
  };
}
