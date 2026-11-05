import { describe, expect, it, vi } from "vitest";
import type { ParsedItem, RestaurantResult } from "../ai/schemas";
import { resolveMeals, type ResolveDeps } from "./resolve";
import type { DraftFood } from "./types";

const usda = (name: string, kcal = 100, extra: Partial<DraftFood> = {}): DraftFood => ({
  id: "00000000-0000-4000-8000-000000000001",
  name,
  brand: null,
  trust: "verified",
  sourceUrl: null,
  kcal,
  protein: 10,
  carbs: 10,
  fat: 1,
  densityGPerMl: null,
  portions: [],
  newFood: null,
  ...extra,
});

const parsed = (food: string, extra: Partial<ParsedItem> = {}): ParsedItem => ({
  phrase: food,
  food,
  brand: null,
  quantity: 100,
  unit: "g",
  restaurant: null,
  modifications: [],
  assumptions: [],
  ...extra,
});

/** By default nothing is found anywhere, and the AI must not be needed. */
function deps(overrides: Partial<ResolveDeps> = {}): ResolveDeps {
  return {
    alias: vi.fn(async () => null),
    lastChoice: vi.fn(async () => null),
    savedFoods: vi.fn(async () => []),
    usdaCandidates: vi.fn(async () => []),
    brandedFoods: vi.fn(async () => []),
    pickFoods: vi.fn(async (items) => items.map(() => 0)),
    lookupRestaurant: vi.fn(async () => null),
    buildDish: vi.fn(async () => []),
    estimateFood: vi.fn(async () => {
      throw new Error("the AI estimate should not have been used");
    }),
    ...overrides,
  };
}

const context = { today: "2026-11-05", hour: 8, source: "text" as const, transcript: "x" };
const run = (items: ParsedItem[], d: ResolveDeps, when: "today" | "yesterday" = "today", meal: "lunch" | null = null) =>
  resolveMeals({ meals: [{ when, meal, items }] }, context, d);

const estimate = { kcal_per_100g: 200, protein_per_100g: 10, carbs_per_100g: 20, fat_per_100g: 8, grams_per_serving: 250 };

