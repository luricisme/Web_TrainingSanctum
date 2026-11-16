import { test, expect, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { prisma } from "@training-sanctum/db";

const PASSWORD = "correct-horse-battery";
const NEW_PASSWORD = "brand-new-pass-1";
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

async function seedLoginUser(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerOrLogin(page, email);
  await context.close();
  return prisma.user.findUniqueOrThrow({ where: { email } });
}

async function shoot(page: Page, name: string) {
  mkdirSync("test-results/screenshots", { recursive: true });
  for (const theme of ["dark", "light"] as const) {
    await page.evaluate((t) => {
      if (t === "light") document.documentElement.dataset.theme = "light";
      else delete document.documentElement.dataset.theme;
    }, theme);
    await page.screenshot({
      path: `test-results/screenshots/${name}-${theme}.png`,
      animations: "disabled",
    });
  }
}

test("an admin resets a password through the modal and the user logs in with it", async ({
  page,
  browser,
}) => {
  const email = `e2e-reset-${randomUUID()}@example.test`;
  const user = await seedLoginUser(browser, email);
  try {
    await registerOrLogin(page, ADMIN_EMAIL);
    await page.goto(`/admin/users/${user.id}`);
    await page.getByRole("button", { name: "Reset password" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(email);
    const field = dialog.getByLabel("New password");
    await expect(field).toHaveAttribute("type", "password");
    await expect(field).toHaveAttribute("autocomplete", "new-password");
    await shoot(page, "admin-reset-modal");

    await field.fill("short");
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await expect(dialog.getByText("Password must be at least 8 characters.")).toBeVisible();
    await shoot(page, "admin-reset-modal-error");

    await field.fill(NEW_PASSWORD);
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Password reset. They were signed out.")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await shoot(page, "admin-reset-done");
    expect(page.url()).not.toContain(NEW_PASSWORD);

    const other = await browser.newContext();
    const userPage = await other.newPage();
    await userPage.goto("/login");
    await userPage.getByLabel("Email").fill(email);
    await userPage.getByLabel("Password").fill(PASSWORD);
    await userPage.getByRole("button", { name: "Log in" }).click();
    await expect(userPage).toHaveURL(/\/login/);
    await userPage.getByLabel("Password").fill(NEW_PASSWORD);
    await userPage.getByRole("button", { name: "Log in" }).click();
    await userPage.waitForURL("/review");
    await other.close();
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("an admin's own page has no Reset password control; the modal fits at 390px", async ({
  page,
  browser,
}) => {
  await registerOrLogin(page, ADMIN_EMAIL);
  const me = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
  await page.goto(`/admin/users/${me.id}`);
  await expect(page.getByRole("button", { name: "Reset password" })).toHaveCount(0);

  const user = await seedLoginUser(browser, `e2e-reset-mob-${randomUUID()}@example.test`);
  try {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`/admin/users/${user.id}`);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
    await page.screenshot({
      path: "test-results/screenshots/admin-reset-modal-390.png",
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
