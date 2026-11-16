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

/** A user who can log in: registered through the UI in its own context, then left signed out. */
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

test("an admin disables a user through the modal, the user is refused, then enabled again", async ({
  page,
  browser,
}) => {
  const email = `e2e-disable-${randomUUID()}@example.test`;
  const user = await seedLoginUser(browser, email);
  try {
    await registerOrLogin(page, ADMIN_EMAIL);
    await page.goto(`/admin/users/${user.id}`);
    await page.getByRole("button", { name: "Disable", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(email);
    await expect(dialog).toContainText("signs");
    await expect(dialog).toContainText("blocks login");
    await shoot(page, "admin-disable-modal");

    // Cancel changes nothing.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).disabled).toBe(false);

    await page.getByRole("button", { name: "Disable", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Disabled. Login is blocked.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enable", exact: true })).toBeVisible();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).disabled).toBe(true);
    await shoot(page, "admin-disable-done");

    // The user's login page shows the refusal.
    const other = await browser.newContext();
    const userPage = await other.newPage();
    await userPage.goto("/login");
    await userPage.getByLabel("Email").fill(email);
    await userPage.getByLabel("Password").fill(PASSWORD);
    await userPage.getByRole("button", { name: "Log in" }).click();
    await expect(
      userPage.getByText("This account is disabled. Contact an administrator.")
    ).toBeVisible();
    await shoot(userPage, "login-disabled");

    // Enable acts at once and login works again.
    await page.getByRole("button", { name: "Enable", exact: true }).click();
    await expect(page.getByText("Disabled. Login is blocked.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Disable", exact: true })).toBeVisible();
    await userPage.getByRole("button", { name: "Log in" }).click();
    await userPage.waitForURL("/review");
    await other.close();
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("an admin's own page has no Disable button; the control fits at 390px", async ({
  page,
  browser,
}) => {
  await registerOrLogin(page, ADMIN_EMAIL);
  const me = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
  await page.goto(`/admin/users/${me.id}`);
  await expect(page.getByRole("button", { name: "Disable", exact: true })).toHaveCount(0);
  await expect(page.getByText("You cannot disable it.")).toBeVisible();

  const user = await seedLoginUser(browser, `e2e-disable-mob-${randomUUID()}@example.test`);
  try {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`/admin/users/${user.id}`);
    await page.getByRole("button", { name: "Disable", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
    await page.screenshot({
      path: "test-results/screenshots/admin-disable-modal-390.png",
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
