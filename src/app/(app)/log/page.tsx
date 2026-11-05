import { Suspense } from "react";
import { LogFlow } from "@/components/log/log-flow";
import { PageSlide } from "@/components/page-slide";
import { localDate } from "@/lib/date";
import { loadToday, totals } from "@/lib/day";
import { hourIn, mealFromHour } from "@/lib/logging/clock";
import { requireProfile } from "@/lib/profile";

export default async function LogPage() {
  const { userId, timezone } = await requireProfile();
  const { goal, meals } = await loadToday(userId, timezone);
  // Comes from the profile's time zone, so server and browser always agree.
  const budget = {
    today: localDate(timezone),
    kcalLeft: goal ? goal.kcal - totals(meals).kcal : null,
    currentMeal: mealFromHour(hourIn(timezone)),
  };

  return (
    <PageSlide>
      <Suspense>
        {/* Voice uses the browser until a Gemini key is added, then Gemini. */}
        <LogFlow budget={budget} browserVoice={!process.env.GEMINI_API_KEY} />
      </Suspense>
    </PageSlide>
  );
}
