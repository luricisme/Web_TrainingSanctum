import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { prisma } from "@training-sanctum/db";

async function register(page: Page) {
  const email = `e2e-planner-cat-${randomUUID()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Planner Cat");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/review");
  return email;
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

test("create, rename, recolour and delete a category in the modal", async ({ page }) => {
  await register(page);
  await page.goto("/planner");
  await page.getByRole("button", { name: "Categories" }).click();
  const dialog = page.getByRole("dialog", { name: "Categories" });
  await expect(dialog.getByText("Create your first category")).toBeVisible();
  await shoot(page, "planner-categories-empty");

  await dialog.getByLabel("Category name").fill("Study");
  await dialog.getByRole("button", { name: "Create category" }).click();
  await expect(dialog.getByText("Study", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "New category" }).click();
  await dialog.getByLabel("Category name").fill("study");
  await dialog.getByRole("button", { name: "Create category" }).click();
  await expect(dialog.getByRole("alert")).toContainText("already have");
  await dialog.getByLabel("Category name").fill("Gym");
  await dialog.getByRole("button", { name: "Create category" }).click();
  await expect(dialog.getByText("Gym", { exact: true })).toBeVisible();
  await shoot(page, "planner-categories-list");

  await dialog.getByRole("button", { name: "Options for Gym" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await dialog.getByLabel("Category name").fill("Fitness");
  await dialog.getByLabel("Rose").check({ force: true });
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Fitness", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "Options for Fitness" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const del = page.getByRole("dialog", { name: "Delete Fitness" });
  await expect(del.getByText("This category has no tasks.")).toBeVisible();
  await del.getByRole("button", { name: "Delete category" }).click();
  await expect(dialog.getByText("Fitness", { exact: true })).toHaveCount(0);
});

test("deleting a category with tasks offers move first, then delete tasks too", async ({ page }) => {
  const email = await register(page);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const a = await prisma.taskCategory.create({ data: { userId: user.id, name: "Alpha", color: "SKY" } });
  await prisma.taskCategory.create({ data: { userId: user.id, name: "Beta", color: "MINT" } });
  await prisma.task.create({
    data: {
      userId: user.id,
      categoryId: a.id,
      title: "T",
      localDay: new Date("2026-11-17T00:00:00.000Z"),
      estimateMinutes: 25,
    },
  });

  await page.goto("/planner");
  await page.getByRole("button", { name: "Categories" }).click();
  const dialog = page.getByRole("dialog", { name: "Categories" });
  await dialog.getByRole("button", { name: "Options for Alpha" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const del = page.getByRole("dialog", { name: "Delete Alpha" });
  await expect(del.getByText("This category has 1 task.")).toBeVisible();
  await expect(del.getByLabel("Move tasks to")).toHaveValue(/.+/);
  await shoot(page, "planner-category-delete");
  await del.getByRole("button", { name: "Move tasks and delete category" }).click();
  await expect(dialog.getByText("Alpha", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("1 task")).toBeVisible();
});

test("the categories modals fit a 390px screen", async ({ page }) => {
  const email = await register(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/planner");
  await page.getByRole("button", { name: "Categories" }).click();
  await expect(page.getByText("Create your first category")).toBeVisible();
  await shoot(page, "planner-categories-390");
  await page.keyboard.press("Escape");

  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const a = await prisma.taskCategory.create({ data: { userId: user.id, name: "Alpha", color: "SKY" } });
  await prisma.taskCategory.create({ data: { userId: user.id, name: "Beta", color: "MINT" } });
  await prisma.task.create({
    data: {
      userId: user.id,
      categoryId: a.id,
      title: "T",
      localDay: new Date("2026-11-17T00:00:00.000Z"),
      estimateMinutes: 25,
    },
  });
  await page.reload();
  await page.getByRole("button", { name: "Categories" }).click();
  const dialog = page.getByRole("dialog", { name: "Categories" });
  await expect(dialog.getByText("Alpha", { exact: true })).toBeVisible();
  await expect(dialog.getByText("1 task")).toBeVisible();
  await shoot(page, "planner-categories-list-390");

  await dialog.getByRole("button", { name: "Options for Alpha" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const del = page.getByRole("dialog", { name: "Delete Alpha" });
  await expect(del.getByText("This category has 1 task.")).toBeVisible();
  await expect(del.getByLabel("Move tasks to")).toHaveValue(/.+/);
  await shoot(page, "planner-category-delete-390");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(overflow).toBe(false);
});
