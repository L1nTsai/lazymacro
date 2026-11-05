import { randomUUID } from "node:crypto";
import type { Estimate, ParsedItem, ParsedMeals, RestaurantResult } from "../ai/schemas";
import { addDays, mealFromHour, type MealType } from "./clock";
import { servingToPer100g, toGrams } from "./amounts";
import type { DraftFood, DraftItem, DraftMeal } from "./types";

/** Everything resolving needs from the outside world, so tests can supply it. */
export type ResolveDeps = {
  alias(phrase: string): Promise<{ food: DraftFood; defaultGrams: number | null } | null>;
  lastChoice(parsedFood: string): Promise<DraftFood | null>;
  savedFoods(query: string): Promise<DraftFood[]>;
  usdaCandidates(query: string): Promise<DraftFood[]>;
  brandedFoods(query: string): Promise<DraftFood[]>;
  pickFoods(items: { phrase: string; food: string; candidates: string[] }[]): Promise<(number | null)[]>;
  lookupRestaurant(item: { phrase: string; chain: string; modifications: string[] }): Promise<RestaurantResult | null>;
  buildDish(phrase: string): Promise<{ food: string; grams: number }[]>;
  estimateFood(phrase: string): Promise<Estimate>;
};

export type ResolveContext = { today: string; hour: number; source: "voice" | "text"; transcript: string };

const normalize = (text: string) => text.trim().toLowerCase();

function itemFrom(
  parsed: ParsedItem,
  food: DraftFood,
  options: { defaultGrams?: number | null; assumptions?: string[]; adjusted?: boolean; quantity?: number; unit?: string; grams?: number; dish?: string | null } = {},
): DraftItem {
  const quantity = options.quantity ?? parsed.quantity ?? 1;
  const unit = options.unit ?? parsed.unit;
  const { grams, assumption } =
    options.grams !== undefined
      ? { grams: options.grams, assumption: null }
      : toGrams(quantity, unit, food, options.defaultGrams ?? null);
  const assumptions = [...(options.assumptions ?? parsed.assumptions)];
  if (assumption) assumptions.push(assumption);
  return {
    key: randomUUID(),
    phrase: parsed.phrase,
    parsedFood: normalize(parsed.food),
    dish: options.dish ?? null,
    quantity,
    unit,
    grams,
    food,
    adjusted: options.adjusted ?? false,
    corrected: false,
    assumptions,
  };
}

const notInDatabase = (name: string, brand: string | null, trust: DraftFood["trust"], sourceUrl: string | null, source: "custom" | "restaurant", macros: { kcal: number; protein: number; carbs: number; fat: number }): DraftFood => ({
  id: null,
  name,
  brand,
  trust,
  sourceUrl,
  ...macros,
  densityGPerMl: null,
  portions: [],
  newFood: { source, sourceId: null },
});

/** The chain's official numbers. Macros from the web must still look like food. */
function restaurantItem(parsed: ParsedItem, found: RestaurantResult): DraftItem | null {
  if (found.kcal === null || found.protein_g === null || found.carbs_g === null || found.fat_g === null || !found.name || !found.url) return null;
  const values = [found.kcal, found.protein_g, found.carbs_g, found.fat_g];
  if (values.some((n) => !Number.isFinite(n) || n < 0) || found.kcal > 10000) return null;

  const { grams, per100g } = servingToPer100g(
    { kcal: found.kcal, protein: found.protein_g, carbs: found.carbs_g, fat: found.fat_g },
    found.serving_grams,
  );
  const name = found.adjusted && parsed.modifications.length ? `${found.name} (${parsed.modifications.join(", ")})` : found.name;
  const food: DraftFood = {
    ...notInDatabase(name, found.chain ?? parsed.restaurant, "verified", found.url, "restaurant", per100g),
    portions: [{ label: "serving", grams }],
  };
  const quantity = parsed.quantity ?? 1;
  return itemFrom(parsed, food, {
    adjusted: found.adjusted,
    quantity,
    unit: "serving",
    grams: Math.round(quantity * grams * 10) / 10,
    assumptions: found.adjusted ? ["Adjusted for your order changes"] : [],
  });
}

async function buildFromIngredients(parsed: ParsedItem, deps: ResolveDeps): Promise<DraftItem[] | null> {
  let parts: { food: string; grams: number }[];
  try {
    parts = await deps.buildDish(parsed.phrase);
  } catch {
    return null;
  }
  if (parts.length === 0) return null;

  const candidates = await Promise.all(parts.map((part) => deps.usdaCandidates(part.food)));
  // Every part must come from the database, or the numbers wouldn't be sourced.
  if (candidates.some((list) => list.length === 0)) return null;

  let picks: (number | null)[];
  try {
    picks = await deps.pickFoods(parts.map((part, i) => ({ phrase: part.food, food: part.food, candidates: candidates[i].map((c) => c.name) })));
  } catch {
    return null;
  }
  if (picks.some((pick) => pick === null)) return null;

  const servings = parsed.quantity ?? 1;
  return parts.map((part, i) => {
    const food = candidates[i][picks[i]!];
    const partial = { ...parsed, phrase: part.food, food: part.food, assumptions: [] };
    return itemFrom(partial, { ...food, trust: "estimated" }, {
      quantity: Math.round(part.grams * servings * 10) / 10,
      unit: "g",
      grams: Math.round(part.grams * servings * 10) / 10,
      dish: parsed.food,
      assumptions: [`Estimated part of ${parsed.food}`],
    });
  });
}

