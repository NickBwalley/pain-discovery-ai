import { test, expect } from "@playwright/test";
test("anonymous research routes redirect to sign-in", async ({ page }) => {
  test.skip(
    process.env.LIVE_E2E === "true",
    "No-configuration checks run separately from opt-in live acceptance",
  );
  for (const path of [
    "/",
    "/projects",
    "/discoveries",
    "/problems",
    "/prospects",
    "/outreach",
    "/settings/sources",
    "/settings/account",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
});
test("setup screen fits a narrow viewport", async ({ page }) => {
  test.skip(
    process.env.LIVE_E2E === "true",
    "Requires missing web env; run separately from live acceptance",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("signup is public and links to sign-in", async ({ page }) => {
  test.skip(
    process.env.LIVE_E2E === "true",
    "Runs with the no-configuration browser checks",
  );
  await page.goto("/signup");
  await expect(
    page.getByRole("heading", { name: "Create your account." }),
  ).toBeVisible();
  await expect(
    page.getByText("Your research stays private to your account.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("OWNER ACCESS ONLY", { exact: true }),
  ).toHaveCount(0);
});
