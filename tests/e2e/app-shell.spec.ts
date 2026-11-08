import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

async function register(page: Page) {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Shell Test");
  await page.getByLabel("Email").fill(`e2e-shell-${randomUUID()}@example.test`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/review");
}

test("sidebar links open each placeholder page", async ({ page }) => {
  await register(page);
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const name of ["Review", "Classes", "Stats", "Settings"]) {
    await nav.getByRole("link", { name }).click();
    await expect(page).toHaveURL(new RegExp(`/${name.toLowerCase()}$`));
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(nav.getByRole("link", { name })).toHaveAttribute(
      "aria-current",
      "page"
    );
  }
});

test("logged-out visitors are redirected to /login from shell routes", async ({
  page,
}) => {
  for (const route of ["/", "/review", "/classes", "/stats", "/settings"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("a stale session cookie ends on /login without looping", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: "stale.invalid",
      url: "http://localhost:3100",
    },
  ]);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
});

test("logged-in users are redirected away from /login and /register", async ({
  page,
}) => {
  await register(page);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/review$/);
  await page.goto("/register");
  await expect(page).toHaveURL(/\/review$/);
});

test("theme choice persists across reloads", async ({ page }) => {
  await register(page);
  await page.goto("/settings");
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-theme", "light");

  await page.getByRole("radio", { name: "Light" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("radio", { name: "Light" })).toBeChecked();

  await page.getByRole("radio", { name: "Dark" }).click();
  await page.reload();
  await expect(html).not.toHaveAttribute("data-theme", "light");
});

test("sidebar is hidden below 640px", async ({ page }) => {
  await register(page);
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

// Visual check: screenshots land in test-results/screenshots for comparison
// against DESIGN.md and mockups/key-screens.html.
for (const theme of ["dark", "light"] as const) {
  for (const [label, width] of [["desktop", 1280], ["mobile", 600]] as const) {
    test(`settings screenshot (${theme}, ${label})`, async ({ page }) => {
      mkdirSync("test-results/screenshots", { recursive: true });
      await page.setViewportSize({ width, height: 800 });
      await register(page);
      await page.goto("/settings");
      await page.getByRole("radio", { name: theme === "light" ? "Light" : "Dark" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
      await page.screenshot({
        path: `test-results/screenshots/settings-${theme}-${label}.png`,
        animations: "disabled",
      });
    });
  }
}
