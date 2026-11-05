"use server";

import { redirect } from "next/navigation";
import { localDate } from "@/lib/date";
import { setupSchema } from "@/lib/setup";
import { createClient, getUserId } from "@/lib/supabase/server";

export type SetupState = { error?: string; saved?: boolean };

export async function saveSetup(_: SetupState, form: FormData): Promise<SetupState> {
  const userId = await getUserId();
  if (!userId) redirect("/sign-in");

  let payload: unknown;
  try {
    payload = JSON.parse(String(form.get("payload")));
  } catch {
    return { error: "We couldn't read that form. Reload and try again." };
  }
  const parsed = setupSchema.safeParse(payload);
  if (!parsed.success) return { error: "Check your details and try again." };

  const { name, body, targets, formula, allergies, excluded, staples, showOz, timezone } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_my_setup", {
    p_profile: {
      display_name: name,
      sex: body.sex,
      birth_year: body.birthYear,
      height_cm: body.heightCm,
      weight_kg: body.weightKg,
      activity: body.activity,
      goal: body.goal,
      pace_kg_per_week: body.paceKgPerWeek,
      timezone,
      show_oz: showOz,
      protein_g_per_lb: formula.proteinGPerLb,
      fat_unit: formula.fatUnit,
      fat_value: formula.fatValue,
    },
    p_targets: {
      kcal: targets.kcal,
      protein_g: targets.proteinG,
      carbs_g: targets.carbsG,
      fat_g: targets.fatG,
    },
    // Allergies come first: a food in both lists stays an allergy.
    p_exclusions: [
      ...allergies.map((term) => ({ term, kind: "allergy" })),
      ...excluded.map((term) => ({ term, kind: "exclude" })),
    ],
    p_staples: staples,
    p_today: localDate(timezone),
  });
  if (error) {
    console.error("save_setup_failed", { code: error.code });
    return { error: "Your goals weren't saved. Try again." };
  }
  // The form navigates, so the move can slide. Revalidating here would re-render
  // setup, whose redirect for finished profiles would beat that navigation.
  return { saved: true };
}
