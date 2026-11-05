import { expect, test, type Page } from "@playwright/test";
import { TEST_PASSWORD, logEmailFor, queryJson, runSql } from "./helpers";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /^Hi,/ })).toBeVisible();
}

/** The same design rules as the foundation tests. */
async function expectDesignRules(page: Page) {
  const problems = await page.evaluate(() => {
    const found: string[] = [];
    const viewport = window.innerHeight;
    const root = document.documentElement;
    if (root.scrollHeight > viewport + 1) found.push(`page is ${root.scrollHeight}px tall in a ${viewport}px screen`);
    if (root.scrollWidth > window.innerWidth + 1) found.push("page scrolls sideways");
    for (const el of document.querySelectorAll("main, main *, nav, nav *")) {
      if (el.closest("svg") || el.closest("[aria-hidden]")) continue;
      const box = el.getBoundingClientRect();
      if (box.height > 0 && box.bottom > viewport + 1) found.push(`${el.tagName} "${el.textContent?.slice(0, 30)}" is cut off at ${Math.round(box.bottom)}px`);
    }
    for (const el of document.querySelectorAll("*")) {
      const style = getComputedStyle(el);
      const shadow = style.boxShadow !== "none" && !/^(rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(, )?)+$/.test(style.boxShadow);
      if (shadow || style.textShadow !== "none" || style.filter !== "none") found.push(`${el.tagName} has a shadow or filter`);
    }
    return found;
  });
  expect(problems).toEqual([]);
}

async function typeMeal(page: Page, text: string) {
  await page.goto("/log");
  await page.getByRole("button", { name: "Type instead" }).click();
  await page.getByLabel("What you ate").fill(text);
  await page.getByRole("button", { name: "Continue" }).click();
}

/**
 * Interactions during a page slide land on the outgoing page, as they would for a
 * person. This waits a fixed time because asking WebKit's test build for running
 * animations mid-slide crashes it: 3 of 3 runs with that check, 0 of 3 without.
 */
const SLIDE_MS = 500;
const settled = (page: Page) => page.waitForTimeout(SLIDE_MS);

const resetLog = (email: string) =>
  runSql(`
    delete from public.meals where user_id = (select id from auth.users where email = '${email}');
    delete from public.user_aliases where user_id = (select id from auth.users where email = '${email}');
    delete from public.user_corrections where user_id = (select id from auth.users where email = '${email}');
    delete from public.favorites where user_id = (select id from auth.users where email = '${email}');
    delete from public.ai_usage where user_id = (select id from auth.users where email = '${email}');
  `);

const countMeals = (email: string) =>
  queryJson<{ n: number }>(`select count(*)::int as n from public.meals where user_id = (select id from auth.users where email = '${email}')`)[0].n;

const mockStats = async (page: Page) => (await page.request.get("http://localhost:3199/__stats")).json();

test.beforeEach(async ({}, info) => {
  resetLog(logEmailFor(info.project.name));
});

