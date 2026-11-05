import { describe, expect, it } from "vitest";
import { isValidTimeZone, localDate } from "./date";

describe("localDate", () => {
  const instant = new Date("2026-11-05T06:30:00Z");

  it("uses the person's date, not the server's", () => {
    expect(localDate("America/Los_Angeles", instant)).toBe("2026-11-04");
    expect(localDate("Asia/Tokyo", instant)).toBe("2026-11-05");
  });
});

describe("isValidTimeZone", () => {
  it("accepts real zones and rejects anything else", () => {
    expect(isValidTimeZone("Europe/Paris")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});
