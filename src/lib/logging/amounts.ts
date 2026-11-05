/** Turns "1 scoop" or "2 cups" into grams, the app's base unit. */

const WEIGHT_GRAMS: Record<string, number> = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
const VOLUME_ML: Record<string, number> = { ml: 1, l: 1000, tsp: 4.929, tbsp: 14.787, "fl oz": 29.574, cup: 236.588 };

const UNIT_ALIASES: Record<string, string> = {
  gram: "g", grams: "g", gr: "g",
  kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  ounce: "oz", ounces: "oz",
  pound: "lb", pounds: "lb", lbs: "lb",
  milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml", mil: "ml", mils: "ml", mls: "ml", cc: "ml",
  liter: "l", liters: "l", litre: "l", litres: "l",
  teaspoon: "tsp", teaspoons: "tsp",
  tablespoon: "tbsp", tablespoons: "tbsp",
  cups: "cup",
  "fluid ounce": "fl oz", "fluid ounces": "fl oz",
};

/** Common sizes for vague amounts, used when a food has no portion of its own. */
const TYPICAL_PORTIONS: Record<string, number> = {
  scoop: 30,
  handful: 30,
  bowl: 250,
  plate: 300,
  glass: 240,
  mug: 240,
  slice: 30,
  piece: 50,
  serving: 100,
  splash: 15,
  drizzle: 7,
  pinch: 1,
};

const FALLBACK_GRAMS = 100;
const MAX_ESTIMATED_GRAMS = 2000;

export type Portion = { label: string; grams: number };
export type AmountFood = { densityGPerMl: number | null; portions: Portion[] };
export type GramsResult = { grams: number; assumption: string | null };

const singular = (word: string) => word.replace(/(ches|shes|sses|xes)$/, (m) => m.slice(0, -2)).replace(/ies$/, "y").replace(/s$/, "");

export function normalizeUnit(unit: string): string {
  const cleaned = unit.trim().toLowerCase().replace(/\.$/, "");
  return UNIT_ALIASES[cleaned] ?? cleaned;
}

function findPortion(unit: string, portions: Portion[]): Portion | undefined {
  const wanted = singular(unit);
  const scored = portions.map((portion) => {
    const label = singular(portion.label.toLowerCase());
    if (label === wanted) return { portion, score: 3 };
    const words = label.split(/[\s,]+/);
    if (words[0] === wanted) return { portion, score: 2 };
    if (words.includes(wanted)) return { portion, score: 1 };
    return { portion, score: 0 };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score)[0]?.portion;
}

const round = (grams: number) => Math.round(grams * 10) / 10;

export function toGrams(
  quantity: number,
  unit: string,
  food: AmountFood,
  savedGramsPerUnit: number | null = null,
  /** The parser's estimate for this food, for when the database has no size. */
  estimatedGramsPerUnit: number | null = null,
): GramsResult {
  const normalized = normalizeUnit(unit);

  if (WEIGHT_GRAMS[normalized]) {
    return { grams: round(quantity * WEIGHT_GRAMS[normalized]), assumption: null };
  }

  if (savedGramsPerUnit) {
    return { grams: round(quantity * savedGramsPerUnit), assumption: null };
  }

  const estimated = estimatedGramsPerUnit && estimatedGramsPerUnit > 0 && estimatedGramsPerUnit <= MAX_ESTIMATED_GRAMS ? estimatedGramsPerUnit : null;
  const fromEstimate = (): GramsResult => ({
    grams: round(quantity * estimated!),
    assumption: `Assumed 1 ${singular(normalized)} is ${round(estimated!)} g`,
  });

  if (VOLUME_ML[normalized]) {
    const ml = quantity * VOLUME_ML[normalized];
    const exact = findPortion(normalized, food.portions);
    if (exact && singular(exact.label.toLowerCase()) === singular(normalized)) {
      return { grams: round(quantity * exact.grams), assumption: null };
    }
    if (food.densityGPerMl) return { grams: round(ml * food.densityGPerMl), assumption: null };
    if (estimated) return fromEstimate();
    return { grams: round(ml), assumption: `Assumed 1 ${normalized} weighs about the same as water` };
  }

  const portion = findPortion(normalized, food.portions);
  if (portion) {
    // A saved "serving" is the published or label weight, not a guess.
    if (portion.label === "serving") return { grams: round(quantity * portion.grams), assumption: null };
    return { grams: round(quantity * portion.grams), assumption: `Assumed 1 ${normalized} is ${round(portion.grams)} g` };
  }

  if (estimated) return fromEstimate();

  const typical = TYPICAL_PORTIONS[singular(normalized)];
  if (typical) {
    return { grams: round(quantity * typical), assumption: `Assumed 1 ${singular(normalized)} is ${typical} g` };
  }

  // Counted items with no known size ("2 eggs" against a food without portions).
  return {
    grams: round(quantity * FALLBACK_GRAMS),
    assumption: `Assumed ${FALLBACK_GRAMS} g each. Tap to change`,
  };
}

export type Per100g = { kcal: number; protein: number; carbs: number; fat: number };

export function macrosFor(per100g: Per100g, grams: number): Per100g {
  const scale = grams / 100;
  const one = (n: number) => Math.round(n * scale * 10) / 10;
  return { kcal: one(per100g.kcal), protein: one(per100g.protein), carbs: one(per100g.carbs), fat: one(per100g.fat) };
}

/**
 * Restaurants list values per item, but foods are stored per 100 g. When the
 * weight isn't published this picks a nominal weight heavy enough to stay within
 * what a real food can hold, so one serving still totals the listed values.
 */
export function servingToPer100g(serving: Per100g, servingGrams: number | null): { grams: number; per100g: Per100g } {
  const minimum = Math.max(serving.kcal / 9, serving.protein + serving.carbs + serving.fat, 1);
  const grams = servingGrams && servingGrams >= minimum ? servingGrams : Math.max(100, Math.ceil(serving.kcal / 4));
  const per = (n: number) => Math.round((n / grams) * 1000) / 10;
  return {
    grams,
    per100g: { kcal: per(serving.kcal), protein: per(serving.protein), carbs: per(serving.carbs), fat: per(serving.fat) },
  };
}
