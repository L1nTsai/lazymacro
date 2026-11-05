export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "very_active";
export type Goal = "lose" | "maintain" | "gain";
export type FatUnit = "percent" | "grams";

export const ACTIVITY_FACTORS: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
};

const KCAL_PER_KG = 7700;
const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARBS = 4;
const KCAL_PER_G_FAT = 9;
const MAX_PROTEIN_G_PER_LB = 3;
const MAX_FAT_GRAMS = 1000;
export const MAX_FAT_PERCENT = 90;

export type BodyDetails = {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  goal: Goal;
  paceKgPerWeek: number;
};

export type MacroFormula = { proteinGPerLb: number; fatUnit: FatUnit; fatValue: number };
export const DEFAULT_FORMULA: MacroFormula = { proteinGPerLb: 1, fatUnit: "percent", fatValue: 25 };

export type Targets = { kcal: number; proteinG: number; carbsG: number; fatG: number };

/** Mifflin–St Jeor resting energy. */
export function restingEnergy({ sex, age, heightCm, weightKg }: BodyDetails): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
}

/** Daily calories for this person's activity, goal and pace. */
export function calorieTarget(body: BodyDetails): number {
  const maintenance = restingEnergy(body) * ACTIVITY_FACTORS[body.activity];
  const dailyChange = (body.paceKgPerWeek * KCAL_PER_KG) / 7;
  const adjustment = body.goal === "lose" ? -dailyChange : body.goal === "gain" ? dailyChange : 0;
  return Math.round(maintenance + adjustment);
}

export function formulaIsValid({ proteinGPerLb, fatUnit, fatValue }: MacroFormula): boolean {
  const inRange = (n: number, max: number) => Number.isFinite(n) && n >= 0 && n <= max;
  return inRange(proteinGPerLb, MAX_PROTEIN_G_PER_LB) && inRange(fatValue, fatUnit === "percent" ? MAX_FAT_PERCENT : MAX_FAT_GRAMS);
}

/**
 * Splits calories using the person's formula, with carbs taking what remains.
 * When protein and fat need more than the calories given, calories rise to fit
 * them, so `raised` tells the person why the number moved.
 */
export function macrosFor(kcal: number, weightLb: number, formula: MacroFormula): Targets & { raised: boolean } {
  const proteinG = Math.round(weightLb * formula.proteinGPerLb);
  const proteinKcal = proteinG * KCAL_PER_G_PROTEIN;
  const fatShare = formula.fatValue / 100;
  const isPercent = formula.fatUnit === "percent";

  const available = Math.max(0, kcal);
  const fatG = isPercent ? Math.round((available * fatShare) / KCAL_PER_G_FAT) : formula.fatValue;
  const remaining = available - proteinKcal - fatG * KCAL_PER_G_FAT;
  if (remaining >= 0) {
    return { kcal: available, proteinG, carbsG: Math.round(remaining / KCAL_PER_G_CARBS), fatG, raised: false };
  }

  // Fat stays at its share of the new total, which solves to protein / (1 − share).
  const raisedFatG = isPercent ? Math.round(((proteinKcal / (1 - fatShare)) * fatShare) / KCAL_PER_G_FAT) : formula.fatValue;
  return { kcal: proteinKcal + raisedFatG * KCAL_PER_G_FAT, proteinG, carbsG: 0, fatG: raisedFatG, raised: true };
}

/** True when a target is below the common minimum for this person. */
export function isBelowCommonMinimum(kcal: number, sex: Sex | null): boolean {
  return kcal < (sex === "male" ? 1500 : 1200);
}
