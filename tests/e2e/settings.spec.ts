import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { prisma } from "@training-sanctum/db";

async function register(page: Page): Promise<string> {
  const email = `e2e-settings-${randomUUID()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Settings E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/review");
  return email;
}

const savedSetting = async (email: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { email } })).studyDirections;

function controls(page: Page) {
  const group = page.getByRole("radiogroup", { name: "Study directions" });
  return {
    group,
    both: group.getByRole("radio", { name: "Both directions" }),
    t2d: group.getByRole("radio", { name: "Term → Definition" }),
    d2t: group.getByRole("radio", { name: "Definition → Term" }),
    saved: page.getByText("Saved", { exact: true }),
  };
}

// spec-4-9: the Study directions control on Settings (FR-18).
test("saves on change, says Saved, and the choice survives a reload", async ({ page }) => {
  const email = await register(page);
  await page.goto("/settings");
  const { group, both, t2d, saved } = controls(page);

  await expect(group).toHaveAccessibleDescription(
    "Which way cards are asked in Learn and Review. Turning a direction off keeps its progress."
  );
  await expect(both).toBeChecked();
  await expect(saved).toBeHidden();

  await t2d.click();
  await expect(t2d).toBeChecked();
  await expect(saved).toBeVisible();
  await expect.poll(() => savedSetting(email)).toBe("TERM_TO_DEFINITION");

  await page.reload();
  await expect(controls(page).t2d).toBeChecked();
  await expect(controls(page).both).not.toBeChecked();
});

test("arrow keys move the choice and save it; Tab reaches only the checked option", async ({
  page,
}) => {
  const email = await register(page);
  await page.goto("/settings");
  const { both, t2d, d2t, saved } = controls(page);
  await expect(both).toBeChecked();

  // Roving focus: one tab stop, on the checked option.
  await expect(both).toHaveAttribute("tabindex", "0");
  await expect(t2d).toHaveAttribute("tabindex", "-1");
  await both.focus();

  await page.keyboard.press("ArrowRight");
  await expect(t2d).toBeChecked();
  await expect(t2d).toBeFocused();
  await expect(saved).toBeVisible();
  await expect.poll(() => savedSetting(email)).toBe("TERM_TO_DEFINITION");

  await page.keyboard.press("ArrowDown");
  await expect(d2t).toBeChecked();
  await expect(d2t).toBeFocused();
  await expect.poll(() => savedSetting(email)).toBe("DEFINITION_TO_TERM");

  // Wraps around at either end.
  await page.keyboard.press("ArrowRight");
  await expect(both).toBeChecked();
  await page.keyboard.press("ArrowLeft");
  await expect(d2t).toBeChecked();
  await expect(d2t).toBeFocused();
  await expect.poll(() => savedSetting(email)).toBe("DEFINITION_TO_TERM");
});

test("a failed save rolls the choice back with an inline error and no Saved", async ({ page }) => {
  const email = await register(page);
  await page.goto("/settings");
  const { both, d2t, saved } = controls(page);
  await expect(both).toBeChecked();

  await page.route("**/api/settings", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 500, body: "" })
      : route.continue()
  );
  await d2t.click();

  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Could not save your study directions. Your previous choice is kept. Try again."
  );
  await expect(both).toBeChecked();
  await expect(d2t).not.toBeChecked();
  await expect(saved).toBeHidden();
  expect(await savedSetting(email)).toBe("BOTH");

  // The next save works again and clears the error.
  await page.unroute("**/api/settings");
  await d2t.click();
  await expect(d2t).toBeChecked();
  await expect(saved).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toBeHidden();
});

test("the Study directions selection is the only accent element on Settings", async ({ page }) => {
  await register(page);
  await page.goto("/settings");
  const { both } = controls(page);
  await expect(both).toBeChecked();
  // The Theme toggle's selected option is neutral.
  await expect(page.getByRole("radio", { name: "Dark" })).not.toHaveClass(/bg-accent/);
  await expect(page.locator("main .bg-accent")).toHaveCount(1);
  await expect(both).toHaveClass(/bg-accent/);
});

test("the options sit in a row at 1280px and stack full-width at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await register(page);
  await page.goto("/settings");
  const { group, both, t2d, d2t } = controls(page);
  await expect(both).toBeChecked();
  const top = async () => (await both.boundingBox())!.y;
  expect((await t2d.boundingBox())!.y).toBeCloseTo(await top(), 0);

  await page.setViewportSize({ width: 390, height: 800 });
  const groupBox = (await group.boundingBox())!;
  const boxes = [await both.boundingBox(), await t2d.boundingBox(), await d2t.boundingBox()];
  for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.y).toBeGreaterThan(boxes[i - 1]!.y);
  // Full width: the group spans the content column (390 - 2 x 16px gutter).
  expect(groupBox.width).toBeCloseTo(390 - 32, 0);
  // No horizontal scroll.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

// Visual check: screenshots land in test-results/screenshots for comparison
// against DESIGN.md and history/focus-indigo/mockups/key-screens.html.
for (const theme of ["dark", "light"] as const) {
  for (const width of [1280, 390] as const) {
    test(`settings screenshot (${theme}, ${width}px)`, async ({ page }) => {
      mkdirSync("test-results/screenshots", { recursive: true });
      await page.setViewportSize({ width, height: 800 });
      await register(page);
      await page.goto("/settings");
      await page.getByRole("radio", { name: theme === "light" ? "Light" : "Dark" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
      await expect(controls(page).both).toBeChecked();
      await page.screenshot({
        path: `test-results/screenshots/settings-${theme}-${width}.png`,
        animations: "disabled",
        fullPage: true,
      });
      await controls(page).t2d.click();
      await expect(controls(page).saved).toBeVisible();
      await page.screenshot({
        path: `test-results/screenshots/settings-${theme}-${width}-saved.png`,
        animations: "disabled",
        fullPage: true,
      });
    });
  }
}
