import { expect, test, type Page } from "@playwright/test";
import { TEST_PASSWORD, emailFor, logEmailFor, runSql } from "./helpers";

/** The same rules as on phones, at a small laptop window. */
async function expectDesignRules(page: Page) {
  const problems = await page.evaluate(() => {
    const found: string[] = [];
    const root = document.documentElement;
    if (root.scrollHeight > window.innerHeight + 1) found.push(`page is ${root.scrollHeight}px tall in a ${window.innerHeight}px window`);
    if (root.scrollWidth > window.innerWidth + 1) found.push("page scrolls sideways");
    for (const el of document.querySelectorAll("main, main *, nav, nav *")) {
      if (el.closest("svg") || el.closest("[aria-hidden]")) continue;
      const box = el.getBoundingClientRect();
      if (box.height > 0 && box.bottom > window.innerHeight + 1) found.push(`${el.tagName} "${el.textContent?.slice(0, 30)}" is cut off at ${Math.round(box.bottom)}px`);
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

/** Pages fade on desktop, and shots taken mid-fade show both pages. */
const settled = (page: Page) =>
  expect.poll(() => page.evaluate(() => document.documentElement.getAnimations({ subtree: true }).length)).toBe(0);

const EMAIL = logEmailFor("desktop");

test.beforeAll(() => {
  runSql(`
    delete from public.meals where user_id = (select id from auth.users where email = '${EMAIL}');
    with me as (select id from auth.users where email = '${EMAIL}'),
    meal as (
      insert into public.meals (user_id, eaten_on, meal_type, source, client_id)
      select me.id, (now() at time zone 'UTC')::date, 'lunch', 'manual', gen_random_uuid() from me returning id, user_id
    )
    insert into public.log_entries (meal_id, user_id, food_id, quantity, unit, grams, kcal, protein_g, carbs_g, fat_g, confidence)
    select meal.id, meal.user_id, (select id from public.foods where name = 'Chicken, breast, boneless, skinless, raw' limit 1), 100, 'g', 100, 112, 22, 0, 2, 'verified' from meal;
  `);
});

test.beforeEach(async ({ page }) => {
  await page.goto("/sign-in");
  await expectDesignRules(page);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /^Hi,/ })).toBeVisible();
});

test("the sidebar replaces the tab bar and stays on every page", async ({ page }, info) => {
  const sidebar = page.getByRole("navigation", { name: "Main" });
  const box = (await sidebar.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.height).toBe(700);
  expect(box.width).toBeLessThan(300);

  for (const path of ["/", "/fridge", "/ideas", "/foods", "/me", "/me/goals", "/me/account", "/meals", "/history", "/log"]) {
    await page.goto(path);
    await expect(sidebar).toBeVisible();
    await expectDesignRules(page);
  }
  await page.goto("/");
  await page.screenshot({ path: `test-results/${info.project.name}-today.png` });
});

test("Today shows the numbers and meals beside the month", async ({ page }) => {
  const ring = (await page.getByText("kcal left", { exact: true }).boundingBox())!;
  await expect(page.getByRole("region", { name: "Today's meals" }).getByRole("link", { name: /^Lunch/ })).toContainText(" kcal");
  const month = page.getByRole("region", { name: "This month" });
  await expect(month.locator("[aria-current=date]")).toHaveAttribute("aria-label", / kcal$/);
  expect((await month.boundingBox())!.x).toBeGreaterThan(ring.x);
});

test("Me shows the menu beside the chosen setting", async ({ page }, info) => {
  await page.goto("/me");
  await expect(page.getByText("Choose a setting.")).toBeVisible();
  await page.getByRole("link", { name: /Foods to avoid/ }).click();
  await expect(page.getByLabel("Allergies")).toBeVisible();
  await expect(page.getByRole("link", { name: /Goals/ })).toBeVisible();
  await settled(page);
  await expectDesignRules(page);

  // The menu stays exactly where it was.
  const menu = (await page.getByRole("link", { name: /Goals/ }).boundingBox())!;
  expect(menu.x).toBeLessThan(400);
  expect(menu.x).toBeGreaterThan(200);
  await page.screenshot({ path: `test-results/${info.project.name}-me.png` });

  // Saving updates the menu that stays on screen.
  await page.getByLabel("Allergies").fill("peanuts, soy, sesame");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("link", { name: /Foods to avoid/ })).toContainText("3");
});

test("History shows the selected day beside the week", async ({ page }, info) => {
  await page.goto("/history");
  const day = page.getByRole("region", { name: "Selected day" });
  await expect(day).toContainText("Lunch: Chicken, breast");
  await expectDesignRules(page);
  await page.screenshot({ path: `test-results/${info.project.name}-history.png` });
  await page.getByRole("list", { name: "Daily totals" }).getByRole("link", { name: /Today/ }).locator("visible=true").click();
  await expect(day).toContainText("112 kcal");
});

test("logging a meal works from the sidebar", async ({ page }, info) => {
  await page.goto("/log");
  await page.getByRole("button", { name: "Type instead" }).click();
  await page.getByLabel("What you ate").fill("Today I ate 60 grams of quick oats with 300 grams of milk and one scoop of whey protein.");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Check your meal" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit Cereals, oats/ })).toContainText("227 kcal");
  await settled(page);
  await expect(page.getByRole("button", { name: "Next" })).toHaveCount(0);
  await expectDesignRules(page);
  await page.screenshot({ path: `test-results/${info.project.name}-review.png` });
});

test("signing out clears the cache, so the next person sees nothing of the last", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Me", exact: true }).click();
  await page.getByRole("link", { name: /Account/ }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  // Stay in the same tab, so anything cached would still be in memory.
  await page.getByLabel("Email").fill(emailFor("desktop"));
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByText("Logger")).toHaveCount(0);
});

test("saving a setting shows on a cached page", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Me", exact: true }).click();
  await page.getByRole("link", { name: /Pantry staples/ }).click();
  await nav.getByRole("link", { name: "Today", exact: true }).click();
  await nav.getByRole("link", { name: "Me", exact: true }).click();
  const row = page.getByRole("link", { name: /Foods to avoid/ });
  await row.click();
  await page.getByLabel("Allergies").fill("peanuts");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(row).toContainText("1");
  await nav.getByRole("link", { name: "Today", exact: true }).click();
  await nav.getByRole("link", { name: "Me", exact: true }).click();
  await expect(row).toContainText("1");
});

test("a developer gets Approvals in the sidebar", async ({ page }) => {
  runSql(`insert into app_private.developers (user_id) select id from auth.users where email = '${EMAIL}'`);
  try {
    // Signed in before this access existed, so the sidebar needs a fresh load.
    await page.goto("/");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Approvals" }).click();
    await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();
    await settled(page);
    await expectDesignRules(page);
    await page.screenshot({ path: "test-results/desktop-approvals.png" });
  } finally {
    runSql(`delete from app_private.developers where user_id = (select id from auth.users where email = '${EMAIL}')`);
  }
});
