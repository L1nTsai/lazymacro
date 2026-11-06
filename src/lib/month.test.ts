import { describe, expect, it } from "vitest";
import { heatLevel, monthCalendar } from "./month";

describe("monthCalendar", () => {
  it("lists every day of the month", () => {
    const month = monthCalendar("2026-08-15");
    expect(month.label).toBe("August");
    expect(month.days).toHaveLength(31);
    expect(month.days[0]).toBe("2026-08-01");
    expect(month.days[30]).toBe("2026-08-31");
  });

  it("handles February in a leap year", () => {
    expect(monthCalendar("2028-02-01").days).toHaveLength(29);
  });

  it("stays in the month at a year end", () => {
    const { days } = monthCalendar("2026-12-31");
    expect(days[0]).toBe("2026-12-01");
    expect(days.at(-1)).toBe("2026-12-31");
  });
});

describe("heatLevel", () => {
  it("leaves unlogged days empty", () => {
    expect(heatLevel(0, 2000)).toBe(0);
  });

  it("darkens as a day approaches its target", () => {
    expect(heatLevel(100, 2000)).toBe(1);
    expect(heatLevel(1000, 2000)).toBe(2);
    expect(heatLevel(1500, 2000)).toBe(3);
    expect(heatLevel(2000, 2000)).toBe(4);
    expect(heatLevel(3000, 2000)).toBe(4);
  });

  it("still marks a logged day that has no target", () => {
    expect(heatLevel(500, null)).toBe(1);
  });
});
