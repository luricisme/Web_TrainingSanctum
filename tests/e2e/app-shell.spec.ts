import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";

async function register(page: Page): Promise<string> {
  const email = `e2e-shell-${randomUUID()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Shell Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/review");
  return email;
}

test("sidebar links open each placeholder page", async ({ page }) => {
  await register(page);
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const name of ["Review", "Classes", "Cultivation", "Settings"]) {
    await nav.getByRole("link", { name }).click();
    await expect(page).toHaveURL(new RegExp(`/${name.toLowerCase()}$`));
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(nav.getByRole("link", { name })).toHaveAttribute(
      "aria-current",
      "page"
    );
  }
});

// The account menu at the right end of the app bar: name, realm under it, Settings and Log out.
test("the app bar shows the user's name with the realm under it, and opens Settings and Log out", async ({
  page,
}) => {
  await register(page);
  await page.goto("/classes");
  const bar = page.locator("[data-app-bar]");
  const trigger = bar.getByRole("button", { name: "Shell Test, Ngưng Khí · Tầng 1, 0 / 10 XP" });
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  // The name is on top, the realm label under it.
  const nameBox = (await trigger.getByText("Shell Test", { exact: true }).boundingBox())!;
  const realmBox = (await trigger.getByText("Ngưng Khí · Tầng 1", { exact: true }).boundingBox())!;
  expect(nameBox.y).toBeLessThan(realmBox.y);
  // The badge sits outside the Main nav.
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: /Shell Test/ })
  ).toHaveCount(0);

  // Opening shows Settings and Log out; Escape closes and returns focus.
  await expect(page.getByRole("menu")).toHaveCount(0);
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("menu", { name: "Account" });
  await expect(menu.getByRole("menuitem", { name: "Settings" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Log out" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // Clicking outside closes it too.
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(menu).toHaveCount(0);

  // Settings goes to the Settings page.
  await trigger.click();
  await menu.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

  // Log out ends the session.
  await trigger.click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/classes");
  await expect(page).toHaveURL(/\/login$/);
});

// spec-5-1: the Cultivation page stays reachable from the Main nav; there is no Stats page.
test("Cultivation opens from the Main nav, and there is no Stats page", async ({ page }) => {
  await register(page);
  await page.goto("/classes");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Cultivation" }).click();
  await expect(page).toHaveURL(/\/cultivation$/);
  await expect(page.getByRole("heading", { level: 1, name: "Cultivation" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Today's quests" })).toBeVisible();
  const stats = await page.goto("/stats");
  expect(stats?.status()).toBe(404);
});

test("a failed realm load hides the badge and leaves the nav working", async ({ page }) => {
  await register(page);
  await page.route("**/api/cultivation", (route) => route.fulfill({ status: 500, body: "" }));
  const failed = page.waitForResponse(
    (res) => res.url().endsWith("/api/cultivation") && res.status() === 500
  );
  await page.goto("/classes");
  await failed;
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toBeVisible();
  const aside = page.locator("[data-app-bar]");
  // The realm figures are gone, but the name and its menu stay, so Log out is still there.
  await expect(aside.getByRole("button", { name: /XP/ })).toHaveCount(0);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  const account = aside.getByRole("button", { name: "Shell Test", exact: true });
  await expect(account).toBeVisible();
  await account.click();
  await expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible();
  await page.keyboard.press("Escape");
  await nav.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test("the badge shows a mid-ladder stage and the final level", async ({ page }) => {
  const email = await register(page);
  const aside = page.locator("[data-app-bar]");

  await prisma.user.update({ where: { email }, data: { cultivationXp: 715 } });
  await page.goto("/classes");
  const mid = aside.getByRole("button", { name: "Shell Test, Trúc Cơ · Sơ kỳ, 40 / 100 XP" });
  await expect(mid).toBeVisible();
  await expect(mid.getByText("Trúc Cơ · Sơ kỳ", { exact: true })).toBeVisible();
  await expect(mid).toHaveAttribute("title", "40 / 100 XP");

  await prisma.user.update({ where: { email }, data: { cultivationXp: 115_309 } });
  await page.goto("/classes");
  const final = aside.getByRole("button", { name: "Shell Test, Đạp Thiên Cảnh, 115,309 XP" });
  await expect(final).toBeVisible();
  await expect(final).toHaveAttribute("title", "115,309 XP");
});

test("logged-out visitors are redirected to /login from shell routes", async ({
  page,
}) => {
  for (const route of ["/", "/review", "/classes", "/cultivation", "/settings"]) {
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
  // Light is the default.
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("radio", { name: "Light" })).toBeChecked();

  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(html).not.toHaveAttribute("data-theme", "light");

  await page.reload();
  await expect(html).not.toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();

  await page.getByRole("radio", { name: "Light" }).click();
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
});

// Story 6.3: below 640px the dock replaces the app bar.
test("the dock replaces the app bar below 640px", async ({ page }) => {
  await register(page);
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(page.locator("[data-app-bar]")).toBeHidden();
  await expect(page.getByRole("progressbar")).toBeHidden();

  const dock = page.locator("[data-dock]");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toBeVisible();
  await expect(dock).toBeVisible();
  await expect(nav.getByRole("link")).toHaveCount(4);
  await expect(nav.getByRole("link", { name: "Review" })).toHaveAttribute("aria-current", "page");

  for (const name of ["Cultivation", "Settings"]) {
    await nav.getByRole("link", { name }).click();
    await expect(page).toHaveURL(new RegExp(`/${name.toLowerCase()}$`));
    await expect(nav.getByRole("link", { name })).toHaveAttribute("aria-current", "page");
  }
  // Log out lives on Settings, now reachable on a phone.
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();

  // The last content is not covered by the dock.
  await page.goto("/settings");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const dockTop = (await dock.locator("ul").boundingBox())!.y;
  const lastBottom = (await page.getByRole("button", { name: "Log out" }).boundingBox())!;
  expect(lastBottom.y + lastBottom.height).toBeLessThanOrEqual(dockTop);

  // From 640px the app bar is back and the dock is gone.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(dock).toBeHidden();
  await expect(page.locator("[data-app-bar]")).toBeVisible();
});

// The Settings screenshots (both themes, 1280px and 390px) live in settings.spec.ts (spec-4-9).
