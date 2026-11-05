import type { SetupDefaults } from "@/components/setup-form";
import type { createClient } from "./supabase/server";
import { DEFAULT_STAPLES } from "./setup";
import { localDate } from "./date";

type Client = Awaited<ReturnType<typeof createClient>>;

export async function loadSetupDefaults(supabase: Client, userId: string): Promise<{ defaults: SetupDefaults; hasProfile: boolean }> {
  const [profile, exclusions, staples] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_exclusions").select("term, kind").eq("user_id", userId).order("term"),
    supabase.from("user_staples").select("name").eq("user_id", userId).order("name"),
  ]);
  if (profile.error) throw profile.error;
  if (exclusions.error) throw exclusions.error;
  if (staples.error) throw staples.error;

  const p = profile.data;
  if (!p) {
    return {
      hasProfile: false,
      defaults: { body: null, targets: null, allergies: [], excluded: [], staples: DEFAULT_STAPLES.slice(0, 4), showOz: false },
    };
  }

  const today = localDate(p.timezone);
  const target = await supabase
    .from("targets")
    .select("kcal, protein_g, carbs_g, fat_g")
    .eq("user_id", userId)
    .lte("effective_from", today)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (target.error) throw target.error;

  return {
    hasProfile: true,
    defaults: {
      body: p.sex
        ? {
            sex: p.sex,
            birthYear: p.birth_year,
            heightCm: Number(p.height_cm),
            weightKg: Number(p.weight_kg),
            activity: p.activity,
            goal: p.goal,
            paceKgPerWeek: Number(p.pace_kg_per_week),
          }
        : null,
      targets: target.data
        ? {
            kcal: target.data.kcal,
            proteinG: Number(target.data.protein_g),
            carbsG: Number(target.data.carbs_g),
            fatG: Number(target.data.fat_g),
          }
        : null,
      allergies: (exclusions.data ?? []).filter((e) => e.kind === "allergy").map((e) => e.term),
      excluded: (exclusions.data ?? []).filter((e) => e.kind === "exclude").map((e) => e.term),
      staples: (staples.data ?? []).map((s) => s.name),
      showOz: p.show_oz,
    },
  };
}
