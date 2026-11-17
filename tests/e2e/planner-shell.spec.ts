import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

async function register(page: Page) {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Planner Test");
  await page.getByLabel("Email").fill(`e2e-planner-${randomUUID()}@example.test`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/review");
}

// Story 8.1: the Planner nav item and its Tasks / Calendar / Pomodoro switcher.
test("Planner opens with Tasks selected and the switcher drives the URL", async ({ page }) => {
  await register(page);
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link")).toHaveCount(5);
  await nav.getByRole("link", { name: "Planner" }).click();
  await page.waitForURL("/planner");
  await expect(nav.getByRole("link", { name: "Planner" })).toHaveAttribute("aria-current", "page");
  const group = page.getByRole("radiogroup", { name: "Planner section" });
  await expect(group.getByRole("radio", { name: "Tasks" })).toBeChecked();

  await group.getByRole("radio", { name: "Calendar" }).click();
  await page.waitForURL("/planner/calendar");
  await expect(page.getByText("Coming with Epic 10.")).toBeVisible();
  await expect(nav.getByRole("link", { name: "Planner" })).toHaveAttribute("aria-current", "page");

  // Arrow keys move and select.
  await group.getByRole("radio", { name: "Calendar" }).focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForURL("/planner/pomodoro");
  await expect(page.getByText("Coming with Epic 9.")).toBeVisible();
  await expect(group.getByRole("radio", { name: "Pomodoro" })).toBeChecked();
  await page.keyboard.press("Home");
  await page.waitForURL("/planner");
  await expect(group.getByRole("radio", { name: "Tasks" })).toBeChecked();

  // The other keys: wrap in both directions, step back, End, and the vertical arrows.
  await page.keyboard.press("ArrowLeft");
  await page.waitForURL("/planner/pomodoro");
  await page.keyboard.press("ArrowRight");
  await page.waitForURL("/planner");
  await page.keyboard.press("End");
  await page.waitForURL("/planner/pomodoro");
  await page.keyboard.press("ArrowLeft");
  await page.waitForURL("/planner/calendar");
  await page.keyboard.press("ArrowUp");
  await page.waitForURL("/planner");
  await page.keyboard.press("ArrowDown");
  await page.waitForURL("/planner/calendar");

  // Reload keeps the segment.
  await group.getByRole("radio", { name: "Calendar" }).click();
  await page.waitForURL("/planner/calendar");
  await page.reload();
  await expect(group.getByRole("radio", { name: "Calendar" })).toBeChecked();
});

test("an unknown Planner segment is a 404, and the Planner needs a session", async ({ page, browser }) => {
  await register(page);
  const res = await page.goto("/planner/nope");
  expect(res?.status()).toBe(404);

  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto("/planner/calendar");
  await expect(anonPage).toHaveURL(/\/login/);
  await anon.close();
});

for (const theme of ["dark", "light"] as const) {
  for (const width of [1280, 390]) {
    test(`planner screenshots (${theme}, ${width}px)`, async ({ page }) => {
      mkdirSync("test-results/screenshots", { recursive: true });
      await page.setViewportSize({ width, height: 700 });
      await register(page);
      await page.goto("/planner");
      await expect(page.getByRole("heading", { level: 1, name: "Planner" })).toBeVisible();
      await page.evaluate((t) => {
        if (t === "light") document.documentElement.dataset.theme = "light";
        else delete document.documentElement.dataset.theme;
      }, theme);
      await page.screenshot({
        path: `test-results/screenshots/planner-${theme}-${width}.png`,
        animations: "disabled",
      });
    });
  }
}
