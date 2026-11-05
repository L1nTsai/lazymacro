import Link from "next/link";
import { PageSlide } from "@/components/page-slide";
import { CaloriesRing, MacroBar } from "@/components/progress";
import { NavList, NavRow, PageTitle } from "@/components/ui";
import { loadToday } from "@/lib/day";
import { requireProfile } from "@/lib/profile";

export default async function TodayPage() {
  const { userId, name, timezone } = await requireProfile();
  const { goal, meals } = await loadToday(userId, timezone);

  const entries = meals.flatMap((meal) => meal.log_entries);
  const sum = (key: "kcal" | "protein_g" | "carbs_g" | "fat_g") => entries.reduce((total, entry) => total + Number(entry[key]), 0);
  const eaten = sum("kcal");

  return (
    <PageSlide>
      <div className="flex h-full flex-col gap-4 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-4">
        <PageTitle>Hi, {name}</PageTitle>
        {goal ? (
          <>
            <div className="min-h-0 flex-1">
              <CaloriesRing eaten={eaten} target={goal.kcal} />
            </div>
            <section aria-label="Macros" className="shrink-0 space-y-3">
              <MacroBar label="Protein" eaten={sum("protein_g")} target={Number(goal.protein_g)} color="var(--data-protein)" />
              <MacroBar label="Carbs" eaten={sum("carbs_g")} target={Number(goal.carbs_g)} color="var(--data-carbs)" />
              <MacroBar label="Fat" eaten={sum("fat_g")} target={Number(goal.fat_g)} color="var(--data-fat)" />
            </section>
          </>
        ) : (
          <p className="flex-1 text-muted">
            Your targets start tomorrow in your time zone. <Link href="/me/goals" className="underline underline-offset-4">Review your goals</Link>
          </p>
        )}
        <div className="shrink-0">
          <NavList>
            <NavRow href="/meals" label="Meals" detail={entries.length ? `${Math.round(eaten).toLocaleString("en-US")} kcal` : "Nothing logged yet"} />
          </NavList>
        </div>
      </div>
    </PageSlide>
  );
}
