import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { prisma } from "@training-sanctum/db";

async function register(page: Page) {
  const email = `e2e-planner-task-${randomUUID()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Planner Task");
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

test("first task: inline category, add, tick done once, edit and delete", async ({ page }) => {
  const email = await register(page);
  await page.goto("/planner");
  await expect(page.getByText("Nothing planned for today.")).toBeVisible();
  await shoot(page, "planner-tasks-empty");

  await page.getByRole("button", { name: "+ Add task" }).click();
  const dialog = page.getByRole("dialog", { name: "Add task" });
  await expect(dialog.getByText("Create a category")).toBeVisible();
  await dialog.getByLabel("Category name").fill("Study");
  await dialog.getByRole("button", { name: "Create category" }).click();

  await dialog.getByRole("button", { name: "Add task" }).click();
  await expect(dialog.getByRole("alert").first()).toBeVisible();
  await dialog.getByLabel("Title").fill("Read chapter 3");
  await dialog.getByLabel("Start time (optional)").fill("09:30");
  await dialog.getByLabel("Estimate (minutes)").fill("4");
  await dialog.getByRole("button", { name: "Add task" }).click();
  await expect(dialog.getByText(/Enter whole minutes/).first()).toBeVisible();
  await dialog.getByLabel("Estimate (minutes)").fill("25");
  await shoot(page, "planner-tasks-modal");
  await dialog.getByRole("button", { name: "Add task" }).click();

  const row = page.getByRole("listitem").filter({ hasText: "Read chapter 3" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("0 / 25");
  await expect(row).toContainText("09:30");

  await page.getByRole("button", { name: "+ Add task" }).click();
  const second = page.getByRole("dialog", { name: "Add task" });
  await second.getByLabel("Title").fill("Plan the week");
  await second.getByLabel("Estimate (minutes)").fill("30");
  await second.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Plan the week" })).toBeVisible();
  await shoot(page, "planner-tasks-list");

  const badge = page.getByRole("button", { name: /Planner Task, .* XP$/ });
  const before = await badge.getAttribute("aria-label");
  expect(before).toContain("0 / 10 XP");
  await row.getByRole("checkbox").check();
  await expect(row.getByRole("checkbox")).toBeChecked();
  // The Realm badge updates without a reload.
  await expect(badge).toHaveAttribute("aria-label", /5 \/ 10 XP$/);
  expect(await badge.getAttribute("aria-label")).not.toBe(before);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await expect
    .poll(async () => (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).cultivationXp)
    .toBe(5);
  await row.getByRole("checkbox").uncheck();
  await expect(row.getByRole("checkbox")).not.toBeChecked();
  await row.getByRole("checkbox").check();
  await expect(row.getByRole("checkbox")).toBeChecked();
  expect(await prisma.xpEvent.count({ where: { userId: user.id, reason: "TASK_DONE" } })).toBe(1);
  await shoot(page, "planner-tasks-done");

  await page.getByRole("button", { name: "Options for Plan the week" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Edit task" });
  await edit.getByLabel("Title").fill("Plan next week");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Plan next week")).toBeVisible();

  await page.getByRole("button", { name: "Options for Plan next week" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const del = page.getByRole("dialog", { name: "Delete task" });
  await expect(del).toContainText("Plan next week");
  await shoot(page, "planner-tasks-delete");
  await del.getByRole("button", { name: "Delete task" }).click();
  await expect(page.getByText("Plan next week")).toHaveCount(0);
});

test("day arrows move between days and the layout fits 390px", async ({ page }) => {
  await register(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/planner");
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.getByText(/Nothing planned for/)).toBeVisible();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByText("Nothing planned for today.")).toBeVisible();
  await shoot(page, "planner-tasks-390");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test("a task over its estimate shows actual / estimate in warning", async ({ page }) => {
  const email = await register(page);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const today = await page.evaluate(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const category = await prisma.taskCategory.create({
    data: { userId: user.id, name: "Deep work", color: "SKY" },
  });
  await prisma.task.create({
    data: {
      userId: user.id,
      categoryId: category.id,
      title: "Over budget",
      localDay: new Date(`${today}T00:00:00.000Z`),
      estimateMinutes: 25,
      loggedMinutes: 30,
    },
  });
  await page.goto("/planner");
  await expect(page.getByText("30 / 25")).toHaveClass(/text-warning/);
});

test("the row menu of a single task is not clipped by the list", async ({ page }) => {
  const email = await register(page);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const today = await page.evaluate(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const category = await prisma.taskCategory.create({
    data: { userId: user.id, name: "Deep work", color: "SKY" },
  });
  await prisma.task.create({
    data: {
      userId: user.id,
      categoryId: category.id,
      title: "Only task",
      localDay: new Date(`${today}T00:00:00.000Z`),
      estimateMinutes: 25,
    },
  });
  await page.goto("/planner");
  await page.getByRole("button", { name: "Options for Only task" }).click();
  const del = page.getByRole("menuitem", { name: "Delete" });
  await expect(del).toBeVisible();
  // A clipped menu is still "visible" to Playwright; check what is really on top.
  const reachable = await del.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit === el || el.contains(hit);
  });
  expect(reachable).toBe(true);
  await shoot(page, "planner-tasks-menu");
});

test("overdue strip shows, moves tasks to today and disappears", async ({ page }) => {
  const email = await register(page);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const category = await prisma.taskCategory.create({
    data: { userId: user.id, name: "Study", color: "SKY" },
  });
  for (const [title, day] of [
    ["Old reading", "2020-01-02"],
    ["Older notes", "2020-01-01"],
  ] as const) {
    await prisma.task.create({
      data: {
        userId: user.id,
        categoryId: category.id,
        title,
        localDay: new Date(`${day}T00:00:00.000Z`),
        estimateMinutes: 25,
      },
    });
  }
  await page.goto("/planner");
  await expect(page.getByText("2 overdue")).toBeVisible();
  await shoot(page, "planner-overdue-1280");
  await page.setViewportSize({ width: 390, height: 844 });
  await shoot(page, "planner-overdue-390");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.getByRole("button", { name: "Move all to today" }).click();
  await expect(page.getByText(/overdue/)).toHaveCount(0);
  await expect(page.getByRole("listitem").filter({ hasText: "Old reading" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Older notes" })).toBeVisible();
});
