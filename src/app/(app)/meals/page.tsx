import { PageSlide } from "@/components/page-slide";
import { NavList, NavRow, SubPage } from "@/components/ui";
import { loadToday, MEAL_LABELS, MEAL_TYPES } from "@/lib/day";
import { requireProfile } from "@/lib/profile";

export default async function MealsPage() {
  const { userId, timezone } = await requireProfile();
  const { meals } = await loadToday(userId, timezone);

  return (
    <PageSlide>
      <SubPage title="Meals" back="/">
        <NavList>
          {MEAL_TYPES.map((type) => {
            const entries = meals.filter((meal) => meal.meal_type === type).flatMap((meal) => meal.log_entries);
            const kcal = entries.reduce((total, entry) => total + Number(entry.kcal), 0);
            return (
              <NavRow
                key={type}
                href={`/meals/${type}`}
                label={MEAL_LABELS[type]}
                detail={entries.length ? `${Math.round(kcal).toLocaleString("en-US")} kcal` : "Nothing yet"}
              />
            );
          })}
        </NavList>
      </SubPage>
    </PageSlide>
  );
}
