import { describe, expect, it } from "vitest";
import { addDays, hourIn, mealFromHour } from "./clock";

describe("mealFromHour", () => {
  it("follows the plan's clock rule", () => {
    expect(mealFromHour(10)).toBe("breakfast");
    expect(mealFromHour(11)).toBe("lunch");
    expect(mealFromHour(15)).toBe("snack");
    expect(mealFromHour(18)).toBe("dinner");
    expect(mealFromHour(23)).toBe("snack");
  });
});

describe("hourIn", () => {
  it("uses the person's clock", () => {
    const instant = new Date("2026-11-05T06:30:00Z");
    expect(hourIn("America/Los_Angeles", instant)).toBe(22);
    expect(hourIn("Asia/Tokyo", instant)).toBe(15);
  });
});

describe("addDays", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
