import { expect, test, type Page } from "@playwright/test";
import { TEST_PASSWORD, emailFor, runSql } from "./helpers";

async function signIn(page: Page, email: string, password = TEST_PASSWORD) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Every visible element, checked against the no shadow, no glow rule. */
async function expectNoShadows(page: Page) {
  const offenders = await page.evaluate(() =>
    [...document.querySelectorAll("*")]
      .filter((el) => {
        const style = getComputedStyle(el);
        const hasBoxShadow = style.boxShadow !== "none" && !/^(rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(, )?)+$/.test(style.boxShadow);
        return hasBoxShadow || style.textShadow !== "none" || style.filter !== "none" || style.backdropFilter !== "none" && style.backdropFilter !== "";
      })
      .map((el) => el.tagName),
  );
  expect(offenders).toEqual([]);
}

async function expectNoSidewaysScroll(page: Page) {
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
}

test("the signed-out app only offers sign-in", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/me");
  await expect(page).toHaveURL(/\/sign-in$/);
  expect((await request.get("/api/foods/search?q=oats")).status()).toBe(401);
  expect((await request.get("/api/me/export")).status()).toBe(401);
});

test("sign-up refuses other email domains", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Company email").fill("someone@outside.test");
  await page.getByLabel("Password").fill("long-enough-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("Use your company email address to sign up.");
  await expect(page).toHaveURL(/\/sign-up$/);
});

test("bad credentials and bad links end somewhere useful", async ({ page }, info) => {
  await signIn(page, emailFor(info.project.name), "wrong-password-here");
  await expect(page.locator("p[role=alert]")).toHaveText("That email or password is incorrect.");

  await page.goto("/auth/callback?code=not-a-real-code");
  await expect(page).toHaveURL(/\/sign-in\?notice=confirmed$/);

  await page.goto("/auth/callback?code=not-a-real-code&next=https://evil.test");
  await expect(page).toHaveURL(/localhost:3100\/sign-in/);

  await page.goto("/auth/confirm?token_hash=not-a-real-token&type=signup");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/sign-in\?notice=link-expired$/);
});

test("the app can be installed", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).status()).toBe(200);
  }
});

test("a new person goes from sign-in to their daily targets", async ({ page }, info) => {
  await signIn(page, emailFor(info.project.name));
  await expect(page).toHaveURL(/\/onboarding$/);

  // The worked example from targets.test.ts: 30, 180 cm, 80 kg, moderate, losing 0.5 kg.
  await page.getByLabel("Sex").selectOption("male");
  await page.getByLabel("Birth year").fill(String(new Date().getFullYear() - 30));
  await page.getByLabel("Height (cm)").fill("180");
  await page.getByLabel("Weight (kg)").fill("80");
  await page.getByLabel("Activity").selectOption("moderate");
  const selectBox = await page.getByLabel("Activity").boundingBox();
  expect(selectBox!.height).toBeGreaterThanOrEqual(44);
  await page.getByLabel("Goal").selectOption("lose");
  await expect(page.getByLabel("Calories (kcal)")).toHaveValue("2209");
  await expect(page.getByLabel("Protein (g)")).toHaveValue("128");

  await page.getByLabel("Allergies").fill("Peanuts, shellfish");
  await page.getByLabel("Foods you don't eat").fill("cilantro");
  await expectNoShadows(page);
  await expectNoSidewaysScroll(page);
  await page.screenshot({ path: `test-results/${info.project.name}-onboarding.png`, fullPage: true });
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByText("2,209")).toBeVisible();
  await expect(page.getByText("kcal left")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Protein" })).toBeVisible();
  await expectNoShadows(page);
  await expectNoSidewaysScroll(page);
  await page.screenshot({ path: `test-results/${info.project.name}-today-light.png` });

  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: `test-results/${info.project.name}-today-dark.png` });
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await page.emulateMedia({ colorScheme: "light" });

  // Tab bar targets are large enough for a thumb.
  for (const name of ["Today", "Fridge", "Ideas", "Me"]) {
    const box = await page.getByRole("navigation").getByRole("link", { name, exact: true }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("link", { name: "Log a meal" }).click();
  await expect(page.getByRole("heading", { name: "Log a meal" })).toBeVisible();
});

