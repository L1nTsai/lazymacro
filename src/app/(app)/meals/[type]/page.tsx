import { notFound } from "next/navigation";
import { PageSlide } from "@/components/page-slide";
import { SubPage } from "@/components/ui";
import { loadToday, MEAL_LABELS, MEAL_TYPES, type MealType } from "@/lib/day";
import { requireProfile } from "@/lib/profile";
import { MealItems } from "./meal-items";

export default async function MealPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!MEAL_TYPES.includes(type as MealType)) notFound();

  const { userId, timezone } = await requireProfile();
  const { meals } = await loadToday(userId, timezone);
  const items = meals
    .filter((meal) => meal.meal_type === type)
    .flatMap((meal) => meal.log_entries)
    .map((entry) => ({
      id: entry.id,
      label: entry.phrase ?? `${Number(entry.grams)} g`,
      kcal: Math.round(Number(entry.kcal)),
    }));

  return (
    <PageSlide>
      <SubPage title={MEAL_LABELS[type as MealType]} back="/meals">
        {items.length ? <MealItems items={items} /> : <p className="text-sm text-muted">Nothing logged yet.</p>}
      </SubPage>
    </PageSlide>
  );
}
