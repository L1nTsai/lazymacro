"use server";

import { redirect } from "next/navigation";
import { localDate } from "@/lib/date";
import { setupSchema } from "@/lib/setup";
import { createClient, getUserId } from "@/lib/supabase/server";

export type SetupState = { error?: string };

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
  if (!parsed.success) return { error: "Check the highlighted details and try again." };

  const { body, targets, allergies, excluded, staples, showOz, timezone } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_my_setup", {
    p_profile: {
      sex: body?.sex ?? null,
      birth_year: body?.birthYear ?? null,
      height_cm: body?.heightCm ?? null,
      weight_kg: body?.weightKg ?? null,
      activity: body?.activity ?? null,
      goal: body?.goal ?? null,
      pace_kg_per_week: body?.paceKgPerWeek ?? 0,
      timezone,
      show_oz: showOz,
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
  redirect(String(form.get("next")) === "/me" ? "/me" : "/");
}
