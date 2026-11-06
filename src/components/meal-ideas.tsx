import Link from "next/link";
import { MEAL_LABELS } from "@/lib/day";
import type { planMealIdeas } from "@/lib/meal-ideas";

export function MealIdeas({ ideas, kcalLeft }: { ideas: ReturnType<typeof planMealIdeas>; kcalLeft: number }) {
  return (
    <section aria-label="Meal ideas" className="min-h-0 flex-1">
      <Link href="/ideas" className="flex h-full flex-col gap-1 rounded-lg border border-border p-3">
        <div className="flex shrink-0 items-baseline justify-between gap-3 text-sm">
          <h2 className="font-medium">Example meal ideas</h2>
          {ideas.length ? <span className="text-muted tabular-nums">{Math.round(kcalLeft).toLocaleString("en-US")} kcal left</span> : null}
        </div>
        {ideas.length ? (
          // Wrapped rows land in a clipped column, so only whole ideas show and nothing scrolls.
          <ul className="flex min-h-0 flex-1 flex-col flex-wrap overflow-hidden">
            {ideas.map((idea, i) => (
              <li key={idea.type} className={`flex w-full flex-1 flex-col justify-center py-1 ${i > 0 ? "border-t border-border" : ""}`}>
                <span className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{MEAL_LABELS[idea.type]}</span>
                  <span className="shrink-0 text-muted tabular-nums">{idea.kcal.toLocaleString("en-US")} kcal</span>
                </span>
                <span className="truncate text-sm text-muted">{idea.dish}</span>
                <span className="text-xs text-muted tabular-nums [@media(max-height:600px)]:hidden">
                  P {idea.protein} g&ensp;C {idea.carbs} g&ensp;F {idea.fat} g
                </span>
              </li>
            ))}
          </ul>
        ) : (
        <p className="text-sm text-muted">You&apos;ve reached today&apos;s calorie target.</p>
      )}
      </Link>
    </section>
  );
}
