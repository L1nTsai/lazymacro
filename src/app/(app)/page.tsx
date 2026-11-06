import Link from "next/link";
import { MealIdeas } from "@/components/meal-ideas";
import { MonthActivity } from "@/components/month-activity";
import { PageSlide } from "@/components/page-slide";
import { CaloriesRing, MacroBar } from "@/components/progress";
import { PageTitle } from "@/components/ui";
import { localDate } from "@/lib/date";
import { loadMonth, loadToday, MEAL_LABELS, MEAL_TYPES, totals, type DayEntry, type MealType } from "@/lib/day";
import { hourIn } from "@/lib/logging/clock";
import { planMealIdeas } from "@/lib/meal-ideas";
import { requireProfile } from "@/lib/profile";

function MealButton({ type, entries }: { type: MealType; entries: DayEntry[] }) {
  const sum = (key: "kcal" | "protein_g" | "carbs_g" | "fat_g") => Math.round(entries.reduce((total, entry) => total + Number(entry[key]), 0));
  const [kcal, protein, carbs, fat] = [sum("kcal").toLocaleString("en-US"), sum("protein_g"), sum("carbs_g"), sum("fat_g")];
  const label = MEAL_LABELS[type];
  return (
    <Link
      href={`/meals/${type}`}
      transitionTypes={["nav-forward"]}
      aria-label={entries.length ? `${label}: ${kcal} kcal, ${protein} g protein, ${carbs} g carbs, ${fat} g fat` : `${label}: nothing logged`}
      className="flex min-h-14 min-w-0 flex-col items-center rounded-md border border-border px-0.5 py-2 text-center text-xs whitespace-nowrap text-muted tabular-nums"
    >
      <span className="font-medium text-foreground">{label}</span>
      {entries.length ? (
        <>
          <span className="tracking-tight">{kcal} kcal</span>
          <span>P {protein} g</span>
          <span>C {carbs} g</span>
          <span>F {fat} g</span>
        </>
      ) : (
        <span>None</span>
      )}
    </Link>
  );
}

export default async function TodayPage() {
  const { userId, name, timezone } = await requireProfile();
  const today = localDate(timezone);
  const [{ goal, meals }, month] = await Promise.all([loadToday(userId, timezone), loadMonth(userId, today)]);
  const day = totals(meals);
  const ideas = goal
    ? planMealIdeas(
        { kcal: goal.kcal - day.kcal, protein: Number(goal.protein_g) - day.protein, carbs: Number(goal.carbs_g) - day.carbs, fat: Number(goal.fat_g) - day.fat },
        hourIn(timezone),
        meals.filter((meal) => meal.log_entries.length).map((meal) => meal.meal_type),
      )
    : null;

  return (
    <PageSlide>
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-3 px-4 pt-[max(env(safe-area-inset-top),0.5rem)] pb-3 lg:grid lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)] lg:gap-6 lg:p-6">
        <div className="flex shrink-0 flex-col gap-3">
          <PageTitle>Hi, {name}</PageTitle>
          {goal ? (
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <div className="w-28 shrink-0 min-[360px]:w-32 lg:w-40 [@media(min-height:720px)]:w-40">
                <CaloriesRing eaten={day.kcal} target={goal.kcal} />
              </div>
              <section aria-label="Macros" className="min-w-0 flex-1 space-y-2">
                <MacroBar label="Protein" eaten={day.protein} target={Number(goal.protein_g)} color="var(--data-protein)" />
                <MacroBar label="Carbs" eaten={day.carbs} target={Number(goal.carbs_g)} color="var(--data-carbs)" />
                <MacroBar label="Fat" eaten={day.fat} target={Number(goal.fat_g)} color="var(--data-fat)" />
                {day.hasEstimates ? <p className="text-xs text-muted">Includes estimates</p> : null}
              </section>
            </div>
          ) : (
            <p className="text-muted">
              Your targets start tomorrow in your time zone. <Link href="/me/goals" className="underline underline-offset-4">Review your goals</Link>
            </p>
          )}
          <section aria-label="Today's meals" className="grid grid-cols-4 gap-2">
            {MEAL_TYPES.map((type) => (
              <MealButton key={type} type={type} entries={meals.filter((meal) => meal.meal_type === type).flatMap((meal) => meal.log_entries)} />
            ))}
          </section>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:gap-6">
          <MonthActivity today={today} eaten={month.eaten} targetOn={month.targetOn} />
          {ideas && goal ? <MealIdeas ideas={ideas} kcalLeft={goal.kcal - day.kcal} /> : null}
        </div>
      </div>
    </PageSlide>
  );
}
