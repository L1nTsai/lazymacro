import Link from "next/link";
import { heatLevel, monthCalendar, type HeatLevel } from "@/lib/month";

const ROW = "grid auto-cols-fr grid-flow-col gap-1";

const heatStyle = (level: HeatLevel) => (level === 0 ? undefined : { background: `var(--heat-${level})` });

const fullDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function MonthActivity({
  today,
  eaten,
  targetOn,
}: {
  today: string;
  eaten: Map<string, number>;
  targetOn: (date: string) => number | null;
}) {
  const { label, days } = monthCalendar(today);
  // Blocks stretch to fill each row, so a shorter row still reaches the edge.
  const half = Math.ceil(days.length / 2);

  const block = (date: string) => {
    const shape = "h-4 rounded-sm [@media(min-height:720px)]:h-5";
    if (date > today) return <span key={date} className={`${shape} border border-border`} />;
    const kcal = Math.round(eaten.get(date) ?? 0);
    const name = `${fullDate.format(new Date(`${date}T00:00:00Z`))}: ${kcal ? `${kcal.toLocaleString("en-US")} kcal` : "nothing logged"}`;
    const level = heatLevel(kcal, targetOn(date));
    return (
      <span
        key={date}
        role="img"
        aria-label={name}
        aria-current={date === today ? "date" : undefined}
        title={name}
        style={heatStyle(level)}
        className={`${shape} ${level === 0 ? "bg-track" : ""} ${date === today ? "border-2 border-foreground" : ""}`}
      />
    );
  };

  return (
    <section aria-label="This month" className="flex shrink-0 flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">{label}</h2>
        <Link href="/history" transitionTypes={["nav-forward"]} className="text-sm text-muted underline underline-offset-4">View history</Link>
      </div>
      <div className="space-y-1">
        <div className={ROW}>{days.slice(0, half).map(block)}</div>
        <div className={ROW}>{days.slice(half).map(block)}</div>
      </div>
      <div aria-hidden="true" className="flex items-center justify-end gap-1 text-xs text-muted [@media(max-height:600px)]:hidden">
        <span className="mr-1">Less</span>
        {([0, 1, 2, 3, 4] as const).map((level) => (
          <span key={level} className={`size-3 rounded-sm ${level === 0 ? "bg-track" : ""}`} style={heatStyle(level)} />
        ))}
        <span className="ml-1">More</span>
      </div>
    </section>
  );
}