test("the plan's worked example goes from a sentence to the dashboard", async ({ page }, info) => {
  await signIn(page, logEmailFor(info.project.name));
  await typeMeal(page, "Today I ate 60 grams of quick oats with 300 grams of milk and one scoop of whey protein.");

  await expect(page.getByRole("heading", { name: "Check your meal" })).toBeVisible();
  const oats = page.getByRole("button", { name: /Edit Cereals, oats, regular and quick, not fortified, dry/ });
  await expect(oats).toContainText("227 kcal");
  await expect(oats).toContainText("60 g");
  // All three items fit on one screen, even the smallest.
  await expect(page.getByRole("button", { name: "Next" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Edit Milk, reduced fat, fluid, 2%/ })).toContainText("300 g");
  await expect(page.getByText("Fat % not stated")).toBeVisible();
  await expect(page.getByText("Verified").first()).toBeVisible();
  await expectDesignRules(page);
  await page.screenshot({ path: `test-results/${info.project.name}-log-review.png` });

  // Nothing is saved until Confirm.
  expect(countMeals(logEmailFor(info.project.name))).toBe(0);

  // Editing updates the numbers live.
  await page.getByRole("button", { name: /Edit Beverages, Whey/ }).click();
  await expect(page.getByRole("heading", { name: "Edit item" })).toBeVisible();
  await settled(page);
  // USDA publishes a real scoop size for this food, so it's used over any default.
  await expect(page.getByText("Assumed 1 scoop is 28.7 g")).toBeVisible();
  await expectDesignRules(page);
  await page.screenshot({ path: `test-results/${info.project.name}-log-item.png` });
  await page.getByLabel("Amount").fill("2");
  await expect(page.getByText("57.3 g", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByLabel("Meal", { exact: true }).selectOption("breakfast");
  await page.getByRole("button", { name: "Confirm" }).click();

  await expect(page.getByRole("heading", { name: /^Hi,/ })).toBeVisible();
  await expect(page.getByText("kcal left")).toBeVisible();
  await expect(page.getByRole("link", { name: /Meals/ })).not.toContainText("Nothing logged");
  await expectDesignRules(page);
  await page.screenshot({ path: `test-results/${info.project.name}-log-today.png` });

  const rows = queryJson<{ kcal: string; confidence: string; meal_type: string; parsed_food: string }>(`
    select e.kcal::text, e.confidence, m.meal_type, e.parsed_food from public.log_entries e join public.meals m on m.id = e.meal_id
    where e.user_id = (select id from auth.users where email = '${logEmailFor(info.project.name)}') order by e.created_at, e.parsed_food`);
  expect(rows).toHaveLength(3);
  expect(rows.every((r) => r.meal_type === "breakfast")).toBe(true);
  expect(rows.find((r) => r.parsed_food === "quick oats")!.kcal).toBe("227.4");

  // The meal can be opened, edited and removed afterward.
  await page.goto("/meals/breakfast");
  await page.getByRole("link", { name: /oats, regular and quick/ }).click();
  await expect(page.getByRole("heading", { name: "Edit item" })).toBeVisible();
  await page.getByLabel("Amount").fill("100");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("link", { name: /oats, regular and quick/ })).toContainText("379 kcal");
  await page.getByRole("link", { name: /oats, regular and quick/ }).click();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("heading", { name: "Breakfast" })).toBeVisible();
  await expect(page.getByRole("link", { name: /oats, regular and quick/ })).toHaveCount(0);
});

test("a connection lost during Confirm never logs a meal twice", async ({ page }, info) => {
  const email = logEmailFor(info.project.name);
  await signIn(page, email);
  await typeMeal(page, "just milk");
  await expect(page.getByRole("heading", { name: "Check your meal" })).toBeVisible();

  // The server saves it, but the answer never reaches the phone.
  let dropped = false;
  await page.route("**/api/meals", async (route) => {
    if (dropped) return route.continue();
    dropped = true;
    await route.fetch();
    await route.abort();
  });
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("won't be logged twice");
  await expect(page.getByRole("button", { name: /Edit Milk/ })).toBeVisible();
  await expectDesignRules(page);
  expect(countMeals(email)).toBe(1);

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { name: /^Hi,/ })).toBeVisible();
  expect(countMeals(email)).toBe(1);
});

test("a failed parse keeps the text and offers Retry", async ({ page }, info) => {
  await signIn(page, logEmailFor(info.project.name));
  let failed = false;
  await page.route("**/api/parse", async (route) => {
    if (failed) return route.continue();
    failed = true;
    await route.abort();
  });
  await typeMeal(page, "just milk");
  await expect(page.locator("p[role=alert]")).toContainText("Your text is still here");
  await expect(page.getByLabel("What you ate")).toHaveValue("just milk");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { name: "Check your meal" })).toBeVisible();
});

test("correcting a food twice offers to remember it, then uses it", async ({ page }, info) => {
  await signIn(page, logEmailFor(info.project.name));

  for (const round of [1, 2]) {
    await typeMeal(page, "just milk");
    await page.getByRole("button", { name: /Edit Milk/ }).click();
    await page.getByRole("button", { name: "Change food" }).click();
    await expect(page.getByRole("heading", { name: "Change food" })).toBeVisible();
    await page.getByLabel("Food name").fill("milk whole");
    await page.getByRole("button", { name: /Milk, whole, 3\.25% milkfat, with added vitamin D/ }).first().click();
    await expect(page.getByRole("heading", { name: "Edit item" })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    if (round === 1) await expect(page.getByRole("heading", { name: /^Hi,/ })).toBeVisible();
  }

  await expect(page.getByRole("heading", { name: "Remember this?" })).toBeVisible();
  await expect(page.getByText(/when you say .milk./)).toBeVisible();
  await expectDesignRules(page);
  await page.getByRole("button", { name: "Always use it" }).click();
  await expect(page.getByRole("heading", { name: /^Hi,/ })).toBeVisible();

  // Next time it's already right, with no question to the AI about which milk.
  const before = (await mockStats(page)).pick;
  await typeMeal(page, "just milk");
  await expect(page.getByRole("button", { name: /Edit Milk, whole/ })).toBeVisible();
  await expect(page.getByText("Fat % not stated")).toHaveCount(0);
  expect((await mockStats(page)).pick).toBe(before);

  await page.goto("/me/saved/aliases");
  await expect(page.getByText('"milk"')).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText('"milk"')).toHaveCount(0);
});

