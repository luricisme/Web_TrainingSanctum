import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

const PASSWORD = "correct-horse-battery";
const ADMIN_EMAIL = "admin-e2e@example.test";

async function registerOrLogin(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Admin E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  try {
    await page.waitForURL("/review", { timeout: 8000 });
  } catch {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/review");
  }
}

// Story 7.1: Admin appears for admins only, and /admin is a 404 otherwise.
test("an admin sees Admin in the app bar and reaches /admin", async ({ page }) => {
  await registerOrLogin(page, ADMIN_EMAIL);
  const nav = page.getByRole("navigation", { name: "Main" }).first();
  await expect(nav.getByRole("link", { name: "Admin" })).toBeVisible();
  await nav.getByRole("link", { name: "Admin" }).click();
  await page.waitForURL("/admin");
  await expect(page.getByRole("heading", { name: "Admin", level: 1 })).toBeVisible();
});

test("an admin sees Admin in the dock on a phone and it opens /admin", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await registerOrLogin(page, ADMIN_EMAIL);
  await page.locator("[data-dock]").getByRole("link", { name: "Admin" }).click();
  await page.waitForURL("/admin");
});

test("a normal user sees no Admin item and /admin is a 404", async ({ page }) => {
  await registerOrLogin(page, `e2e-plain-${randomUUID()}@example.test`);
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  const res = await page.goto("/admin");
  expect(res?.status()).toBe(404);
});

// Visual check: screenshots land in test-results/screenshots.
for (const theme of ["dark", "light"] as const) {
  for (const width of [1280, 390]) {
    test(`admin page screenshots (${theme}, ${width}px)`, async ({ page }) => {
      mkdirSync("test-results/screenshots", { recursive: true });
      await page.setViewportSize({ width, height: 700 });
      await registerOrLogin(page, ADMIN_EMAIL);
      await page.goto("/admin");
      await expect(page.getByRole("heading", { name: "Admin", level: 1 })).toBeVisible();
      await page.evaluate((t) => {
        if (t === "light") document.documentElement.dataset.theme = "light";
        else delete document.documentElement.dataset.theme;
      }, theme);
      await page.screenshot({
        path: `test-results/screenshots/admin-${theme}-${width}.png`,
        animations: "disabled",
      });
    });
  }
}
