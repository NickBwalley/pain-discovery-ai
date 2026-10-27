import { test, expect } from "@playwright/test";

test("live user can select categories and receive a real completed search", async ({
  page,
}) => {
  test.skip(
    process.env.LIVE_E2E !== "true",
    "Requires configured Supabase and a running worker",
  );
  test.setTimeout(240000);
  const { E2E_USER_EMAIL: email, E2E_USER_PASSWORD: password } = process.env;
  if (!email || !password)
    throw new Error(
      "Set E2E_USER_EMAIL and E2E_USER_PASSWORD for a confirmed account",
    );
  await page.goto("/login");
  await page.getByLabel("Username or email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("button", { name: /Research categories/ }).click();
  await page.getByRole("checkbox", { name: "B2B & SaaS", exact: true }).check();
  await page
    .getByRole("checkbox", { name: "Startup founders", exact: true })
    .check();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\//);
  await expect(
    page.getByRole("heading", { name: "Your research.", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".research-progress")).toHaveCount(0, {
    timeout: 180000,
  });
  await expect(page.locator(".research-error")).toHaveCount(0);
  await expect(
    page.locator(".research-results, .research-empty"),
  ).toBeVisible();
  // Zero matching sources is a valid outcome of the real bounded HN sample.
});
