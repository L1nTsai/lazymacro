import { describe, expect, it } from "vitest";
import { setupSchema, type SetupInput } from "./setup";

const valid: SetupInput = {
  name: "Lin",
  body: { sex: "female", birthYear: 1990, heightCm: 165, weightKg: 60, activity: "light", goal: "lose", paceKgPerWeek: 0.25 },
  targets: { kcal: 1700, proteinG: 96, carbsG: 200, fatG: 52 },
  formula: { proteinGPerLb: 1, fatUnit: "percent", fatValue: 25 },
  allergies: ["peanuts"],
  excluded: [],
  staples: ["salt"],
  showOz: false,
  timezone: "America/New_York",
};

describe("setupSchema", () => {
  it("accepts a full setup", () => {
    expect(setupSchema.safeParse(valid).success).toBe(true);
  });
  it("requires a name and body details", () => {
    expect(setupSchema.safeParse({ ...valid, name: "  " }).success).toBe(false);
    expect(setupSchema.safeParse({ ...valid, body: null }).success).toBe(false);
  });
  it("rejects a goal and pace that disagree", () => {
    expect(setupSchema.safeParse({ ...valid, body: { ...valid.body, goal: "maintain" } }).success).toBe(false);
    expect(setupSchema.safeParse({ ...valid, body: { ...valid.body, paceKgPerWeek: 0 } }).success).toBe(false);
  });
  it("checks fat against its unit", () => {
    expect(setupSchema.safeParse({ ...valid, formula: { ...valid.formula, fatValue: 91 } }).success).toBe(false);
    expect(setupSchema.safeParse({ ...valid, formula: { ...valid.formula, fatUnit: "grams", fatValue: 91 } }).success).toBe(true);
  });
  it("rejects impossible values and bad time zones", () => {
    expect(setupSchema.safeParse({ ...valid, targets: { ...valid.targets, kcal: 0 } }).success).toBe(false);
    expect(setupSchema.safeParse({ ...valid, timezone: "Nowhere" }).success).toBe(false);
  });
});