describe("the order of food sources", () => {
  it("uses a person's alias first and asks the AI nothing", async () => {
    const d = deps({ alias: vi.fn(async () => ({ food: usda("My whey"), defaultGrams: 32 })) });
    const { meals } = await run([parsed("whey", { quantity: 1, unit: "scoop", assumptions: ["Brand not stated"] })], d);
    expect(meals[0].items[0].food.name).toBe("My whey");
    expect(meals[0].items[0].grams).toBe(32);
    expect(meals[0].items[0].assumptions).toEqual([]);
    expect(d.pickFoods).not.toHaveBeenCalled();
    expect(d.usdaCandidates).not.toHaveBeenCalled();
  });

  it("uses their last choice next, and flags it when a detail was missing", async () => {
    const d = deps({ lastChoice: vi.fn(async () => usda("Milk, whole")) });
    const { meals } = await run([parsed("milk", { assumptions: ["Fat % not stated"] })], d);
    expect(meals[0].items[0].food.name).toBe("Milk, whole");
    expect(meals[0].items[0].assumptions).toEqual(["Used your last choice"]);
  });

  it("uses a team-saved food on an exact name", async () => {
    const d = deps({ savedFoods: vi.fn(async () => [usda("Grandma's chili")]) });
    const { meals } = await run([parsed("grandma's chili")], d);
    expect(meals[0].items[0].food.name).toBe("Grandma's chili");
    expect(d.pickFoods).not.toHaveBeenCalled();
  });

  it("chooses among database entries in one AI call, and takes macros from the database", async () => {
    const d = deps({
      usdaCandidates: vi.fn(async (q) => [usda(`${q} A`, 50), usda(`${q} B`, 379)]),
      pickFoods: vi.fn(async (items) => items.map(() => 1)),
    });
    const { meals } = await run([parsed("oats", { quantity: 60 }), parsed("milk", { quantity: 300 })], d);
    expect(d.pickFoods).toHaveBeenCalledTimes(1);
    expect(meals[0].items[0].food.name).toBe("oats B");
    expect(meals[0].items[0].food.kcal).toBe(379);
    expect(d.estimateFood).not.toHaveBeenCalled();
  });

  it("never uses an AI estimate while the database has the food", async () => {
    const d = deps({ usdaCandidates: vi.fn(async () => [usda("Apples, raw")]) });
    await run([parsed("apple")], d);
    expect(d.estimateFood).not.toHaveBeenCalled();
    expect(d.buildDish).not.toHaveBeenCalled();
  });

  it("falls to USDA branded foods when the AI rejects every generic match", async () => {
    const d = deps({
      usdaCandidates: vi.fn(async () => [usda("Not it")]),
      brandedFoods: vi.fn(async () => [usda("Barebells bar")]),
      pickFoods: vi.fn(async (items) => (items[0].candidates[0] === "Not it" ? [null] : [0])),
    });
    const { meals } = await run([parsed("protein bar", { brand: "Barebells" })], d);
    expect(meals[0].items[0].food.name).toBe("Barebells bar");
    expect(d.estimateFood).not.toHaveBeenCalled();
  });

  it("builds a dish from database ingredients before estimating", async () => {
    const d = deps({
      usdaCandidates: vi.fn(async (q) => (q === "local curry" ? [] : [usda(q)])),
      buildDish: vi.fn(async () => [{ food: "rice", grams: 200 }, { food: "chicken", grams: 150 }]),
    });
    const { meals } = await run([parsed("local curry", { quantity: 1, unit: "serving" })], d);
    const items = meals[0].items;
    expect(items.map((i) => i.food.name)).toEqual(["rice", "chicken"]);
    expect(items[0].grams).toBe(200);
    expect(items[0].dish).toBe("local curry");
    expect(items[0].food.trust).toBe("estimated");
    expect(d.estimateFood).not.toHaveBeenCalled();
  });

  it("won't build a dish if any part is missing from the database", async () => {
    const d = deps({
      usdaCandidates: vi.fn(async (q) => (q === "rice" ? [usda("rice")] : [])),
      buildDish: vi.fn(async () => [{ food: "rice", grams: 200 }, { food: "mystery", grams: 50 }]),
      estimateFood: vi.fn(async () => estimate),
    });
    const { meals } = await run([parsed("local curry")], d);
    expect(meals[0].items[0].food.trust).toBe("rough");
  });

  it("uses an AI estimate only when everything else found nothing, and marks it rough", async () => {
    const d = deps({ estimateFood: vi.fn(async () => estimate) });
    const { meals } = await run([parsed("unknown snack", { quantity: null, unit: "serving" })], d);
    const item = meals[0].items[0];
    expect(item.food.trust).toBe("rough");
    expect(item.food.newFood).toEqual({ source: "custom", sourceId: null });
    expect(item.grams).toBe(250);
    expect(item.assumptions).toContain("AI estimate, not from a database");
  });

  it("rejects an impossible AI estimate", async () => {
    const d = deps({ estimateFood: vi.fn(async () => ({ ...estimate, kcal_per_100g: 5000 })) });
    const { meals, unresolved } = await run([parsed("broken")], d);
    expect(meals).toEqual([]);
    expect(unresolved).toEqual(["broken"]);
  });

  it("still shows the top database match if the AI picker fails", async () => {
    const d = deps({
      usdaCandidates: vi.fn(async () => [usda("Top match")]),
      pickFoods: vi.fn(async () => {
        throw new Error("down");
      }),
    });
    const { meals } = await run([parsed("apple")], d);
    expect(meals[0].items[0].food.name).toBe("Top match");
    expect(meals[0].items[0].assumptions).toContain("Best match. Tap to check");
    expect(d.estimateFood).not.toHaveBeenCalled();
  });
});

