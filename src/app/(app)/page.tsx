import Link from "next/link";
import { redirect } from "next/navigation";
import { CaloriesRing, MacroBar } from "@/components/progress";
import { BUTTON_STYLES, PageTitle } from "@/components/ui";
import { localDate } from "@/lib/date";
import { createClient, getUserId } from "@/lib/supabase/server";

const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"] as const;
const MEAL_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snacks" };

export default async function TodayPage() {
  const userId = (await getUserId())!;
  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
  if (profileError) throw profileError;
  // The layout redirects too, but this page renders alongside it.
  if (!profile) redirect("/onboarding");
  const today = localDate(profile.timezone);

  const [target, meals] = await Promise.all([
    supabase
      .from("targets")
      .select("kcal, protein_g, carbs_g, fat_g")
      .eq("user_id", userId)
      .lte("effective_from", today)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("meals")
      .select("id, meal_type, log_entries(id, phrase, grams, kcal, protein_g, carbs_g, fat_g, foods(name))")
      .eq("user_id", userId)
      .eq("eaten_on", today)
      .order("created_at"),
  ]);
  if (target.error) throw target.error;
  if (meals.error) throw meals.error;

  const entries = (meals.data ?? []).flatMap((meal) => meal.log_entries);
  const sum = (key: "kcal" | "protein_g" | "carbs_g" | "fat_g") => entries.reduce((total, entry) => total + Number(entry[key]), 0);
  const goal = target.data;

  return (
    <div className="space-y-8">
      <PageTitle>Today</PageTitle>
      {goal ? (
        <>
          <CaloriesRing eaten={sum("kcal")} target={goal.kcal} />
          <section aria-label="Macros" className="space-y-4">
            <MacroBar label="Protein" eaten={sum("protein_g")} target={Number(goal.protein_g)} color="var(--data-protein)" />
            <MacroBar label="Carbs" eaten={sum("carbs_g")} target={Number(goal.carbs_g)} color="var(--data-carbs)" />
            <MacroBar label="Fat" eaten={sum("fat_g")} target={Number(goal.fat_g)} color="var(--data-fat)" />
          </section>
        </>
      ) : (
        <p className="text-muted">
          Your targets start tomorrow in your time zone. <Link href="/me/goals" className="underline underline-offset-4">Review your goals</Link>
        </p>
      )}

      <section aria-label="Meals" className="space-y-3">
        <h2 className="text-lg font-semibold">Meals</h2>
        {entries.length === 0 ? (
          <div className="rounded-md border border-border p-4">
            <p className="text-sm text-muted">Nothing logged yet today.</p>
            <Link href="/foods" className={`${BUTTON_STYLES.secondary} mt-3`}>Search foods</Link>
          </div>
        ) : (
          MEAL_ORDER.map((type) => {
            const items = (meals.data ?? []).filter((meal) => meal.meal_type === type).flatMap((meal) => meal.log_entries);
            if (items.length === 0) return null;
            return (
              <div key={type} className="rounded-md border border-border">
                <h3 className="border-b border-border px-4 py-2 text-sm font-medium">{MEAL_LABELS[type]}</h3>
                <ul>
                  {items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-4 px-4 py-2 text-sm">
                      <span>{item.phrase ?? `${Number(item.grams)} g`}</span>
                      <span className="text-muted tabular-nums">{Math.round(Number(item.kcal))} kcal</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
