import type { DraftFood } from "./types";
import type { createClient } from "../supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export const FOOD_COLUMNS =
  "id, name, brand, confidence, source, source_url, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, density_g_per_ml, food_portions(label, grams)";

type FoodRow = {
  id: string;
  name: string;
  brand: string | null;
  confidence: DraftFood["trust"];
  source: string;
  source_url: string | null;
  kcal_per_100g: number | string;
  protein_per_100g: number | string;
  carbs_per_100g: number | string;
  fat_per_100g: number | string;
  density_g_per_ml: number | string | null;
  food_portions: { label: string; grams: number | string }[] | null;
};

export function toDraftFood(row: FoodRow): DraftFood {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    trust: row.confidence,
    sourceUrl: row.source_url,
    kcal: Number(row.kcal_per_100g),
    protein: Number(row.protein_per_100g),
    carbs: Number(row.carbs_per_100g),
    fat: Number(row.fat_per_100g),
    densityGPerMl: row.density_g_per_ml === null ? null : Number(row.density_g_per_ml),
    portions: (row.food_portions ?? []).map((p) => ({ label: p.label, grams: Number(p.grams) })),
    newFood: null,
  };
}

export async function loadFood(supabase: Client, id: string): Promise<DraftFood | null> {
  const { data, error } = await supabase.from("foods").select(FOOD_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toDraftFood(data as unknown as FoodRow) : null;
}

/** Runs the ranked search, then loads full details, keeping the ranking. */
export async function searchFoods(supabase: Client, query: string, limit: number, sources?: string[]): Promise<DraftFood[]> {
  const { data: ranked, error } = await supabase.rpc("search_foods", { q: query, max_results: limit });
  if (error) throw error;
  const rows = (ranked ?? []) as { id: string; source: string }[];
  const ids = rows.filter((row) => !sources || sources.includes(row.source)).map((row) => row.id);
  if (ids.length === 0) return [];

  const { data, error: detailError } = await supabase.from("foods").select(FOOD_COLUMNS).in("id", ids);
  if (detailError) throw detailError;
  const byId = new Map((data as unknown as FoodRow[]).map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [toDraftFood(row)] : [];
  });
}

const BRANDED_TIMEOUT_MS = 3000;
const NUTRIENT = { kcal: 1008, protein: 1003, carbs: 1005, fat: 1004 };

/** USDA's branded foods, over its API. Optional: it needs a free data.gov key. */
export async function searchBrandedFoods(query: string, fetcher: typeof fetch = fetch): Promise<DraftFood[]> {
  const key = process.env.USDA_API_KEY;
  if (!key) return [];
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", key);
  url.searchParams.set("query", query);
  url.searchParams.set("dataType", "Branded");
  url.searchParams.set("pageSize", "5");

  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(BRANDED_TIMEOUT_MS) });
    if (!response.ok) {
      console.error("usda_branded_failed", { status: response.status });
      return [];
    }
    const body = (await response.json()) as {
      foods?: { fdcId: number; description: string; brandName?: string; brandOwner?: string; foodNutrients?: { nutrientId: number; value?: number }[] }[];
    };
    return (body.foods ?? []).flatMap((food) => {
      const value = (id: number) => food.foodNutrients?.find((n) => n.nutrientId === id)?.value;
      const kcal = value(NUTRIENT.kcal);
      const protein = value(NUTRIENT.protein);
      const carbs = value(NUTRIENT.carbs);
      const fat = value(NUTRIENT.fat);
      if (kcal === undefined || protein === undefined || carbs === undefined || fat === undefined) return [];
      if (kcal > 1000 || protein > 100 || carbs > 100 || fat > 100) return [];
      return [
        {
          id: null,
          name: food.description,
          brand: food.brandName ?? food.brandOwner ?? null,
          trust: "verified" as const,
          sourceUrl: `https://fdc.nal.usda.gov/food-details/${food.fdcId}/nutrients`,
          kcal,
          protein,
          carbs,
          fat,
          densityGPerMl: null,
          portions: [],
          newFood: { source: "usda" as const, sourceId: String(food.fdcId) },
        },
      ];
    });
  } catch (error) {
    console.error("usda_branded_failed", { message: error instanceof Error ? error.message : "unknown" });
    return [];
  }
}
