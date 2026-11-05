import { describe, expect, it } from "vitest";
import { cmToFeetInches, feetInchesToCm, kgToLb, lbToKg, paceKgToLb, paceLbToKg } from "./units";

describe("height", () => {
  it("converts feet and inches to centimeters", () => {
    expect(feetInchesToCm(5, 11)).toBe(180.3);
  });
  it("returns what was entered, for every height a person could have", () => {
    for (let feet = 3; feet <= 8; feet++) {
      for (let inches = 0; inches < 12; inches++) {
        expect(cmToFeetInches(feetInchesToCm(feet, inches))).toEqual({ feet, inches });
      }
    }
  });
});

describe("weight", () => {
  it("converts pounds to kilograms", () => {
    expect(lbToKg(176)).toBe(79.8);
  });
  it("returns the pounds entered, for every whole-pound weight", () => {
    for (let lb = 45; lb <= 1100; lb++) {
      expect(kgToLb(lbToKg(lb))).toBe(lb);
    }
  });
});

describe("pace", () => {
  it("returns the pace chosen", () => {
    for (const lb of [0.5, 1, 1.5, 2]) {
      expect(paceKgToLb(paceLbToKg(lb))).toBe(lb);
    }
  });
});
