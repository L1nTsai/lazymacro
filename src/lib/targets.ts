export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "very_active";
export type Goal = "lose" | "maintain" | "gain";

export const ACTIVITY_FACTORS: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
};

const KCAL_PER_KG = 7700;
const PROTEIN_G_PER_KG = 1.6;
const FAT_SHARE = 0.275;

export type BodyDetails = {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  goal: Goal;
  paceKgPerWeek: number;
};

export type Targets = { kcal: number; proteinG: number; carbsG: number; fatG: number };

/** Mifflin–St Jeor resting energy. */
export function restingEnergy({ sex, age, heightCm, weightKg }: BodyDetails): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
}

export function calculateTargets(body: BodyDetails): Targets {
  const maintenance = restingEnergy(body) * ACTIVITY_FACTORS[body.activity];
  const dailyChange = (body.paceKgPerWeek * KCAL_PER_KG) / 7;
  const adjustment = body.goal === "lose" ? -dailyChange : body.goal === "gain" ? dailyChange : 0;
  const kcal = Math.round(maintenance + adjustment);

  const proteinG = Math.round(body.weightKg * PROTEIN_G_PER_KG);
  const fatG = Math.round((kcal * FAT_SHARE) / 9);
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return { kcal, proteinG, carbsG, fatG };
}

/** True when a target is below the common minimum for this person. */
export function isBelowCommonMinimum(kcal: number, sex: Sex | null): boolean {
  return kcal < (sex === "male" ? 1500 : 1200);
}
