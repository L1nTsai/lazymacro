import { z } from "zod";
import { isValidTimeZone } from "./date";
import { formulaIsValid } from "./targets";

const body = z.object({
  sex: z.enum(["male", "female"]),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()),
  heightCm: z.number().min(50).max(300),
  weightKg: z.number().min(20).max(500),
  activity: z.enum(["sedentary", "light", "moderate", "very_active"]),
  goal: z.enum(["lose", "maintain", "gain"]),
  paceKgPerWeek: z.number().min(0).max(1.5),
});

const macro = z.number().min(0).max(5000);

export const setupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  body: body.refine((b) => (b.goal === "maintain") === (b.paceKgPerWeek === 0), {
    message: "Choose a pace for your goal.",
  }),
  targets: z.object({
    kcal: z.number().int().min(1).max(20000),
    proteinG: macro,
    carbsG: macro,
    fatG: macro,
  }),
  formula: z
    .object({
      proteinGPerLb: z.number(),
      fatUnit: z.enum(["percent", "grams"]),
      fatValue: z.number(),
    })
    .refine(formulaIsValid, "Check your protein and fat numbers."),
  allergies: z.array(z.string().trim().min(1).max(80)).max(100),
  excluded: z.array(z.string().trim().min(1).max(80)).max(100),
  staples: z.array(z.string().trim().min(1).max(80)).max(100),
  showOz: z.boolean(),
  timezone: z.string().refine(isValidTimeZone, "Unknown time zone."),
});

export type SetupInput = z.infer<typeof setupSchema>;

export const DEFAULT_STAPLES = ["salt", "pepper", "olive oil", "vegetable oil", "garlic powder", "chili flakes", "paprika", "cumin", "oregano", "soy sauce", "vinegar", "sugar"];

export type StepId = "about" | "goal" | "targets" | "avoid" | "staples" | "units";
export const SETUP_STEPS: StepId[] = ["about", "goal", "targets", "avoid", "staples"];