async function roughEstimate(parsed: ParsedItem, deps: ResolveDeps): Promise<DraftItem | null> {
  let estimate: Estimate;
  try {
    estimate = await deps.estimateFood(parsed.phrase);
  } catch {
    return null;
  }
  const values = [estimate.kcal_per_100g, estimate.protein_per_100g, estimate.carbs_per_100g, estimate.fat_per_100g];
  if (values.some((n) => !Number.isFinite(n) || n < 0) || estimate.kcal_per_100g > 1000 || estimate.protein_per_100g > 100 || estimate.carbs_per_100g > 100 || estimate.fat_per_100g > 100) {
    return null;
  }
  const food: DraftFood = {
    ...notInDatabase(parsed.food, parsed.brand, "rough", null, "custom", {
      kcal: estimate.kcal_per_100g,
      protein: estimate.protein_per_100g,
      carbs: estimate.carbs_per_100g,
      fat: estimate.fat_per_100g,
    }),
    portions: [{ label: "serving", grams: estimate.grams_per_serving }],
  };
  const sized = parsed.quantity === null || normalize(parsed.unit) === "serving";
  return itemFrom(parsed, food, {
    ...(sized ? { grams: Math.round((parsed.quantity ?? 1) * estimate.grams_per_serving), quantity: parsed.quantity ?? 1, unit: "serving" } : {}),
    assumptions: [...parsed.assumptions, "AI estimate, not from a database"],
  });
}

/**
 * The approved order: aliases and saved foods, USDA, USDA branded, the chain's
 * official page, built from ingredients, and an AI estimate only as a last resort.
 */
async function resolveItems(items: ParsedItem[], deps: ResolveDeps): Promise<DraftItem[][]> {
  const results: (DraftItem[] | null)[] = items.map(() => null);
  const needsPick: { index: number; candidates: DraftFood[] }[] = [];

  await Promise.all(
    items.map(async (parsed, index) => {
      const key = normalize(parsed.food);

      const alias = (await deps.alias(key)) ?? (await deps.alias(normalize(parsed.phrase)));
      if (alias) {
        results[index] = [itemFrom(parsed, alias.food, { defaultGrams: alias.defaultGrams, assumptions: [] })];
        return;
      }

      const last = await deps.lastChoice(key);
      if (last) {
        results[index] = [itemFrom(parsed, last, { assumptions: parsed.assumptions.length ? ["Used your last choice"] : [] })];
        return;
      }

      const saved = await deps.savedFoods(parsed.brand ? `${parsed.food} ${parsed.brand}` : parsed.food);
      const exact = saved.find((food) => normalize(food.name) === key);
      if (exact) {
        results[index] = [itemFrom(parsed, exact)];
        return;
      }

      // A chain's own page beats a generic database entry for restaurant food.
      if (parsed.restaurant) {
        const found = await deps.lookupRestaurant({ phrase: parsed.phrase, chain: parsed.restaurant, modifications: parsed.modifications });
        const item = found ? restaurantItem(parsed, found) : null;
        if (item) {
          results[index] = [item];
          return;
        }
      }

      const usda = await deps.usdaCandidates(parsed.food);
      const candidates = [...saved, ...usda];
      if (candidates.length > 0) needsPick.push({ index, candidates });
    }),
  );

  // One AI call chooses among database entries for all items at once.
  if (needsPick.length > 0) {
    let picks: (number | null)[];
    try {
      picks = await deps.pickFoods(
        needsPick.map(({ index, candidates }) => ({ phrase: items[index].phrase, food: items[index].food, candidates: candidates.map((c) => c.name) })),
      );
    } catch {
      // Still from the database, so show the top match and let the person check it.
      picks = needsPick.map(() => 0);
      for (const { index } of needsPick) items[index] = { ...items[index], assumptions: [...items[index].assumptions, "Best match. Tap to check"] };
    }
    needsPick.forEach(({ index, candidates }, i) => {
      const pick = picks[i];
      if (pick !== null) results[index] = [itemFrom(items[index], candidates[pick])];
    });
  }

  await Promise.all(
    items.map(async (parsed, index) => {
      if (results[index]) return;

      const branded = await deps.brandedFoods(parsed.brand ? `${parsed.brand} ${parsed.food}` : parsed.food);
      if (branded.length > 0) {
        let pick: number | null = null;
        try {
          [pick] = await deps.pickFoods([{ phrase: parsed.phrase, food: parsed.food, candidates: branded.map((f) => f.name) }]);
        } catch {
          pick = null;
        }
        if (pick !== null) {
          results[index] = [itemFrom(parsed, branded[pick])];
          return;
        }
      }

      const dish = await buildFromIngredients(parsed, deps);
      if (dish) {
        results[index] = dish;
        return;
      }

      const rough = await roughEstimate(parsed, deps);
      if (rough) results[index] = [rough];
    }),
  );

  return results.map((result) => result ?? []);
}

export async function resolveMeals(parsed: ParsedMeals, context: ResolveContext, deps: ResolveDeps): Promise<{ meals: DraftMeal[]; unresolved: string[] }> {
  const unresolved: string[] = [];
  const meals: DraftMeal[] = [];

  for (const meal of parsed.meals) {
    const resolved = await resolveItems(meal.items, deps);
    resolved.forEach((list, i) => {
      if (list.length === 0) unresolved.push(meal.items[i].phrase);
    });
    const items = resolved.flat();
    if (items.length === 0) continue;
    const mealType: MealType = meal.meal ?? mealFromHour(context.hour);
    meals.push({
      clientId: randomUUID(),
      eatenOn: meal.when === "yesterday" ? addDays(context.today, -1) : context.today,
      mealType,
      source: context.source,
      transcript: context.transcript,
      items,
    });
  }
  return { meals, unresolved };
}
