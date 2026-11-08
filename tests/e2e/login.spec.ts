import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

const PASSWORD = "correct-horse-battery";

async function registerAndLogOut(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Login Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/review");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Log out" }).click();
  await page.waitForURL(/\/login$/);
}

test("register, log out, log in via the UI and land on /review", async ({ page }) => {
  const email = `e2e-login-${randomUUID()}@example.test`;
  await registerAndLogOut(page, email);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();

  await page.waitForURL("/review");
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
});

test("wrong password shows the generic alert and stays on /login", async ({
  page,
}) => {
  const email = `e2e-login-bad-${randomUUID()}@example.test`;
  await registerAndLogOut(page, email);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password-here");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Invalid" })).toHaveText("Invalid email or password.");
  await expect(page).toHaveURL(/\/login$/);
});

test("a 429 from sign-in shows the rate-limit message", async ({ page }) => {
  await page.route("**/api/auth/sign-in/email", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ message: "Too many requests" }),
    })
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("someone@example.test");
  await page.getByLabel("Password").fill("whatever-pw");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "Too many attempts" })
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("a 500 from sign-in shows the generic error, not invalid credentials", async ({
  page,
}) => {
  await page.route("**/api/auth/sign-in/email", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "boom" }),
    })
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("someone@example.test");
  await page.getByLabel("Password").fill("whatever-pw");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Something went wrong. Please try again." })
  ).toBeVisible();
  await expect(page.getByText("Invalid email or password.")).toHaveCount(0);
});

test("empty fields show field-level errors", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.locator("#email-error")).toBeVisible();
  await expect(page.locator("#password-error")).toBeVisible();
});

// Light/dark visual check: screenshots land in test-results/screenshots for
// comparison against DESIGN.md and /register.
for (const theme of ["dark", "light"] as const) {
  test(`login screen screenshot (${theme})`, async ({ page }) => {
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.goto("/login");
    await page.evaluate((t) => {
      if (t === "light") document.documentElement.dataset.theme = "light";
    }, theme);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await page.screenshot({
      path: `test-results/screenshots/login-${theme}.png`,
      fullPage: true,
      animations: "disabled",
    });
  });
}
