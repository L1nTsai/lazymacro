import { expect, test, type Page } from "@playwright/test";
import { TEST_PASSWORD, emailFor, runSql } from "./helpers";

async function signIn(page: Page, email: string, password = TEST_PASSWORD) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** The design rules every screen must meet: one page, and no shadow or glow. */
async function expectDesignRules(page: Page) {
  const problems = await page.evaluate(() => {
    const found: string[] = [];
    const viewport = window.innerHeight;
    const root = document.documentElement;
    if (root.scrollHeight > viewport + 1) found.push(`page is ${root.scrollHeight}px tall in a ${viewport}px screen`);
    if (root.scrollWidth > window.innerWidth + 1) found.push("page scrolls sideways");

    for (const el of document.querySelectorAll("main, main *, form, nav, nav *")) {
      if (el.closest("svg") || el.closest("[aria-hidden]") || (el as HTMLElement).inert) continue;
      const box = el.getBoundingClientRect();
      if (box.height > 0 && box.bottom > viewport + 1 && getComputedStyle(el).position !== "fixed") {
        found.push(`${el.tagName} "${el.textContent?.slice(0, 30)}" is cut off at ${Math.round(box.bottom)}px`);
      }
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

async function expectSlide(page: Page, act: () => Promise<void>) {
  const slidesRunning = () =>
    page.evaluate(
      () =>
        document.documentElement
          .getAnimations({ subtree: true })
          .filter((a) => /^(push|pop)-/.test((a as CSSAnimation).animationName)).length,
    );
  // A slide still finishing from the last step must not count as this one.
  await expect.poll(slidesRunning).toBe(0);
  await page.evaluate(() => {
    const w = window as unknown as { sawSlide: boolean };
    w.sawSlide = false;
    const check = () => {
      const names = document.documentElement
        .getAnimations({ subtree: true })
        .map((a) => (a as CSSAnimation).animationName);
      if (names.some((n) => /^(push|pop)-/.test(n))) w.sawSlide = true;
      requestAnimationFrame(check);
    };
    check();
  });
  await act();
  await expect.poll(() => page.evaluate(() => (window as unknown as { sawSlide: boolean }).sawSlide)).toBe(true);
}

const continueButton = (page: Page) => page.getByRole("button", { name: "Continue" });

test("the signed-out app only offers sign-in", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expectDesignRules(page);
  await page.goto("/me");
  await expect(page).toHaveURL(/\/sign-in$/);
  expect((await request.get("/api/foods/search?q=oats")).status()).toBe(401);
  expect((await request.get("/api/me/export")).status()).toBe(401);
});

test("sign-up refuses other email domains", async ({ page }) => {
  await page.goto("/sign-up");
  await expectDesignRules(page);
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

test("setup goes one page at a time, in imperial units", async ({ page }, info) => {
  const shot = (name: string) => page.screenshot({ path: `test-results/${info.project.name}-setup-${name}.png` });
  await signIn(page, emailFor(info.project.name));
  await expect(page).toHaveURL(/\/onboarding$/);

  // Step 1: Continue stays off until the details are complete.
  await expect(page.getByRole("heading", { name: "About you" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
  await expect(continueButton(page)).toBeDisabled();
  await page.getByLabel("Name").fill("Sam");
  await page.getByRole("radio", { name: "Male", exact: true }).click();
  await page.getByLabel("Age").fill("30");
  await page.getByLabel("Weight (lb)").fill("176");
  await page.getByLabel("Height (ft)").fill("5");
  await page.getByLabel("Height (in)").fill("11");
  await expectDesignRules(page);
  await shot("1-about");

  // Step 2, reached with a slide.
  await expectSlide(page, () => continueButton(page).click());
  await expect(page.getByRole("heading", { name: "Your goal" })).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveCount(0);
  await page.getByLabel("Activity").selectOption("moderate");
  await page.getByRole("radio", { name: "Lose" }).click();
  const selectBox = await page.getByLabel("Pace per week").boundingBox();
  expect(selectBox!.height).toBeGreaterThanOrEqual(44);
  await expectDesignRules(page);
  await shot("2-goal");

  // Going back keeps what was entered.
  await expectSlide(page, () => page.getByRole("button", { name: "Back" }).click());
  await expect(page.getByLabel("Name")).toHaveValue("Sam");
  await continueButton(page).click();

  // Step 3: 30, 5 ft 11 in, 176 lb, moderate, losing 1 lb a week.
  await expect(page.getByRole("heading", { name: "Your goal" })).toBeVisible();
  await continueButton(page).click();
  await expect(page.getByRole("heading", { name: "Daily targets" })).toBeVisible();
  await expect(page.getByLabel("Calories (kcal)")).toHaveValue("2264");
  await expect(page.getByLabel("Protein (g/lb)")).toHaveValue("1");
  await expect(page.getByText("176 g")).toBeVisible();
  // 25% of 2,264 kcal, then back: switching units keeps the same amount of fat.
  await expect(page.getByText("63 g")).toBeVisible();
  await page.getByRole("radio", { name: "g", exact: true }).click();
  await expect(page.getByLabel("Fat (g)")).toHaveValue("63");
  await page.getByRole("radio", { name: "%" }).click();
  await expect(page.getByLabel("Fat (%)")).toHaveValue("25");
  // Protein and fat that don't fit raise the calories once typing stops.
  await page.getByLabel("Calories (kcal)").fill("500");
  await expect(page.getByLabel("Calories (kcal)")).toHaveValue("500");
  await page.getByLabel("Fat (%)").focus();
  await expect(page.getByText("Calories raised to fit your protein and fat.")).toBeVisible();
  await expect(page.getByLabel("Calories (kcal)")).toHaveValue("938");
  // The most text this screen shows, which still has to fit the smallest phone.
  await expectDesignRules(page);
  await page.getByRole("button", { name: "Recalculate from my details" }).click();
  await expect(page.getByLabel("Calories (kcal)")).toHaveValue("2264");
  await expectDesignRules(page);
  await shot("3-targets");
  await continueButton(page).click();

  await expect(page.getByRole("heading", { name: "Foods to avoid" })).toBeVisible();
  await page.getByLabel("Allergies").fill("Peanuts, shellfish");
  await page.getByLabel("Foods you don't eat").fill("cilantro");
  await expectDesignRules(page);
  await shot("4-avoid");
  await continueButton(page).click();

  await expect(page.getByRole("heading", { name: "Pantry staples" })).toBeVisible();
  await expectDesignRules(page);
  await shot("5-staples");
  await expectSlide(page, () => page.getByRole("button", { name: "Finish" }).click());

  await expect(page.getByRole("heading", { name: "Hi, Sam" })).toBeVisible();
  await expect(page.getByText("2,264")).toBeVisible();
  await expect(page.getByText("kcal left")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Protein" })).toBeVisible();
  await expectDesignRules(page);
  await page.screenshot({ path: `test-results/${info.project.name}-today-light.png` });

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await page.emulateMedia({ colorScheme: "light" });

  for (const name of ["Today", "Fridge", "Ideas", "Me"]) {
    const box = await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name, exact: true }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("link", { name: "Log a meal" }).click();
  await expect(page.getByRole("heading", { name: "Log a meal" })).toBeVisible();
  await expectDesignRules(page);
  for (const [href, heading] of [["/fridge", "Fridge"], ["/ideas", "Ideas"]]) {
    await page.goto(href);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expectDesignRules(page);
  }
});

function logMeal(email: string, type: string, kcal: number, protein: number, carbs: number, fat: number, count = 1) {
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
    select meal.id, meal.user_id, (select id from public.foods limit 1), 'test food ' || n, 100, 'g', 100, ${kcal}, ${protein}, ${carbs}, ${fat}, 'verified'
    from meal, generate_series(1, ${count}) as n;
  `);
}

test("logged meals fill the ring and bars, and live on their own pages", async ({ page }, info) => {
  const email = emailFor(info.project.name);
  logMeal(email, "breakfast", 1100, 60, 130, 30);
  await signIn(page, email);
  await expect(page.getByText("1,164")).toBeVisible();
  await expect(page.getByText("kcal left")).toBeVisible();

  const ring = page.locator("svg circle").nth(1);
  await expect(ring).toHaveAttribute("stroke", "var(--data-calories)");
  const proteinFill = page.getByRole("progressbar", { name: "Protein" }).locator("div");
  await expect(proteinFill).toHaveAttribute("style", /width: 34\.09\d*%.*var\(--data-protein\)/);
  await expectDesignRules(page);
  await page.screenshot({ path: `test-results/${info.project.name}-today-filled-light.png` });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: `test-results/${info.project.name}-today-filled-dark.png` });
  await page.emulateMedia({ colorScheme: "light" });

  // Meals open on their own page, with a slide each way.
  await expectSlide(page, () => page.getByRole("link", { name: /Meals/ }).click());
  await expect(page.getByRole("heading", { name: "Meals" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await expectDesignRules(page);
  await expectSlide(page, () => page.getByRole("link", { name: "Back" }).click());
  await expect(page.getByRole("heading", { name: /^Hi,/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await page.getByRole("link", { name: /Meals/ }).click();
  await page.getByRole("link", { name: /Breakfast/ }).click();
  await expect(page.getByRole("heading", { name: "Breakfast" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Items" }).getByRole("link").first()).toContainText("1100 kcal");

  // A long meal pages instead of scrolling.
  logMeal(email, "breakfast", 1, 0, 0, 0, 25);
  await page.reload();
  await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
  await expectDesignRules(page);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("button", { name: "Previous" })).toBeEnabled();
  await expectDesignRules(page);

  await page.goto("/");
  logMeal(email, "lunch", 1300, 10, 10, 5);
  await page.reload();
  await expect(page.getByText("kcal over target")).toBeVisible();
  await expect(ring).toHaveAttribute("stroke", "var(--data-over)");
  await expect(page.locator("p[role=alert]")).toHaveCount(0);
  await page.screenshot({ path: `test-results/${info.project.name}-today-over.png` });
});

test("food search pages through real USDA foods", async ({ page }, info) => {
  await signIn(page, emailFor(info.project.name));
  await expect(page.getByRole("heading", { name: /^Hi,/ })).toBeVisible();
  await page.goto("/foods");
  await page.getByLabel("Food name").fill("chicken breast");
  await expect(page.getByText("Chicken, breast, boneless, skinless, raw")).toBeVisible();
  await expect(page.getByText("Verified").first()).toBeVisible();
  await expectDesignRules(page);
  await page.screenshot({ path: `test-results/${info.project.name}-search.png` });

  const first = await page.getByRole("listitem").first().textContent();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("listitem").first()).not.toHaveText(first!);
  await expectDesignRules(page);

  await page.getByLabel("Food name").fill("zzzzqqqq");
  await expect(page.getByText(/No foods match/)).toBeVisible();
});

test("settings live on short pages, and goals can be edited", async ({ page }, info) => {
  await signIn(page, emailFor(info.project.name));
  await expect(page.getByRole("heading", { name: /^Hi,/ })).toBeVisible();
  await page.goto("/me");
  await expectDesignRules(page);
  await page.screenshot({ path: `test-results/${info.project.name}-me.png` });

  await expectSlide(page, () => page.getByRole("link", { name: /Foods to avoid/ }).click());
  await expect(page.getByLabel("Allergies")).toHaveValue("peanuts, shellfish");
  await expect(page.getByLabel("Foods you don't eat")).toHaveValue("cilantro");
  await expectDesignRules(page);
  await page.getByLabel("Foods you don't eat").fill("cilantro, olives");
  await expectSlide(page, () => page.getByRole("button", { name: "Save" }).click());
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByRole("link", { name: /Foods to avoid/ })).toContainText("4");

  await page.getByRole("link", { name: /Units/ }).click();
  await page.getByLabel("Show ounces alongside grams").check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/me$/);

  await page.getByRole("link", { name: /Goals/ }).click();
  await expect(page.getByLabel("Weight (lb)")).toHaveValue("176");
  await expect(page.getByLabel("Height (ft)")).toHaveValue("5");
  await expect(page.getByLabel("Height (in)")).toHaveValue("11");
  await continueButton(page).click();
  await expect(page.getByRole("heading", { name: "Your goal" })).toBeVisible();
  await continueButton(page).click();
  await expect(page.getByLabel("Calories (kcal)")).toHaveValue("2264");
  await page.getByLabel("Calories (kcal)").fill("1000");
  await expect(page.getByText(/below the common daily minimum/)).toBeVisible();
  await expectDesignRules(page);
  await page.getByLabel("Calories (kcal)").fill("2100");
  await page.getByLabel("Protein (g/lb)").fill("0.9");
  await page.getByRole("radio", { name: "g", exact: true }).click();
  await page.getByLabel("Fat (g)").fill("70");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByRole("link", { name: /Goals/ })).toContainText("2,100 kcal");

  // The formula comes back as it was chosen, and so do the numbers it made.
  await page.getByRole("link", { name: /Goals/ }).click();
  await continueButton(page).click();
  await expect(page.getByRole("heading", { name: "Your goal" })).toBeVisible();
  await continueButton(page).click();
  await expect(page.getByLabel("Protein (g/lb)")).toHaveValue("0.9");
  await expect(page.getByLabel("Fat (g)")).toHaveValue("70");
  await expect(page.getByLabel("Calories (kcal)")).toHaveValue("2100");
  await expect(page.getByText("158 g")).toBeVisible();
  await page.goto("/me");

  await page.getByRole("link", { name: /Your data/ }).click();
  await expectDesignRules(page);
  const response = await page.request.get("/api/me/export");
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.profiles[0].display_name).toBe("Sam");
  expect(data.profiles[0].show_oz).toBe(true);
  expect(data.profiles[0].height_cm).toBe(180.3);
  expect(data.targets[0].kcal).toBe(2100);
  expect(data.user_exclusions.map((e: { term: string; kind: string }) => [e.term, e.kind]).sort()).toEqual([
    ["cilantro", "exclude"],
    ["olives", "exclude"],
    ["peanuts", "allergy"],
    ["shellfish", "allergy"],
  ]);
});

test("signing out ends access, and deleting removes the account", async ({ page }, info) => {
  await signIn(page, emailFor(info.project.name));
  await expect(page.getByRole("heading", { name: /^Hi,/ })).toBeVisible();
  await page.goto("/me/account");
  await expectDesignRules(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/me");
  await expect(page).toHaveURL(/\/sign-in$/);

  await signIn(page, emailFor(info.project.name));
  await expect(page.getByRole("heading", { name: /^Hi,/ })).toBeVisible();
  await page.goto("/me/account");
  await page.getByText("Delete account").click();
  await expectDesignRules(page);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("Type delete to confirm.");
  await page.getByLabel("Type delete to confirm").fill("delete");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/sign-in\?notice=deleted$/);

  await signIn(page, emailFor(info.project.name));
  await expect(page.locator("p[role=alert]")).toHaveText("That email or password is incorrect.");
});
