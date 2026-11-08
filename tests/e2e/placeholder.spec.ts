import { test, expect } from "@playwright/test";

// Trivial placeholder (AC3): proves the Playwright browser-fixture suite
// runs against the real app (AD-12). Logged out, `/` ends on the login page.
test("landing page renders in a browser", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
});
