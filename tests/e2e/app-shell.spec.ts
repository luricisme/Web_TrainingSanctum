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

// spec-5-1: the Realm badge at the sidebar bottom (FR-12).
test("the sidebar shows the Realm badge, linking to Cultivation", async ({ page }) => {
  await register(page);
  await page.goto("/classes");
  const badge = page.locator("[data-app-bar]").getByRole("link", {
    name: "Ngưng Khí · Tầng 1, 0 / 10 XP",
  });
  await expect(badge).toBeVisible();
  await expect(badge.getByRole("progressbar", { name: "Ngưng Khí · Tầng 1" })).toHaveAttribute(
    "aria-valuemax",
    "10"
  );
  await expect(badge.getByText("0 / 10 XP")).toBeVisible();
  // The badge sits outside the Main nav, below it.
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /Ngưng Khí/ })
  ).toHaveCount(0);

  await badge.click();
  await expect(page).toHaveURL(/\/cultivation$/);
  await expect(page.getByRole("heading", { level: 1, name: "Cultivation" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Today's quests" })).toBeVisible();
  // There is no Stats page any more.
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
  await expect(aside.getByRole("link", { name: /XP/ })).toHaveCount(0);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await nav.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test("the badge shows a mid-ladder stage and the final level", async ({ page }) => {
  const email = await register(page);
  const aside = page.locator("[data-app-bar]");

  await prisma.user.update({ where: { email }, data: { cultivationXp: 715 } });
  await page.goto("/classes");
  const mid = aside.getByRole("link", { name: "Trúc Cơ · Sơ kỳ, 40 / 100 XP" });
  await expect(mid).toBeVisible();
  await expect(mid.getByText("40 / 100 XP")).toBeVisible();
  const midBar = mid.getByRole("progressbar", { name: "Trúc Cơ · Sơ kỳ" });
  await expect(midBar).toHaveAttribute("aria-valuenow", "40");
  await expect(midBar).toHaveAttribute("aria-valuemax", "100");

  await prisma.user.update({ where: { email }, data: { cultivationXp: 115_309 } });
  await page.goto("/classes");
  const final = aside.getByRole("link", { name: "Đạp Thiên Cảnh, 115,309 XP" });
  await expect(final).toBeVisible();
  const finalBar = final.getByRole("progressbar", { name: "Đạp Thiên Cảnh" });
  await expect(finalBar).toHaveAttribute("aria-valuenow", "1");
  await expect(finalBar).toHaveAttribute("aria-valuemax", "1");
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
