import { addDays } from "./logging/clock";

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/** The name and every date of the month containing a date. */
export function monthCalendar(today: string) {
  const first = `${today.slice(0, 8)}01`;
  const start = new Date(`${first}T00:00:00Z`);
  const next = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
  const length = Math.round((next - start.getTime()) / 86_400_000);
  return {
    label: new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(start),
    days: Array.from({ length }, (_, i) => addDays(first, i)),
  };
}

/** Shades a day by how much of its calorie target was logged. Over target is the darkest. */
export function heatLevel(kcal: number, target: number | null): HeatLevel {
  if (kcal <= 0) return 0;
  // A day before any target was set still counts as logged.
  if (!target) return 1;
  const share = kcal / target;
  if (share >= 1) return 4;
  if (share >= 2 / 3) return 3;
  if (share >= 1 / 3) return 2;
  return 1;
}
