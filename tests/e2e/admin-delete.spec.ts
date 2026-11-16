import { test, expect, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { prisma } from "@training-sanctum/db";

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

test("an admin deletes a user through the modal and returns to the list", async ({
  page,
  browser,
}) => {
  const email = `e2e-delete-${randomUUID()}@example.test`;
  const user = await seedLoginUser(browser, email);
  try {
    await registerOrLogin(page, ADMIN_EMAIL);
    await page.goto(`/admin/users/${user.id}`);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(email);
    const confirm = dialog.getByRole("button", { name: "Delete", exact: true });
    const field = dialog.getByLabel(`Type ${email} to confirm`);
    await expect(confirm).toBeDisabled();
    await shoot(page, "admin-delete-modal");

    await field.fill(email.toUpperCase());
    await expect(confirm).toBeDisabled();
    await field.fill(`${email} `);
    await expect(confirm).toBeDisabled();
    await field.fill(email);
    await expect(confirm).toBeEnabled();
    await shoot(page, "admin-delete-modal-ready");

    await confirm.click();
    await page.waitForURL("/admin");
    await expect(page.getByRole("link", { name: email, exact: true })).toHaveCount(0);
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("an admin's own page has no Delete control; the modal fits at 390px", async ({
  page,
  browser,
}) => {
  await registerOrLogin(page, ADMIN_EMAIL);
  const me = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
  await page.goto(`/admin/users/${me.id}`);
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);

  const user = await seedLoginUser(browser, `e2e-delete-mob-${randomUUID()}@example.test`);
  try {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`/admin/users/${user.id}`);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
    await page.screenshot({
      path: "test-results/screenshots/admin-delete-modal-390.png",
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
