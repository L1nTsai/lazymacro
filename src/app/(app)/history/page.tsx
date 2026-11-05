import Link from "next/link";
import { MealItems } from "@/app/(app)/meals/[type]/meal-items";
import { PageSlide } from "@/components/page-slide";
import { BUTTON_STYLES, SubPage } from "@/components/ui";
import { localDate } from "@/lib/date";
import { loadDay, MEAL_LABELS, MEAL_TYPES, totals } from "@/lib/day";
import { addDays } from "@/lib/logging/clock";
import { requireProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

const dayName = (date: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ end?: string; day?: string }> }) {
  const { userId, timezone } = await requireProfile();
  const { end: requested, day: requestedDay } = await searchParams;
  const today = localDate(timezone);
  const end = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested < today ? requested : today;
  const days = Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));

  const supabase = await createClient();
  const [entries, targets] = await Promise.all([
    supabase.from("meals").select("eaten_on, log_entries(kcal)").eq("user_id", userId).gte("eaten_on", days[0]).lte("eaten_on", end),
    supabase.from("targets").select("effective_from, kcal").eq("user_id", userId).lte("effective_from", end).order("effective_from", { ascending: false }),
  ]);
  if (entries.error) throw entries.error;
  if (targets.error) throw targets.error;

  const eaten = new Map<string, number>();
  for (const meal of entries.data) {
    const kcal = meal.log_entries.reduce((total, entry) => total + Number(entry.kcal), 0);
    eaten.set(meal.eaten_on, (eaten.get(meal.eaten_on) ?? 0) + kcal);
  }
  const targetOn = (date: string) => targets.data.find((target) => target.effective_from <= date)?.kcal ?? null;

  const selected = requestedDay && days.includes(requestedDay) ? requestedDay : end;
  const selectedDay = await loadDay(userId, selected);
  const selectedTotals = totals(selectedDay.meals);
  const selectedItems = MEAL_TYPES.flatMap((type) =>
    selectedDay.meals
      .filter((meal) => meal.meal_type === type)
      .flatMap((meal) => meal.log_entries)
      .map((entry) => ({
        id: entry.id,
        label: `${MEAL_LABELS[type]}: ${entry.foods?.name ?? entry.phrase ?? `${Number(entry.grams)} g`}`,
        kcal: Math.round(Number(entry.kcal)),
        trust: entry.confidence,
      })),
  );

  const logged = days.filter((date) => eaten.has(date));
  const average = logged.length ? logged.reduce((total, date) => total + eaten.get(date)!, 0) / logged.length : null;

  return (
    <PageSlide>
      <SubPage title="History" back="/" wide>
        <div className="grid h-full gap-8 lg:grid-cols-2">
        <div className="flex h-full min-h-0 flex-col gap-3">
          <p className="shrink-0 text-sm text-muted">
            {average === null ? "Nothing logged this week." : `Average ${Math.round(average).toLocaleString("en-US")} kcal on ${logged.length} logged ${logged.length === 1 ? "day" : "days"}`}
          </p>
          <ul aria-label="Daily totals" className="min-h-0 flex-1 divide-y divide-border">
            {days.map((date) => {
              const kcal = eaten.get(date) ?? 0;
              const target = targetOn(date);
              const share = target ? Math.min(kcal / target, 1) : 0;
              return (
                <li key={date}>
                  {/* Phones open the day as a page. Desktop shows it in the column beside the week. */}
                  {[
                    { href: `/history/${date}`, className: "flex lg:hidden" },
                    { href: `/history?end=${end}&day=${date}`, className: `hidden lg:flex ${date === selected ? "font-medium" : ""}` },
                  ].map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      transitionTypes={link.className.startsWith("flex") ? ["nav-forward"] : undefined}
                      aria-current={link.className.startsWith("flex") || date !== selected ? undefined : "date"}
                      className={`${link.className} min-h-11 flex-col justify-center gap-1 py-1.5 text-sm`}
                    >
                      <span className="flex justify-between">
                        <span className="font-medium">{date === today ? "Today" : dayName(date)}</span>
                        <span className="text-muted tabular-nums">{kcal ? Math.round(kcal).toLocaleString("en-US") : "0"}{target ? ` of ${target.toLocaleString("en-US")}` : ""}</span>
                      </span>
                      <span className="block h-1.5 overflow-hidden rounded-full bg-track">
                        <span className="block h-full rounded-full" style={{ width: `${share * 100}%`, background: target && kcal > target ? "var(--data-over)" : "var(--data-calories)" }} />
                      </span>
                    </Link>
                  ))}
                </li>
              );
            })}
          </ul>
          <div className="grid shrink-0 grid-cols-2 gap-2">
            <Link href={`/history?end=${addDays(end, -7)}`} className={BUTTON_STYLES.secondary}>Earlier</Link>
            {end < today ? (
              <Link href={`/history?end=${addDays(end, 7) < today ? addDays(end, 7) : today}`} className={BUTTON_STYLES.secondary}>Later</Link>
            ) : <span />}
          </div>
        </div>
        <section aria-label="Selected day" className="hidden min-h-0 flex-col gap-3 lg:flex">
          <h2 className="text-lg font-semibold">{selected === today ? "Today" : dayName(selected)}</h2>
          <p className="shrink-0 text-sm text-muted tabular-nums">
            {Math.round(selectedTotals.kcal).toLocaleString("en-US")} kcal, P {Math.round(selectedTotals.protein)} C {Math.round(selectedTotals.carbs)} F {Math.round(selectedTotals.fat)}
            {selectedTotals.hasEstimates ? ". Includes estimates" : ""}
          </p>
          <div className="min-h-0 flex-1">
            {selectedItems.length ? <MealItems items={selectedItems} back="/history" /> : <p className="text-sm text-muted">Nothing logged this day.</p>}
          </div>
        </section>
        </div>
      </SubPage>
    </PageSlide>
  );
}
