import { z } from "zod";

export const parsedItemSchema = z.object({
  phrase: z.string(),
  food: z.string(),
  brand: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: z.string(),
  grams_per_unit_estimate: z.number().nullable(),
  restaurant: z.string().nullable(),
  modifications: z.array(z.string()),
  assumptions: z.array(z.string()),
});
export type ParsedItem = z.infer<typeof parsedItemSchema>;

export const parsedMealsSchema = z.object({
  meals: z.array(
    z.object({
      when: z.enum(["today", "yesterday"]),
      meal: z.enum(["breakfast", "lunch", "dinner", "snack"]).nullable(),
      items: z.array(parsedItemSchema),
    }),
  ),
});
export type ParsedMeals = z.infer<typeof parsedMealsSchema>;

export const pickSchema = z.object({
  picks: z.array(z.object({ item: z.number(), candidate: z.number().nullable() })),
});

export const dishSchema = z.object({
  parts: z.array(z.object({ food: z.string(), grams: z.number() })),
});

export const estimateSchema = z.object({
  kcal_per_100g: z.number(),
  protein_per_100g: z.number(),
  carbs_per_100g: z.number(),
  fat_per_100g: z.number(),
  grams_per_serving: z.number(),
});
export type Estimate = z.infer<typeof estimateSchema>;

export const restaurantSchema = z.object({
  found: z.boolean(),
  name: z.string().nullable(),
  chain: z.string().nullable(),
  url: z.string().nullable(),
  kcal: z.number().nullable(),
  protein_g: z.number().nullable(),
  carbs_g: z.number().nullable(),
  fat_g: z.number().nullable(),
  serving_grams: z.number().nullable(),
  adjusted: z.boolean(),
});
export type RestaurantResult = z.infer<typeof restaurantSchema>;
