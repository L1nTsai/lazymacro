import { notFound } from "next/navigation";
import { MealItems } from "@/app/(app)/meals/[type]/meal-items";
import { PageSlide } from "@/components/page-slide";
import { SubPage } from "@/components/ui";
import { loadDay, MEAL_LABELS, MEAL_TYPES, totals } from "@/lib/day";
import { requireProfile } from "@/lib/profile";

export default async function HistoryDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { userId } = await requireProfile();
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const { goal, meals } = await loadDay(userId, date);
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
  const title = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

  return (
    <PageSlide>
      <SubPage title={title} back="/history">
        <div className="flex h-full flex-col gap-3">
          <p className="shrink-0 text-sm text-muted tabular-nums">
            {Math.round(day.kcal).toLocaleString("en-US")} kcal{goal ? ` of ${goal.kcal.toLocaleString("en-US")}` : ""}, P {Math.round(day.protein)} C {Math.round(day.carbs)} F {Math.round(day.fat)}
            {day.hasEstimates ? ". Includes estimates" : ""}
          </p>
          <div className="min-h-0 flex-1">
            {items.length ? <MealItems items={items} back={`/history/${date}`} /> : <p className="text-sm text-muted">Nothing logged this day.</p>}
          </div>
        </div>
      </SubPage>
    </PageSlide>
  );
}
