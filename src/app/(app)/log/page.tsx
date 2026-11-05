import { Suspense } from "react";
import { LogFlow } from "@/components/log/log-flow";
import { PageSlide } from "@/components/page-slide";
import { localDate } from "@/lib/date";
import { loadToday, totals } from "@/lib/day";
import { requireProfile } from "@/lib/profile";

export default async function LogPage() {
  const { userId, timezone } = await requireProfile();
  const { goal, meals } = await loadToday(userId, timezone);
  const budget = { today: localDate(timezone), kcalLeft: goal ? goal.kcal - totals(meals).kcal : null };

  return (
    <PageSlide>
      <Suspense>
        {/* Voice uses the browser until a Gemini key is added, then Gemini. */}
        <LogFlow budget={budget} browserVoice={!process.env.GEMINI_API_KEY} />
      </Suspense>
    </PageSlide>
  );
}
