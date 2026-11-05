import Link from "next/link";
import { PageSlide } from "@/components/page-slide";
import { BUTTON_STYLES, SubPage } from "@/components/ui";
import { localDate } from "@/lib/date";
import { addDays } from "@/lib/logging/clock";
import { requireProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

const dayName = (date: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ end?: string }> }) {
  const { userId, timezone } = await requireProfile();
  const { end: requested } = await searchParams;
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

  const logged = days.filter((date) => eaten.has(date));
  const average = logged.length ? logged.reduce((total, date) => total + eaten.get(date)!, 0) / logged.length : null;

  return (
    <PageSlide>
      <SubPage title="History" back="/">
        <div className="flex h-full flex-col gap-3">
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
                  <Link href={`/history/${date}`} transitionTypes={["nav-forward"]} className="flex min-h-11 flex-col justify-center gap-1 py-1.5 text-sm">
                    <span className="flex justify-between">
                      <span className="font-medium">{date === today ? "Today" : dayName(date)}</span>
                      <span className="text-muted tabular-nums">{kcal ? Math.round(kcal).toLocaleString("en-US") : "0"}{target ? ` of ${target.toLocaleString("en-US")}` : ""}</span>
                    </span>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-track">
                      <span className="block h-full rounded-full" style={{ width: `${share * 100}%`, background: target && kcal > target ? "var(--data-over)" : "var(--data-calories)" }} />
                    </span>
                  </Link>
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
      </SubPage>
    </PageSlide>
  );
}
