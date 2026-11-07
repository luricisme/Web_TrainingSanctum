import { test, expect } from "@playwright/test";

// Trivial placeholder (AC3): proves the Playwright browser-fixture suite
// runs against the real landing page (AD-12). Real E2E coverage (review
// flow, import, auth) lands alongside those features in later stories.
test("landing page renders in a browser", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Training Sanctum" })).toBeVisible();
});