function logMeal(email: string, type: string, kcal: number, protein: number, carbs: number, fat: number) {
  runSql(`
    with me as (
      select u.id, (now() at time zone p.timezone)::date as today
      from auth.users u join public.profiles p on p.user_id = u.id
      where u.email = '${email}'
    ), meal as (
      insert into public.meals (user_id, eaten_on, meal_type, source, client_id)
      select id, today, '${type}', 'manual', gen_random_uuid() from me
      returning id, user_id
    )
    insert into public.log_entries (meal_id, user_id, food_id, phrase, quantity, unit, grams, kcal, protein_g, carbs_g, fat_g, confidence)
    select meal.id, meal.user_id, (select id from public.foods limit 1), 'test food', 100, 'g', 100, ${kcal}, ${protein}, ${carbs}, ${fat}, 'verified'
    from meal;
  `);
}

test("logged meals fill the ring and bars, and going over stays neutral", async ({ page }, info) => {
  const email = emailFor(info.project.name);
  logMeal(email, "breakfast", 1100, 60, 130, 30);
  await signIn(page, email);
  await expect(page.getByText("1,109")).toBeVisible();
  await expect(page.getByText("kcal left")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Breakfast" })).toBeVisible();

  const ring = page.locator("svg circle").nth(1);
  await expect(ring).toHaveAttribute("stroke", "var(--data-calories)");
  const proteinFill = page.getByRole("progressbar", { name: "Protein" }).locator("div");
  await expect(proteinFill).toHaveAttribute("style", /width: 46\.875%.*var\(--data-protein\)/);
  await expectNoShadows(page);
  await page.screenshot({ path: `test-results/${info.project.name}-today-filled-light.png` });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: `test-results/${info.project.name}-today-filled-dark.png` });
  await page.emulateMedia({ colorScheme: "light" });

  logMeal(email, "lunch", 1300, 10, 10, 5);
  await page.reload();
  await expect(page.getByText("191", { exact: true })).toBeVisible();
  await expect(page.getByText("kcal over target")).toBeVisible();
  await expect(ring).toHaveAttribute("stroke", "var(--data-over)");
  await expect(page.locator("p[role=alert]")).toHaveCount(0);
  await page.screenshot({ path: `test-results/${info.project.name}-today-over.png` });
});

test("food search finds real USDA foods", async ({ page }, info) => {
  await signIn(page, emailFor(info.project.name));
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await page.goto("/foods");
  await page.getByLabel("Food name").fill("chicken breast");
  await expect(page.getByText("Chicken, breast, boneless, skinless, raw")).toBeVisible();
  await expect(page.getByText("Verified").first()).toBeVisible();
  await expectNoShadows(page);
  await expectNoSidewaysScroll(page);
  await page.screenshot({ path: `test-results/${info.project.name}-search.png` });

  await page.getByLabel("Food name").fill("zzzzqqqq");
  await expect(page.getByText(/No foods match/)).toBeVisible();
});

test("goals can be edited and data exported", async ({ page }, info) => {
  await signIn(page, emailFor(info.project.name));
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await page.goto("/me");
  await expect(page.getByText("peanuts, shellfish")).toBeVisible();
  await expect(page.getByText("cilantro")).toBeVisible();
  await expectNoShadows(page);
  await page.screenshot({ path: `test-results/${info.project.name}-me.png`, fullPage: true });

  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByLabel("Calories (kcal)")).toHaveValue("2209");
  await page.getByLabel("Calories (kcal)").fill("1000");
  await expect(page.getByText(/below the common daily minimum/)).toBeVisible();
  await page.getByLabel("Calories (kcal)").fill("2100");
  await page.getByRole("button", { name: "Save goals" }).click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByText("2,100 kcal")).toBeVisible();

  const response = await page.request.get("/api/me/export");
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.profiles).toHaveLength(1);
  expect(data.targets[0].kcal).toBe(2100);
  expect(data.user_exclusions.map((e: { term: string; kind: string }) => [e.term, e.kind]).sort()).toEqual([
    ["cilantro", "exclude"],
    ["peanuts", "allergy"],
    ["shellfish", "allergy"],
  ]);
});

test("signing out ends access, and deleting removes the account", async ({ page }, info) => {
  await signIn(page, emailFor(info.project.name));
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await page.goto("/me");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/me");
  await expect(page).toHaveURL(/\/sign-in$/);

  await signIn(page, emailFor(info.project.name));
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await page.goto("/me");
  await page.getByText("Delete account").click();
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("Type delete to confirm.");
  await page.getByLabel("Type delete to confirm").fill("delete");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/sign-in\?notice=deleted$/);

  await signIn(page, emailFor(info.project.name));
  await expect(page.locator("p[role=alert]")).toHaveText("That email or password is incorrect.");
});