describe("restaurant food", () => {
  const page: RestaurantResult = { found: true, name: "Deluxe Sandwich", chain: "Chick-fil-A", url: "https://chick-fil-a.com/menu/deluxe", kcal: 490, protein_g: 32, carbs_g: 40, fat_g: 22, serving_grams: null, adjusted: false };
  const sandwich = parsed("chicken sandwich", { restaurant: "Chick-fil-A", quantity: 1, unit: "serving" });

  it("uses the chain's own numbers, keeps the link, and totals what the chain lists", async () => {
    const d = deps({ lookupRestaurant: vi.fn(async () => page) });
    const { meals } = await run([sandwich], d);
    const item = meals[0].items[0];
    expect(item.food.trust).toBe("verified");
    expect(item.food.sourceUrl).toBe(page.url);
    expect(item.food.newFood?.source).toBe("restaurant");
    expect((item.food.kcal * item.grams) / 100).toBeCloseTo(490, 0);
  });

  it("keeps the serving weight, so logging the saved dish later gives the same calories", async () => {
    const d = deps({ lookupRestaurant: vi.fn(async () => page) });
    const first = (await run([sandwich], d)).meals[0].items[0];
    const saved = { ...first.food, id: "00000000-0000-4000-8000-000000000002", newFood: null };

    const later = deps({ lastChoice: vi.fn(async () => saved) });
    const second = (await run([sandwich], later)).meals[0].items[0];
    expect((second.food.kcal * second.grams) / 100).toBeCloseTo(490, 0);
    expect(second.assumptions).toEqual([]);
  });

  it("marks order changes as adjusted", async () => {
    const d = deps({ lookupRestaurant: vi.fn(async () => ({ ...page, adjusted: true })) });
    const { meals } = await run([{ ...sandwich, modifications: ["no cheese"] }], d);
    expect(meals[0].items[0].adjusted).toBe(true);
    expect(meals[0].items[0].food.name).toContain("no cheese");
  });

  it("falls back to the normal order when the chain's page isn't found", async () => {
    const d = deps({ usdaCandidates: vi.fn(async () => [usda("Chicken sandwich")]) });
    const { meals } = await run([sandwich], d);
    expect(meals[0].items[0].food.name).toBe("Chicken sandwich");
  });
});

describe("meals", () => {
  it("infers the meal from the clock when none was said", async () => {
    const d = deps({ usdaCandidates: vi.fn(async () => [usda("Apple")]) });
    const { meals } = await run([parsed("apple")], d);
    expect(meals[0].mealType).toBe("breakfast");
  });

  it("keeps what they said, and handles yesterday", async () => {
    const d = deps({ usdaCandidates: vi.fn(async () => [usda("Apple")]) });
    const { meals } = await run([parsed("apple")], d, "yesterday", "lunch");
    expect(meals[0].mealType).toBe("lunch");
    expect(meals[0].eatenOn).toBe("2026-11-04");
  });

  it("gives each meal its own id, so retrying one can't duplicate another", async () => {
    const d = deps({ usdaCandidates: vi.fn(async () => [usda("Apple")]) });
    const { meals } = await resolveMeals(
      { meals: [{ when: "today", meal: "breakfast", items: [parsed("oats")] }, { when: "today", meal: "lunch", items: [parsed("wrap")] }] },
      context,
      d,
    );
    expect(meals).toHaveLength(2);
    expect(meals[0].clientId).not.toBe(meals[1].clientId);
  });

  it("reports food it couldn't place, rather than dropping it silently", async () => {
    const d = deps({ estimateFood: vi.fn(async () => { throw new Error("down"); }) });
    const { unresolved } = await run([parsed("mystery")], d);
    expect(unresolved).toEqual(["mystery"]);
  });
});
