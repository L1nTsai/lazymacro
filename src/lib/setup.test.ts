import { describe, expect, it } from "vitest";
import { setupSchema, type SetupInput } from "./setup";

const valid: SetupInput = {
  body: { sex: "female", birthYear: 1990, heightCm: 165, weightKg: 60, activity: "light", goal: "lose", paceKgPerWeek: 0.25 },
  targets: { kcal: 1700, proteinG: 96, carbsG: 200, fatG: 52 },
  allergies: ["peanuts"],
  excluded: [],
  staples: ["salt"],
  showOz: false,
  timezone: "America/New_York",
};

describe("setupSchema", () => {
  it("accepts a full setup and a manual one", () => {
    expect(setupSchema.safeParse(valid).success).toBe(true);
    expect(setupSchema.safeParse({ ...valid, body: null }).success).toBe(true);
  });
  it("rejects a goal and pace that disagree", () => {
    expect(setupSchema.safeParse({ ...valid, body: { ...valid.body!, goal: "maintain" } }).success).toBe(false);
    expect(setupSchema.safeParse({ ...valid, body: { ...valid.body!, paceKgPerWeek: 0 } }).success).toBe(false);
  });
  it("rejects impossible values and bad time zones", () => {
    expect(setupSchema.safeParse({ ...valid, targets: { ...valid.targets, kcal: 0 } }).success).toBe(false);
    expect(setupSchema.safeParse({ ...valid, timezone: "Nowhere" }).success).toBe(false);
  });
});
