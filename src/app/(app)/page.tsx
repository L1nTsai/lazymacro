import Link from "next/link";
import { MealItems } from "@/app/(app)/meals/[type]/meal-items";
import { PageSlide } from "@/components/page-slide";
import { CaloriesRing, MacroBar } from "@/components/progress";
import { NavList, NavRow, PageTitle } from "@/components/ui";
import { loadToday, MEAL_LABELS, MEAL_TYPES, totals } from "@/lib/day";
import { requireProfile } from "@/lib/profile";

export default async function TodayPage() {
  const { userId, name, timezone } = await requireProfile();
  const { goal, meals } = await loadToday(userId, timezone);
  const day = totals(meals);
  const items = MEAL_TYPES.flatMap((type) =>
    meals
      .filter((meal) => meal.meal_type === type)
      .flatMap((meal) => meal.log_entries)
      .map((entry) => ({
        id: entry.id,
        label: `${MEAL_LABELS[type]}: ${entry.foods?.name ?? entry.phrase ?? `${Number(entry.grams)} g`}`,
        kcal: Math.round(Number(entry.kcal)),
        trust: entry.confidence,
      })),
  );

  return (
    <PageSlide>
      <div className="mx-auto grid h-full w-full max-w-5xl gap-8 lg:grid-cols-2 lg:p-6">
        <div className="flex h-full min-h-0 flex-col gap-4 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-4 lg:p-0">
        <div className="flex items-center justify-between">
          <PageTitle>Hi, {name}</PageTitle>
          <Link href="/history" transitionTypes={["nav-forward"]} className="flex min-h-11 items-center text-sm underline underline-offset-4">History</Link>
        </div>
        {goal ? (
          <>
            <div className="min-h-0 flex-1">
              <CaloriesRing eaten={day.kcal} target={goal.kcal} />
            </div>
            {day.hasEstimates ? <p className="-my-2 shrink-0 text-center text-sm text-muted">Includes estimates</p> : null}
            <section aria-label="Macros" className="shrink-0 space-y-3">
              <MacroBar label="Protein" eaten={day.protein} target={Number(goal.protein_g)} color="var(--data-protein)" />
              <MacroBar label="Carbs" eaten={day.carbs} target={Number(goal.carbs_g)} color="var(--data-carbs)" />
              <MacroBar label="Fat" eaten={day.fat} target={Number(goal.fat_g)} color="var(--data-fat)" />
            </section>
          </>
        ) : (
          <p className="flex-1 text-muted">
            Your targets start tomorrow in your time zone. <Link href="/me/goals" className="underline underline-offset-4">Review your goals</Link>
          </p>
        )}
        <div className="shrink-0 lg:hidden">
          <NavList>
            <NavRow href="/meals" label="Meals" detail={day.entries.length ? `${Math.round(day.kcal).toLocaleString("en-US")} kcal` : "Nothing logged yet"} />
          </NavList>
        </div>
        </div>
        <section aria-label="Today's meals" className="hidden min-h-0 flex-col gap-3 lg:flex">
          <h2 className="text-lg font-semibold">Meals</h2>
          <div className="min-h-0 flex-1">
            {items.length ? <MealItems items={items} back="/meals" /> : <p className="text-sm text-muted">Nothing logged yet today.</p>}
          </div>
        </section>
      </div>
    </PageSlide>
  );
}
