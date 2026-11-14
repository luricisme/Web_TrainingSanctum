import { test, expect, type Page } from "@playwright/test";
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

// Story 7.2: the Admin page lists users with their level.
for (const width of [1280, 390]) {
  test(`an admin sees the user table and can page (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await registerOrLogin(page, ADMIN_EMAIL);
    await page.goto("/admin");
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    for (const h of ["Email", "Created", "Status", "Realm", "Level", "XP"]) {
      await expect(table.getByRole("columnheader", { name: h })).toBeVisible();
    }
    await expect(table.getByRole("link").first()).toHaveAttribute(
      "href",
      /^\/admin\/users\/.+/
    );
    await expect(table.getByRole("columnheader", { name: "Backup" })).toBeVisible();
    await expect(table.getByRole("link", { name: /^Export backup for / }).first()).toHaveAttribute(
      "href",
      /^\/api\/admin\/users\/.+\/export$/
    );
    const exportLink = table.getByRole("link", { name: /^Export backup for / }).first();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      exportLink.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.json$/);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("navigation", { name: "Pagination" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);

    // An out-of-range page shows the empty state and a working Previous link.
    await page.goto("/admin?page=9999");
    await expect(page.getByText("No users on this page.")).toBeVisible();
    await page.getByRole("link", { name: "Previous" }).click();
    await expect(page).toHaveURL(/\/admin(\?page=\d+)?$/);
    await expect(page).not.toHaveURL(/page=9999|page=9998/);
    await expect(page.getByRole("table").getByRole("link").first()).toBeVisible();
  });
}

test("the Status column reads Disabled or Active per user", async ({ page }) => {
  const disabledEmail = `e2e-disabled-${randomUUID()}@example.test`;
  await prisma.user.create({
    data: { name: "Disabled E2E", email: disabledEmail, timezone: "UTC", disabled: true },
  });
  try {
    await registerOrLogin(page, ADMIN_EMAIL);
    await page.goto("/admin"); // newest first: the new user is on page 1
    const row = page.getByRole("row").filter({ hasText: disabledEmail });
    await expect(row).toContainText("Disabled");
    const adminRow = page.getByRole("row").filter({ hasText: ADMIN_EMAIL });
    if (await adminRow.count()) await expect(adminRow).toContainText("Active");
  } finally {
    await prisma.user.deleteMany({ where: { email: disabledEmail } });
  }
});

test("a normal user gets 404 on /admin", async ({ page }) => {
  await registerOrLogin(page, `e2e-plain-${randomUUID()}@example.test`);
  const res = await page.goto("/admin");
  expect(res?.status()).toBe(404);
});

for (const theme of ["dark", "light"] as const) {
  for (const width of [1280, 390]) {
    test(`user table screenshots (${theme}, ${width}px)`, async ({ page }) => {
      mkdirSync("test-results/screenshots", { recursive: true });
      await page.setViewportSize({ width, height: 800 });
      await registerOrLogin(page, ADMIN_EMAIL);
      await page.goto("/admin");
      await expect(page.getByRole("table")).toBeVisible();
      await page.evaluate((t) => {
        if (t === "light") document.documentElement.dataset.theme = "light";
        else delete document.documentElement.dataset.theme;
      }, theme);
      await page.screenshot({
        path: `test-results/screenshots/admin-users-${theme}-${width}.png`,
        animations: "disabled",
      });
    });
  }
}