test("restaurant food shows the chain's numbers and a source link", async ({ page }, info) => {
  await signIn(page, logEmailFor(info.project.name));
  await typeMeal(page, "a deluxe sandwich from chick-fil-a");
  const card = page.getByRole("button", { name: /Edit E2E Deluxe Sandwich/ });
  await expect(card).toContainText("490 kcal");
  await expect(card).toContainText("Verified");
  await card.click();
  await expect(page.getByRole("link", { name: "Source" })).toHaveAttribute("href", "https://www.chick-fil-a.com/menu/deluxe-sandwich");
  await page.getByLabel("Amount").fill("2");
  await expect(page.getByText("980", { exact: true })).toBeVisible();
  await page.getByLabel("Amount").fill("1");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("heading", { name: /^Hi,/ })).toBeVisible();

  const [food] = queryJson<{ confidence: string; source: string; source_url: string }>(`select confidence, source, source_url from public.foods where name = 'E2E Deluxe Sandwich'`);
  expect(food).toEqual({ confidence: "verified", source: "restaurant", source_url: "https://www.chick-fil-a.com/menu/deluxe-sandwich" });
});

test("homemade dishes are built from database parts and marked estimated", async ({ page }, info) => {
  await signIn(page, logEmailFor(info.project.name));
  const before = (await mockStats(page)).estimate;
  await typeMeal(page, "some local curry");
  const rice = page.getByRole("button", { name: /Edit Rice, white/ });
  await expect(rice).toContainText("Estimated");
  await expect(rice).toContainText("200 g");
  await expect(page.getByRole("button", { name: /Edit Chicken, breast/ })).toContainText("Estimated");
  expect((await mockStats(page)).estimate).toBe(before);
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Includes estimates")).toBeVisible();
  await expectDesignRules(page);
});

test("AI macros appear only as a labelled last resort", async ({ page }, info) => {
  await signIn(page, logEmailFor(info.project.name));
  await typeMeal(page, "a mystery snack");
  const card = page.getByRole("button", { name: /Edit e2e mystery snack/ });
  await expect(card).toContainText("Rough");
  // The chip shows the first time. After that the saved food keeps its Rough badge.
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Includes estimates")).toBeVisible();

  // The same food later stays rough for the whole team.
  const [food] = queryJson<{ confidence: string }>(`select confidence from public.foods where name = 'e2e mystery snack'`);
  expect(food.confidence).toBe("rough");
});

test("one sentence with two meals logs two meals", async ({ page }, info) => {
  const email = logEmailFor(info.project.name);
  await signIn(page, email);
  await typeMeal(page, "Breakfast was oats, and for lunch I had chicken breast");
  await expect(page.getByRole("heading", { name: "Meal 1 of 2" })).toBeVisible();
  await expect(page.getByLabel("Meal", { exact: true })).toHaveValue("breakfast");
  await page.getByRole("button", { name: "Next meal" }).click();
  await expect(page.getByRole("heading", { name: "Meal 2 of 2" })).toBeVisible();
  await expect(page.getByLabel("Meal", { exact: true })).toHaveValue("lunch");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("heading", { name: /^Hi,/ })).toBeVisible();
  expect(countMeals(email)).toBe(2);
});

test("swiping a card left deletes it", async ({ page }, info) => {
  await signIn(page, logEmailFor(info.project.name));
  await typeMeal(page, "the usual");
  const card = page.getByRole("button", { name: /Edit Cereals, oats/ });
  await expect(card).toBeVisible();
  await settled(page);
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 200, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Check your meal" })).toBeVisible();
});

