import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { prisma } from "@training-sanctum/db";

async function register(page: Page): Promise<string> {
  const email = `e2e-classes-${randomUUID()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Classes E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/review");
  await page.goto("/classes");
  return email;
}

async function createClass(page: Page, name: string) {
  await page.getByRole("button", { name: "Create class" }).first().click();
  await page.getByLabel("Class name").fill(name);
  await page.getByRole("dialog").getByRole("button", { name: "Create class" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

async function openMenu(page: Page, className: string, item: "Rename" | "Delete") {
  await page.getByRole("button", { name: `Options for ${className}` }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test("empty state offers Create class", async ({ page }) => {
  await register(page);
  await expect(page.getByRole("heading", { level: 1, name: "Classes" })).toBeVisible();
  await expect(page.getByText("Create a class to start adding cards.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create class" })).toHaveCount(1);
});

test("create shows the row at once with 1 folder, 0 cards; blank name errors inline", async ({
  page,
}) => {
  await register(page);
  await page.getByRole("button", { name: "Create class" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Create class" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Enter a class name");
  await page.getByLabel("Class name").fill("IELTS");
  await page.getByRole("dialog").getByRole("button", { name: "Create class" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("IELTS", { exact: true })).toBeVisible();
  await expect(page.getByText("1 folder · 0 cards")).toBeVisible();
});

test("rename updates the list and the delete modal; Escape closes modals", async ({ page }) => {
  await register(page);
  await createClass(page, "Old name");

  await openMenu(page, "Old name", "Rename");
  await expect(page.getByLabel("Class name")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: "Options for Old name" })).toBeFocused();

  await openMenu(page, "Old name", "Rename");
  await page.getByLabel("Class name").fill("New name");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("New name", { exact: true })).toBeVisible();
  await expect(page.getByText("Old name")).toHaveCount(0);

  await openMenu(page, "New name", "Delete");
  await expect(page.getByRole("heading", { name: "Delete New name" })).toBeVisible();
});

test("delete via move removes the class and keeps the folders in the target", async ({ page }) => {
  const email = await register(page);
  await createClass(page, "Source");
  await createClass(page, "Target");

  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const source = await prisma.class.findFirstOrThrow({
    where: { userId: user.id, name: "Source" },
    include: { folders: true },
  });
  const extra = await prisma.folder.create({
    data: { name: "Extra", classId: source.id, userId: user.id },
  });
  for (const [folderId, term] of [
    [extra.id, "a"],
    [extra.id, "b"],
    [source.folders[0].id, "c"],
  ] as const) {
    await prisma.card.create({
      data: { term, definition: term, folderId, userId: user.id },
    });
  }
  await page.reload();

  await openMenu(page, "Source", "Delete");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Move folders to")).toHaveValue(/.+/);
  await dialog.getByRole("button", { name: "Move folders and delete class" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Source", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Target", { exact: true })).toBeVisible();
  await expect(page.getByText("2 folders · 3 cards")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Source", { exact: true })).toHaveCount(0);
  await expect(page.getByText("2 folders · 3 cards")).toBeVisible();
});

test("delete-all enables only after the exact name is typed", async ({ page }) => {
  await register(page);
  await createClass(page, "Doomed");
  await createClass(page, "Safe");

  await openMenu(page, "Doomed", "Delete");
  const dialog = page.getByRole("dialog");
  const destroy = dialog.getByRole("button", { name: "Delete class and everything in it" });
  await expect(destroy).toBeDisabled();
  await dialog.getByLabel(/Type Doomed to confirm/).fill("doomed");
  await expect(destroy).toBeDisabled();
  await dialog.getByLabel(/Type Doomed to confirm/).fill("Doomed");
  await expect(destroy).toBeEnabled();
  await destroy.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Doomed", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Safe", { exact: true })).toBeVisible();
});

test("the only class offers just the delete option", async ({ page }) => {
  await register(page);
  await createClass(page, "Solo");
  await openMenu(page, "Solo", "Delete");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Move folders to")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Delete class and everything in it" })
  ).toBeDisabled();
  await dialog.getByLabel(/Type Solo to confirm/).fill("Solo");
  await dialog.getByRole("button", { name: "Delete class and everything in it" }).click();
  await expect(page.getByText("Create a class to start adding cards.")).toBeVisible();
});

test("overflow menu is keyboard operable", async ({ page }) => {
  await register(page);
  await createClass(page, "Keys");
  const trigger = page.getByRole("button", { name: "Options for Keys" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(trigger).toBeFocused();
});

// Visual check: screenshots land in test-results/screenshots for comparison
// against DESIGN.md and mockups/key-screens.html.
for (const theme of ["dark", "light"] as const) {
  test(`classes screenshots (${theme})`, async ({ page }) => {
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await register(page);
    const setTheme = () =>
      page.evaluate((t) => {
        if (t === "light") document.documentElement.dataset.theme = "light";
        else delete document.documentElement.dataset.theme;
      }, theme);
    const shot = async (name: string) => {
      await setTheme();
      await page.screenshot({
        path: `test-results/screenshots/classes-${name}-${theme}.png`,
        animations: "disabled",
      });
    };

    await expect(page.getByText("Create a class to start adding cards.")).toBeVisible();
    await shot("empty");

    await createClass(page, "English Idioms");
    await createClass(page, "IELTS Academic");
    await createClass(page, "Business English");
    await setTheme();
    await page.getByRole("button", { name: "Options for IELTS Academic" }).hover();
    await shot("populated");

    await page.getByRole("button", { name: "Options for IELTS Academic" }).click();
    await shot("menu");
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("dialog").getByLabel(/to confirm/).fill("IELTS");
    await shot("delete-modal");

    await page.setViewportSize({ width: 600, height: 800 });
    await shot("delete-modal-mobile");
  });
}
