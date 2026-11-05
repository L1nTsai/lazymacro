import { z } from "zod";

export const trustSchema = z.enum(["verified", "estimated", "rough"]);
export type Trust = z.infer<typeof trustSchema>;

export const mealTypeSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);

/** A food that isn't in the database yet; it's saved when the meal is confirmed. */
export const newFoodSchema = z.object({
  source: z.enum(["custom", "restaurant", "usda"]),
  sourceId: z.string().nullable(),
});

export const draftFoodSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().min(1).max(300),
  brand: z.string().nullable(),
  trust: trustSchema,
  sourceUrl: z.string().nullable(),
  kcal: z.number().min(0).max(1000),
  protein: z.number().min(0).max(100),
  carbs: z.number().min(0).max(100),
  fat: z.number().min(0).max(100),
  densityGPerMl: z.number().nullable(),
  portions: z.array(z.object({ label: z.string(), grams: z.number() })),
  newFood: newFoodSchema.nullable(),
});
export type DraftFood = z.infer<typeof draftFoodSchema>;

export const draftItemSchema = z.object({
  key: z.string(),
  phrase: z.string().max(500).nullable(),
  parsedFood: z.string().max(200).nullable(),
  dish: z.string().max(200).nullable(),
  quantity: z.number().positive().max(100000),
  unit: z.string().min(1).max(40),
  grams: z.number().positive().max(100000),
  food: draftFoodSchema,
  adjusted: z.boolean(),
  corrected: z.boolean(),
  assumptions: z.array(z.string().max(200)).max(10),
  /** Saved portion to remember for this food, when the amount isn't a weight. */
  alternatives: z.array(z.string()).optional(),
});
export type DraftItem = z.infer<typeof draftItemSchema>;

export const draftMealSchema = z.object({
  clientId: z.string().uuid(),
  eatenOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mealType: mealTypeSchema,
  source: z.enum(["voice", "text", "manual", "suggestion"]),
  transcript: z.string().max(2000).nullable(),
  items: z.array(draftItemSchema).max(50),
});
export type DraftMeal = z.infer<typeof draftMealSchema>;