test("searching and entering label values work without the AI", async ({ page }, info) => {
  const email = logEmailFor(info.project.name);
  await signIn(page, email);
  await page.goto("/log");
  await expectDesignRules(page);
  await page.screenshot({ path: `test-results/${info.project.name}-log-capture.png` });
  await page.getByRole("button", { name: "Search foods" }).click();
  await page.getByLabel("Food name").fill("chicken breast");
  await page.getByRole("button", { name: /Chicken, breast, boneless, skinless, raw/ }).click();
  await expect(page.getByRole("heading", { name: "Check your meal" })).toBeVisible();

  await page.getByRole("button", { name: "Add food" }).click();
  await page.getByRole("button", { name: "Enter from a label" }).click();
  await expect(page.getByRole("heading", { name: "Enter from a label" })).toBeVisible();
  await settled(page);
  await page.getByLabel("Food name").fill("E2E protein bar");
  await page.getByLabel("Calories").fill("200");
  await page.getByLabel("Serving (g)").fill("60");
  await page.getByLabel("Protein (g)").fill("20");
  await page.getByLabel("Carbs (g)").fill("22");
  await page.getByLabel("Fat (g)").fill("7");
  await expectDesignRules(page);
  await page.getByRole("button", { name: "Add food" }).click();

  const bar = page.getByRole("button", { name: /Edit E2E protein bar/ });
  await expect(bar).toContainText("200 kcal");
  await expect(bar).toContainText("Rough");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("heading", { name: /^Hi,/ })).toBeVisible();
  expect(countMeals(email)).toBe(1);
});

test("favorites repeat a meal in one tap", async ({ page }, info) => {
  const email = logEmailFor(info.project.name);
  await signIn(page, email);
  await typeMeal(page, "just milk");
  await page.getByRole("button", { name: "Save favorite" }).click();
  await page.getByLabel("Name").fill("My milk");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("heading", { name: /^Hi,/ })).toBeVisible();
  expect(countMeals(email)).toBe(1);

  await page.goto("/log");
  await page.getByRole("button", { name: "Repeat a favorite" }).click();
  await page.getByRole("button", { name: /My milk/ }).click();
  await expect(page.getByRole("heading", { name: /^Hi,/ })).toBeVisible();
  expect(countMeals(email)).toBe(2);

  await page.goto("/me/saved/favorites");
  await expect(page.getByText("My milk")).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("My milk")).toHaveCount(0);
});

test("history shows the week, and yesterday's meal can be copied", async ({ page }, info) => {
  const email = logEmailFor(info.project.name);
  // A meal yesterday, in whichever meal slot the clock says it is now.
  runSql(`
    with me as (select id from auth.users where email = '${email}'),
    slot as (
      select case
        when h < 4 then 'snack' when h < 11 then 'breakfast' when h < 15 then 'lunch'
        when h < 17 then 'snack' when h < 22 then 'dinner' else 'snack' end::public.meal_type as t
      from (select extract(hour from now() at time zone 'UTC')::int as h) x
    ),
    meal as (
      insert into public.meals (user_id, eaten_on, meal_type, source, client_id)
      select me.id, (now() at time zone 'UTC')::date - 1, slot.t, 'manual', gen_random_uuid() from me, slot returning id, user_id
    )
    insert into public.log_entries (meal_id, user_id, food_id, quantity, unit, grams, kcal, protein_g, carbs_g, fat_g, confidence)
    select meal.id, meal.user_id, (select id from public.foods where source = 'usda' order by source_id limit 1), 100, 'g', 100, 500, 10, 10, 10, 'verified' from meal;
  `);
  await signIn(page, email);

  await page.getByRole("link", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(page.getByText(/Average 500 kcal on 1 logged day/)).toBeVisible();
  await expectDesignRules(page);
  await page.screenshot({ path: `test-results/${info.project.name}-history.png` });

  await page.getByRole("list", { name: "Daily totals" }).getByRole("link").nth(5).click();
  await expect(page.getByText(/500 kcal of 2,000/)).toBeVisible();
  await expectDesignRules(page);

  await page.goto("/history");
  await page.getByRole("link", { name: "Earlier" }).click();
  await expect(page.getByText("Nothing logged this week.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Later" })).toBeVisible();

  await page.goto("/log");
  await page.getByRole("button", { name: /Copy yesterday/ }).click();
  await expect(page.getByRole("heading", { name: /^Hi,/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Meals/ })).toContainText(" kcal");
  expect(countMeals(email)).toBe(2);
});

/** A stand-in for the browser's speech engine, since tests have no one speaking. */
async function fakeSpeech(page: Page, script: { words?: string; error?: string; missing?: boolean }) {
  await page.addInitScript((setup) => {
    const w = window as unknown as Record<string, unknown>;
    if (setup.missing) {
      Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
      Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
      return;
    }
    class FakeRecognition {
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        w.speechStarted = true;
        setTimeout(() => {
          if (setup.error) {
            this.onerror?.({ error: setup.error });
            this.onend?.();
          } else if (setup.words) {
            this.onresult?.({ results: [[{ transcript: setup.words }]] });
          }
        }, 300);
      }
      stop() {
        w.speechStopped = true;
        this.onend?.();
      }
      abort() {}
    }
    Object.defineProperty(window, "SpeechRecognition", { value: FakeRecognition, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: FakeRecognition, configurable: true });
  }, script);
}

test("speaking uses the browser, finishes after a pause, and needs no Gemini", async ({ page }, info) => {
  await fakeSpeech(page, { words: "just milk" });
  await signIn(page, logEmailFor(info.project.name));
  const before = await mockStats(page);

  // Desktop starts from the sidebar's button, phones from the raised mic.
  await page.getByRole("link", { name: "Log a meal" }).locator("visible=true").click();
  await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
  await expect(page.getByText("just milk")).toBeVisible();
  await expectDesignRules(page);

  // Nobody taps stop: the pause ends it, and the words go to the review page.
  await expect(page.getByRole("heading", { name: "Check your meal" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /Edit Milk/ })).toBeVisible();

  const after = await mockStats(page);
  expect(after.parse).toBe(before.parse + 1);
  expect(after.uploads).toBe(before.uploads);
  expect(after.transcribes).toBe(before.transcribes);

  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("heading", { name: /^Hi,/ })).toBeVisible();
  const [meal] = queryJson<{ source: string }>(`select source from public.meals where user_id = (select id from auth.users where email = '${logEmailFor(info.project.name)}')`);
  expect(meal.source).toBe("voice");
});

test("tapping stop finishes right away", async ({ page }, info) => {
  await fakeSpeech(page, { words: "just milk" });
  await signIn(page, logEmailFor(info.project.name));
  await page.goto("/log");
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByText("just milk")).toBeVisible();
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByRole("heading", { name: "Check your meal" })).toBeVisible();
});

for (const [script, message] of [
  [{ missing: true }, "Voice isn't available in this browser"],
  [{ error: "not-allowed" }, "Microphone access is off"],
  [{ error: "service-not-allowed" }, "Siri turned on"],
  [{ error: "no-speech" }, "No speech was heard"],
  [{ error: "network" }, "Voice needs a connection"],
] as const) {
  test(`voice explains itself: ${message}`, async ({ page }, info) => {
    await fakeSpeech(page, script);
    await signIn(page, logEmailFor(info.project.name));
    await page.goto("/log");
    await page.getByRole("button", { name: "Start recording" }).click();
    await expect(page.locator("p[role=alert]")).toContainText(message);
    await expectDesignRules(page);
    await page.getByRole("button", { name: "Type instead" }).click();
    await expect(page.getByLabel("What you ate")).toBeVisible();
  });
}

test.describe("when the phone's clock differs from the server's", () => {
  // Half a day from UTC, so a clock read in both places can't agree.
  test.use({ timezoneId: "Pacific/Kiritimati" });

  test("pages load without the two disagreeing", async ({ page }, info) => {
    const errors: string[] = [];
    // Only React's mismatch errors. Safari also reports prefetches this test cancels.
    page.on("pageerror", (error) => {
      if (/react|hydrat/i.test(error.message)) errors.push(error.message);
    });
    await signIn(page, logEmailFor(info.project.name));
    for (const path of ["/", "/log", "/meals", "/history", "/me", "/me/goals", "/foods"]) {
      await page.goto(path);
      await expect(page.locator("h1:visible").first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
});

test.describe("once a Gemini key is added", () => {
  test.use({ baseURL: "http://localhost:3101" });

  test("speaking transcribes on the server and deletes the audio", async ({ page, browserName }, info) => {
    test.skip(browserName !== "chromium", "Only Chromium can fake a microphone in tests.");
    await signIn(page, logEmailFor(info.project.name));
    const before = await mockStats(page);

    await page.getByRole("link", { name: "Log a meal" }).locator("visible=true").click();
    await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
    await expect(page.getByText(/Listening/)).toBeVisible();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Stop recording" }).click();

    await expect(page.getByRole("heading", { name: "Check your meal" })).toBeVisible();
    await expect(page.getByText(/60 grams of quick oats/)).toBeVisible();

    const after = await mockStats(page);
    expect(after.uploads).toBe(before.uploads + 1);
    expect(after.transcribes).toBe(before.transcribes + 1);
    expect(after.deletes).toBe(before.deletes + 1);
    expect(after.unknown).toEqual([]);
  });

  test("the mic explains itself when it can't record", async ({ page, browserName }, info) => {
    test.skip(browserName !== "chromium", "Uses a Chromium permission override.");
    await signIn(page, logEmailFor(info.project.name));
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("no", "NotAllowedError"));
    });
    await page.goto("/log");
    await page.getByRole("button", { name: "Start recording" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("Microphone access is off");
  });
});
